/**
 * Headless twin engine. Owns the robot state and steps it forward.
 *
 * Deliberately free of Three.js: this is the "firmware" of the twin. The renderer reads
 * `getState()`. Same boundary the real ESP will have.
 *
 * Every tick:
 *   1. a controller produces 8 joint angles (gait planner, action player, servo test, blend)
 *   2. forward kinematics gives the four feet in the body frame
 *   3. the body rests on its supporting feet (height, pitch, roll)
 *   4. planted feet do not slip, which fixes x, z and yaw (motion emerges from the legs)
 *   5. collision pushes the body out of obstacles (feet slip), the sonar ray is cast
 */

import {
  CMD_KIND,
  CONTROL_MODE,
  GAIT,
  LEGS,
  type Command,
  type ControlMode,
  type Gait,
  type Telemetry,
} from "../protocol";
import { NEUTRAL_POSE, clamp, toDegrees, type Vec3 } from "./spiderModel";
import { clampJoints, feetFromJoints } from "./legKinematics";
import { GaitPlanner, WALK_POSE, commandToTwist, type GaitStep } from "./gait";
import {
  fitPlanar,
  fitSupport,
  restOnBelly,
  settleOnFeet,
  tiltPoint,
  toWorld,
  type Anchor,
  type BodyPose,
} from "./bodyPose";
import { ACTIONS, ActionPlayer, isActionName, type ActionName } from "./actions";
import { resolveCollision, senseDistance } from "./world";

/** Seconds without operator commands before `manual` falls back to `auto`. */
export const OPERATOR_IDLE_TIMEOUT_S = 5;
/** Time to blend from a held pose back to the neutral stance. */
export const BLEND_S = 0.5;
/** MG90S no-load speed is ~0.1 s / 60°; the servo test slews at that rate. */
export const SERVO_SLEW = (60 * Math.PI) / 180 / 0.1;
/** Body twist ramps (m/s², rad/s²) so the legs never see a step change. */
const ACCEL = 0.1;
const YAW_ACCEL = 1.0;

/**
 * rest: neutral stance held still. gait: walking planner. action / hold: preset action and its
 * final pose. blend: joint-space move between stances. servo: servo test.
 */
export type Controller = "rest" | "gait" | "action" | "hold" | "blend" | "servo";

export interface RobotState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Femur-plane height above the floor, meters. */
  h: number;
  /** Radians; positive lifts the nose. */
  pitch: number;
  /** Radians; positive lifts the right side. */
  roll: number;
  /** Operator command, -1..1. */
  forward: number;
  turn: number;
  gait: Gait;
  /** Who drives the body: the brain (auto) or the operator (manual). */
  mode: ControlMode;
  /** Seconds since the last operator command. */
  operatorIdle: number;
  phase: number;
  /** Ultrasonic reading in meters, null when no echo. */
  distance: number | null;
  /** 8 joint angles, radians, protocol order. */
  joints: number[];
  /** Feet in world space, protocol leg order. */
  feet: Vec3[];
  /** Which feet carry the body. */
  contact: boolean[];
  controller: Controller;
  action: ActionName | null;
  actionProgress: number;
  /** True while the body is pushed by an obstacle. */
  collided: boolean;
  /** Measured body speed (m/s) and yaw rate (rad/s). */
  speed: number;
  yawRate: number;
  /** Commanded body twist after ramping. */
  v: number;
  w: number;
}

export interface WorldConfig {
  /** When false the ultrasonic sensor reports no echo. */
  sensor: boolean;
  /** When false the body ignores obstacles. */
  collision: boolean;
}

export class TwinEngine {
  private state: RobotState;
  private world: WorldConfig = { sensor: true, collision: true };
  private planner = new GaitPlanner(WALK_POSE);
  private player: ActionPlayer | null = null;
  private blend: { from: number[]; to: readonly number[]; t: number; next: "rest" | "gait" } | null = null;
  private servoTargets: number[] = [...NEUTRAL_POSE];
  private anchors: (Anchor | null)[] = [null, null, null, null];

