/**
 * Headless twin engine. Owns the robot state and steps it forward.
 *
 * Deliberately free of Three.js: this is the "firmware" of the twin. The
 * renderer subscribes to `getState()`. Same boundary the real ESP will have.
 */

import {
  CMD_KIND,
  CONTROL_MODE,
  GAIT,
  type Command,
  type ControlMode,
  type Telemetry,
  type Gait,
} from "../protocol";
import { clamp, solveLeg, LEG_GEOMETRY } from "./spiderModel";
import { computeGait, type GaitInput } from "./gait";
import { ARENA, headingVector, senseDistance } from "./world";
import { LEGS, type LegId } from "../protocol";

/** Seconds without operator commands before `manual` falls back to `auto`. */
export const OPERATOR_IDLE_TIMEOUT_S = 5;

export interface RobotState {
  x: number;
  y: number;
  z: number;
  yaw: number;
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
  targets: Record<LegId, { forward: number; height: number }>;
}

export interface WorldConfig {
  /** Half-size of the square arena in meters. */
  arena: number;
  /** When false the ultrasonic sensor reports no echo. */
  sensor: boolean;
}

export class TwinEngine {
  private state: RobotState = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    forward: 0,
    turn: 0,
    gait: GAIT.REST,
    mode: CONTROL_MODE.AUTO,
    operatorIdle: 0,
    phase: 0,
    distance: null,
    targets: {} as Record<LegId, { forward: number; height: number }>,
  };

  private world: WorldConfig = { arena: ARENA.size / 2, sensor: true };

  setWorld(world: Partial<WorldConfig>): void {
    this.world = { ...this.world, ...world };
  }

  /** Apply an operator command. Every command restarts the idle timer. */
  apply(cmd: Command): void {
    this.state.operatorIdle = 0;
    switch (cmd.kind) {
      case CMD_KIND.MODE:
        // Payloads come off the wire unvalidated; an unknown value must not wedge the mode.
        if (isControlMode(cmd.mode)) this.state.mode = cmd.mode;
        break;
      case CMD_KIND.MOVE:
        this.state.mode = CONTROL_MODE.MANUAL;
        this.state.forward = clamp(cmd.forward, -1, 1);
        this.state.turn = clamp(cmd.turn, -1, 1);
        if (this.state.gait === GAIT.REST) this.state.gait = GAIT.TETRAPOD;
        break;
      case CMD_KIND.STOP:
        this.state.forward = 0;
        this.state.turn = 0;
        this.state.gait = GAIT.REST;
        break;
      case CMD_KIND.GAIT:
        this.state.gait = cmd.gait;
        break;
    }
  }

  step(dt: number): void {
    this.state.operatorIdle += dt;
    if (
      this.state.mode === CONTROL_MODE.MANUAL &&
      this.state.operatorIdle >= OPERATOR_IDLE_TIMEOUT_S
    ) {
      this.state.mode = CONTROL_MODE.AUTO;
    }

    const input: GaitInput = {
      forward: this.state.forward,
      turn: this.state.turn,
      gait: this.state.gait,
      phase: this.state.phase,
    };
    const out = computeGait(input);
    this.state.targets = out.targets;

    // Integrate pose.
    const [hx, hz] = headingVector(this.state.yaw);
    this.state.x += hx * out.speed * dt;
    this.state.z += hz * out.speed * dt;
    this.state.yaw += out.yawRate * dt;

    // Keep inside the arena.
    const a = this.world.arena;
    this.state.x = clamp(this.state.x, -a, a);
    this.state.z = clamp(this.state.z, -a, a);

    this.state.distance = this.world.sensor ? senseDistance(this.state) : null;

    this.state.phase = out.advance(dt);
  }

  getState(): RobotState {
    return this.state;
  }

  /** Servo angles in degrees for the current foot targets. */
  joints(): number[] {
    return LEGS.flatMap((leg) => {
      const t = this.state.targets[leg] ?? { forward: 0, height: 0 };
      const a = solveLeg(t);
      return [(a.coxa * 180) / Math.PI, (a.femur * 180) / Math.PI];
    });
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

  /** Highest foot point, used to place the visual body above the ground. */
  bodyHeight(): number {
    return LEG_GEOMETRY.hipHeight + LEG_GEOMETRY.lift;
  }
}

function isControlMode(value: unknown): value is ControlMode {
  return value === CONTROL_MODE.AUTO || value === CONTROL_MODE.MANUAL;
}

export function createEngine(): TwinEngine {
  return new TwinEngine();
}