  constructor() {
    this.state = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      h: 0,
      pitch: 0,
      roll: 0,
      forward: 0,
      turn: 0,
      gait: GAIT.REST,
      mode: CONTROL_MODE.AUTO,
      operatorIdle: 0,
      phase: 0,
      distance: null,
      joints: [...NEUTRAL_POSE],
      feet: [],
      contact: [true, true, true, true],
      controller: "rest",
      action: null,
      actionProgress: 0,
      collided: false,
      speed: 0,
      yawRate: 0,
      v: 0,
      w: 0,
    };
    this.placeBody(NEUTRAL_POSE, null, false);
  }

  setWorld(world: Partial<WorldConfig>): void {
    this.world = { ...this.world, ...world };
  }

  /**
   * Apply an operator command. Every valid command restarts the idle timer; payloads come off
   * the wire unvalidated, so unknown kinds and invalid values are ignored without touching
   * any state (they are not operator activity either).
   */
  apply(cmd: Command): void {
    if (!isValidCommand(cmd)) return;
    this.state.operatorIdle = 0;
    switch (cmd.kind) {
      case CMD_KIND.MODE:
        this.state.mode = cmd.mode;
        break;
      case CMD_KIND.MOVE: {
        const forward = Number(cmd.forward);
        const turn = Number(cmd.turn);
        this.state.mode = CONTROL_MODE.MANUAL;
        if (this.state.controller === "servo") break;
        this.leaveAction();
        this.state.forward = clamp(forward, -1, 1);
        this.state.turn = clamp(turn, -1, 1);
        if (this.state.gait === GAIT.REST) this.state.gait = GAIT.TETRAPOD;
        break;
      }
      case CMD_KIND.STOP:
        this.state.forward = 0;
        this.state.turn = 0;
        this.state.gait = GAIT.REST;
        if (this.state.controller !== "servo") this.leaveAction();
        break;
      case CMD_KIND.GAIT:
        if (this.state.controller === "servo") break;
        this.leaveAction();
        this.state.gait = cmd.gait;
        break;
      case CMD_KIND.POSE:
        if (this.state.controller === "servo") break;
        this.state.forward = 0;
        this.state.turn = 0;
        this.state.v = 0;
        this.state.w = 0;
        this.blend = null;
        this.player = new ActionPlayer(ACTIONS[cmd.pose], this.state.joints);
        this.state.controller = "action";
        this.state.action = cmd.pose;
        this.state.actionProgress = 0;
        break;
    }
  }

  /** Servo test (local, not a protocol command): joints follow `setServoTargets`. */
  setServoTest(enabled: boolean): void {
    if (enabled) {
      this.player = null;
      this.blend = null;
      this.state.action = null;
      this.state.forward = 0;
      this.state.turn = 0;
      this.state.v = 0;
      this.state.w = 0;
      this.servoTargets = [...this.state.joints];
      this.state.controller = "servo";
    } else if (this.state.controller === "servo") {
      this.state.gait = GAIT.REST;
      this.startBlend(NEUTRAL_POSE, "rest");
    }
  }

  /** Targets for the servo test, radians, protocol order; clamped to the joint limits. */
  setServoTargets(joints: readonly number[]): void {
    this.servoTargets = clampJoints(joints);
  }

  getServoTargets(): number[] {
    return [...this.servoTargets];
  }

  /** Put the body back at the origin in the neutral stance. */
  resetPose(): void {
    this.player = null;
    this.blend = null;
    Object.assign(this.state, {
      x: 0,
      z: 0,
      yaw: 0,
      forward: 0,
      turn: 0,
      v: 0,
      w: 0,
      gait: GAIT.REST,
      action: null,
      controller: this.state.controller === "servo" ? "servo" : "rest",
    });
    this.servoTargets = [...NEUTRAL_POSE];
    this.planner.reset(WALK_POSE);
    this.anchors = [null, null, null, null];
    this.placeBody(NEUTRAL_POSE, null, false);
  }

  /** Move the body (and its planted feet) to a pose on the floor. Test bench helper. */
  teleport(x: number, z: number, yaw: number): void {
    Object.assign(this.state, { x, z, yaw });
    this.reanchor();
  }

  step(dt: number): void {
    const s = this.state;
    s.operatorIdle += dt;
    if (s.mode === CONTROL_MODE.MANUAL && s.operatorIdle >= OPERATOR_IDLE_TIMEOUT_S) {
      s.mode = CONTROL_MODE.AUTO;
    }

    const prev = { x: s.x, z: s.z, yaw: s.yaw };
    // A blend moves the joints with the feet down: the feet slide (as on the real kit when the
    // firmware jumps to a new keyframe), so they are re-planted every tick instead of anchored.
    const sliding = s.controller === "blend";
    let joints: number[];
    let stance: GaitStep | null = null;

    switch (s.controller) {
      case "action": {
        const player = this.player;
        if (!player) {
          joints = s.joints;
          break;
        }
        joints = player.step(dt);
        s.actionProgress = player.progress;
        if (player.done) {
          this.player = null;
          s.controller = "hold";
        }
        break;
      }
      case "hold":
        joints = s.joints;
        break;
      case "blend": {
        const b = this.blend;
        if (!b) {
          joints = s.joints;
          break;
        }
        b.t = Math.min(BLEND_S, b.t + dt);
        const u = b.t / BLEND_S;
        const e = u * u * (3 - 2 * u);
        joints = b.from.map((a, i) => a + (b.to[i] - a) * e);
        if (b.t >= BLEND_S) {
          this.blend = null;
          s.controller = b.next;
          if (b.next === "gait") this.planner.reset(WALK_POSE);
        }
        break;
      }
      case "rest":
        joints = NEUTRAL_POSE;
        if (s.gait !== GAIT.REST) this.startBlend(WALK_POSE, "gait");
        break;
      case "servo": {
        const maxStep = SERVO_SLEW * dt;
        joints = s.joints.map((a, i) => a + clamp(this.servoTargets[i] - a, -maxStep, maxStep));
        break;
      }
      default: {
        const target = commandToTwist(s.gait, s.forward, s.turn);
        s.v = approach(s.v, target.v, ACCEL * dt);
        s.w = approach(s.w, target.w, YAW_ACCEL * dt);
        const out = this.planner.step(dt, s.gait, s.v, s.w, { h: s.h, pitch: s.pitch, roll: s.roll });
        joints = out.joints;
        stance = out;
        s.phase = this.planner.phase;
        const still = Math.abs(s.v) < 1e-6 && Math.abs(s.w) < 1e-6;
        if (s.gait === GAIT.REST && still && this.planner.settled()) this.startBlend(NEUTRAL_POSE, "rest");
      }
    }

    if (sliding) this.anchors = [null, null, null, null];
    this.placeBody(clampJoints(joints), stance, !sliding);

    if (this.world.collision) {
      const hit = resolveCollision(s.x, s.z);
      s.collided = hit.hit;
      if (hit.hit) {
        s.x = hit.x;
        s.z = hit.z;
        // The obstacle wins: planted feet slip to where they are now.
        this.reanchor();
      }
    } else {
      s.collided = false;
    }

    s.speed = dt > 0 ? Math.hypot(s.x - prev.x, s.z - prev.z) / dt : 0;
    s.yawRate = dt > 0 ? (s.yaw - prev.yaw) / dt : 0;
    s.distance = this.world.sensor ? senseDistance(s) : null;
  }

  getState(): RobotState {
    return this.state;
  }

  /** Servo angles in degrees, protocol order. */
  joints(): number[] {
    return this.state.joints.map(toDegrees);
  }

  telemetry(): Telemetry {
    return {
      t: Date.now(),
      x: this.state.x,
      y: this.state.y,
      z: this.state.z,
      yaw: this.state.yaw,
      distance: this.state.distance,
      gait: this.state.gait,
      mode: this.state.mode,
      joints: this.joints(),
    };
  }

  /**
   * Rest the body on its feet and keep planted feet still.
   * `stance` = legs the gait declares as support; null = settle on the lowest feet.
   */
  private placeBody(joints: number[], gait: GaitStep | null, keepAnchors: boolean): void {
    const s = this.state;
    const feetBody = feetFromJoints(joints);
    let contact: boolean[];
    const prevTilt = { h: s.h, pitch: s.pitch, roll: s.roll };
    if (gait) {
      const rest = feetFromJoints(gait.support);
      const tilt = restOnBelly(fitSupport(rest, prevTilt, gait.load));
      Object.assign(s, tilt);
      contact = gait.stance;
    } else {
      const settled = settleOnFeet(feetBody, prevTilt);
      Object.assign(s, settled.tilt);
      contact = settled.contact;
    }

    if (keepAnchors) {
      const local: Vec3[] = [];
      const anchors: Anchor[] = [];
      LEGS.forEach((_, i) => {
        const a = this.anchors[i];
        if (contact[i] && a) {
          local.push(tiltPoint(feetBody[i], s.pitch, s.roll));
          anchors.push(a);
        }
      });
      const planar = fitPlanar(local, anchors, { x: s.x, z: s.z, yaw: s.yaw });
      s.x = planar.x;
      s.z = planar.z;
      s.yaw = planar.yaw;
    }

    const pose: BodyPose = { x: s.x, z: s.z, yaw: s.yaw, h: s.h, pitch: s.pitch, roll: s.roll };
    s.feet = feetBody.map((f) => toWorld(pose, f));
    s.joints = joints;
    s.contact = contact;
    this.anchors = this.anchors.map((a, i) => {
      if (!contact[i]) return null;
      return a ?? { x: s.feet[i].x, z: s.feet[i].z };
    });
  }

  private reanchor(): void {
    const s = this.state;
    const pose: BodyPose = { x: s.x, z: s.z, yaw: s.yaw, h: s.h, pitch: s.pitch, roll: s.roll };
    s.feet = feetFromJoints(s.joints).map((f) => toWorld(pose, f));
    this.anchors = this.anchors.map((a, i) => (a ? { x: s.feet[i].x, z: s.feet[i].z } : null));
  }

  /** Any operator drive command ends an action (or a held action pose) with a blend. */
  private leaveAction(): void {
    const c = this.state.controller;
    if (c === "action" || c === "hold") this.startBlend(NEUTRAL_POSE, "rest");
  }

  private startBlend(to: readonly number[], next: "rest" | "gait"): void {
    this.player = null;
    this.state.action = null;
    this.state.actionProgress = 0;
    this.blend = { from: [...this.state.joints], to, t: 0, next };
    this.state.controller = "blend";
  }
}

function isValidCommand(cmd: unknown): cmd is Command {
  if (!cmd || typeof cmd !== "object") return false;
  const c = cmd as Record<string, unknown>;
  switch (c.kind) {
    case CMD_KIND.STOP:
      return true;
    case CMD_KIND.MOVE:
      return Number.isFinite(Number(c.forward)) && Number.isFinite(Number(c.turn)) && c.forward !== null && c.turn !== null;
    case CMD_KIND.GAIT:
      return isGait(c.gait);
    case CMD_KIND.MODE:
      return isControlMode(c.mode);
    case CMD_KIND.POSE:
      return isActionName(c.pose);
    default:
      return false;
  }
}

function approach(current: number, target: number, maxStep: number): number {
  return current + clamp(target - current, -maxStep, maxStep);
}

function isControlMode(value: unknown): value is ControlMode {
  return value === CONTROL_MODE.AUTO || value === CONTROL_MODE.MANUAL;
}

function isGait(value: unknown): value is Gait {
  return value === GAIT.TETRAPOD || value === GAIT.WAVE || value === GAIT.REST;
}

export function createEngine(): TwinEngine {
  return new TwinEngine();
}
