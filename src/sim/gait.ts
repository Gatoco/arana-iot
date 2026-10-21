/**
 * Gait planner for a 2-DOF-per-leg quadruped, in the body frame.
 *
 * Stance legs hold their foot in world space: in the body frame the foot drifts opposite to the
 * body twist (v, ω). Swing legs lift by bending the knee up (the only way a 2-DOF leg lifts,
 * like the firmware's "knee toward 90°" frames) and travel to a foothold half a stride ahead.
 * The body motion itself is not integrated here: the engine derives it from the planted feet.
 *
 * Kinematics of a world-fixed point seen from the body (derived for world.ts' yaw convention):
 *   dp/dt = ω · (-p.z, p.x) - v        (p = (x, z) body frame, v body velocity, ω = d yaw/dt)
 */

import { GAIT, LEG, LEGS, type Gait, type LegId } from "../protocol";
import { LEG_CONFIG, NEUTRAL_POSE, jointsFor, toRadians } from "./spiderModel";
import { footFromJoints, solveLegHorizontal } from "./legKinematics";
import { tiltPoint, untiltPoint, type Tilt } from "./bodyPose";

const LEVEL: Tilt = { h: 0, pitch: 0, roll: 0 };

/** Seconds for one full gait cycle (every leg takes one step). */
export const GAIT_PERIOD: Record<Exclude<Gait, "rest">, number> = {
  [GAIT.WAVE]: 2.4,
  [GAIT.TETRAPOD]: 1.2,
};

/** Fraction of the cycle each leg spends in the air. */
export const SWING_FRACTION = 0.25;
/** Knee bend added at mid-swing (firmware lifts 20–25° on the knee). */
export const SWING_LIFT = toRadians(25);
/** Longest stride a stance foot may travel, meters. Keeps body pitch within a few degrees. */
export const MAX_STRIDE = 0.026;
/** Foot error that makes the rest stance re-place a leg, meters. */
const SETTLE_TOLERANCE = 0.003;
const SETTLE_SWING_S = 0.35;

/** Phase offset per leg, 0..1. Tetrapod pairs match the firmware: FR+RL, FL+RR. */
const PHASE: Record<Exclude<Gait, "rest">, Record<LegId, number>> = {
  [GAIT.WAVE]: { [LEG.FL]: 0.0, [LEG.RR]: 0.25, [LEG.FR]: 0.5, [LEG.RL]: 0.75 },
  [GAIT.TETRAPOD]: { [LEG.FL]: 0.0, [LEG.RR]: 0.0, [LEG.FR]: 0.5, [LEG.RL]: 0.5 },
};

/** One leg at a time when settling, in a statically stable order. */
const SETTLE_ORDER: LegId[] = [LEG.FL, LEG.RR, LEG.FR, LEG.RL];

interface P2 {
  x: number;
  z: number;
}

/**
 * Walking stance: hips 30° splayed, knees 65° down (the firmware's walking frames use 65°).
 * Steeper knees make the foot drop less sensitive to stride, so the body stays level.
 * The engine stands up into it (and back down to the neutral stance) with a joint blend,
 * as the firmware does when it jumps to its first walking keyframe.
 */
export const WALK_POSE = jointsFor((cfg) => [-cfg.end * toRadians(30), toRadians(65)]);

function footholds(pose: number[]): Record<LegId, P2> {
  const out = {} as Record<LegId, P2>;
  LEGS.forEach((leg, i) => {
    const f = footFromJoints(LEG_CONFIG[leg], pose[2 * i], pose[2 * i + 1]);
    out[leg] = { x: f.x, z: f.z };
  });
  return out;
}

export const REST_FOOTHOLDS = footholds(NEUTRAL_POSE);
export const WALK_FOOTHOLDS = footholds(WALK_POSE);

/** Stance time of a gait, seconds. */
export function stanceTime(gait: Exclude<Gait, "rest">): number {
  return GAIT_PERIOD[gait] * (1 - SWING_FRACTION);
}

/** Top body speed (m/s) and yaw rate (rad/s) a gait allows with MAX_STRIDE. */
export function gaitLimits(gait: Gait): { speed: number; yawRate: number } {
  if (gait === GAIT.REST) return { speed: 0, yawRate: 0 };
  const t = stanceTime(gait);
  const reach = Math.max(...LEGS.map((l) => Math.hypot(WALK_FOOTHOLDS[l].x, WALK_FOOTHOLDS[l].z)));
  return { speed: MAX_STRIDE / t, yawRate: MAX_STRIDE / (t * reach) };
}

/**
 * Scale a (forward, turn) command in -1..1 to a body twist the legs can deliver: the worst
 * foot's stride stays within MAX_STRIDE.
 */
export function commandToTwist(gait: Gait, forward: number, turn: number): { v: number; w: number } {
  const lim = gaitLimits(gait);
  if (lim.speed === 0) return { v: 0, w: 0 };
  let v = forward * lim.speed;
  let w = turn * lim.yawRate;
  const t = stanceTime(gait as Exclude<Gait, "rest">);
  let worst = 0;
  for (const leg of LEGS) {
    const n = WALK_FOOTHOLDS[leg];
    worst = Math.max(worst, Math.hypot(w * -n.z, w * n.x + v) * t);
  }
  if (worst > MAX_STRIDE) {
    const k = MAX_STRIDE / worst;
    v *= k;
    w *= k;
  }
  return { v, w };
}

interface Swing {
  from: P2;
  t: number;
  duration: number;
}

interface LegState {
  /** Foot horizontal position, body frame. */
  p: P2;
  swing: Swing | null;
  prevLocal: number;
}

export interface GaitStep {
  /** 8 joints, radians, protocol order. */
  joints: number[];
  /** True for legs whose foot is planted (anchored in world space). */
  stance: boolean[];
  /**
   * Share of the body each foot carries, 0..1. A swing foot unloads over the first quarter of
   * the swing and reloads over the last quarter, so the body transfers weight smoothly
   * instead of dropping when a foot lands.
   */
  load: number[];
  /** Joints without the swing lift: where each foot would rest. Used for the support fit. */
  support: number[];
}

/** Support weight of a swinging foot at swing progress u (0..1). */
export function swingLoad(u: number): number {
  const ramp = (t: number) => {
    const c = Math.min(1, Math.max(0, t));
    return c * c * (3 - 2 * c);
  };
  return Math.max(1 - ramp(u / 0.25), ramp((u - 0.75) / 0.25));
}

export class GaitPlanner {
  private legs = {} as Record<LegId, LegState>;
  phase = 0;

  constructor(joints: readonly number[] = WALK_POSE) {
    this.reset(joints);
  }

  /** Start from the feet of the given joints, every leg planted. */
  reset(joints: readonly number[]): void {
    LEGS.forEach((leg, i) => {
      const f = footFromJoints(LEG_CONFIG[leg], joints[2 * i], joints[2 * i + 1]);
      this.legs[leg] = { p: { x: f.x, z: f.z }, swing: null, prevLocal: 0.999 };
    });
    this.phase = 0;
  }

  /** Legs in the air right now. */
  swinging(): LegId[] {
    return LEGS.filter((l) => this.legs[l].swing);
  }

  /** Every foot planted on its walking foothold. */
  settled(): boolean {
    return this.swinging().length === 0 && !LEGS.some((l) => this.misplaced(l));
  }

  private misplaced(leg: LegId): boolean {
    const p = this.legs[leg].p;
    const goal = WALK_FOOTHOLDS[leg];
    return Math.hypot(p.x - goal.x, p.z - goal.z) > SETTLE_TOLERANCE;
  }

  /**
   * Advance by dt with body twist v (m/s, forward positive) and w (rad/s, yaw rate, positive
   * = turn left).
   */
  step(dt: number, gait: Gait, v: number, w: number, tilt: Tilt = LEVEL): GaitStep {
    const moving = gait !== GAIT.REST && (Math.abs(v) > 1e-5 || Math.abs(w) > 1e-5);
    const vz = -v; // body velocity along local z (nose is -Z)

    // Stance feet drift opposite to the body twist.
    for (const leg of LEGS) {
      const s = this.legs[leg];
      if (s.swing) continue;
      const dx = w * -s.p.z;
      const dz = w * s.p.x - vz;
      s.p = { x: s.p.x + dx * dt, z: s.p.z + dz * dt };
    }

    if (moving) {
      const g = gait as Exclude<Gait, "rest">;
      const period = GAIT_PERIOD[g];
      this.phase = (this.phase + dt / period) % 1;
      for (const leg of LEGS) {
        const s = this.legs[leg];
        const local = (this.phase + PHASE[g][leg]) % 1;
        const entered = local < SWING_FRACTION && (s.prevLocal >= SWING_FRACTION || local < s.prevLocal);
        s.prevLocal = local;
        if (entered && !s.swing && !this.swinging().some((o) => !samePair(g, o, leg))) {
          s.swing = { from: s.p, t: 0, duration: Math.max(dt, (SWING_FRACTION - local) * period) };
        }
      }
    } else if (this.swinging().length === 0) {
      // Settle: re-place the worst-placed leg on the walking stance, one at a time.
      const leg = SETTLE_ORDER.find((l) => this.misplaced(l));
      if (leg) this.legs[leg].swing = { from: this.legs[leg].p, t: 0, duration: SETTLE_SWING_S };
    }

    const joints: number[] = [];
    const stance: boolean[] = [];
    const load: number[] = [];
    const support: number[] = [];
    for (const leg of LEGS) {
      const s = this.legs[leg];
      const cfg = LEG_CONFIG[leg];
      let lift = 0;
      let weight = 1;
      if (s.swing) {
        s.swing.t += dt;
        const u = Math.min(1, s.swing.t / s.swing.duration);
        weight = swingLoad(u) * 0.999;
        const target = this.touchdown(leg, gait, moving, v, w);
        const e = u * u * (3 - 2 * u);
        s.p = { x: s.swing.from.x + (target.x - s.swing.from.x) * e, z: s.swing.from.z + (target.z - s.swing.from.z) * e };
        lift = SWING_LIFT * Math.sin(Math.PI * u);
        if (u >= 1) {
          s.swing = null;
          lift = 0;
        }
      }
      // p lives in the level frame (the floor's horizontal plane); the leg works in the
      // tilted body frame. Converting keeps planted feet still while the body rocks.
      const b = untiltPoint({ x: s.p.x, y: -tilt.h, z: s.p.z }, tilt.pitch, tilt.roll);
      const sol = solveLegHorizontal(cfg, b.x, b.z);
      // A clamped stance foot slips to where the leg can actually be.
      if (!sol.reachable) {
        const q = tiltPoint(sol.foot, tilt.pitch, tilt.roll);
        s.p = { x: q.x, z: q.z };
      }
      const knee = Math.max(cfg.kneeLimits[0], sol.kneePitch - lift);
      joints.push(sol.hipYaw, knee);
      stance.push(s.swing === null);
      load.push(s.swing === null ? 1 : weight);
      support.push(sol.hipYaw, sol.kneePitch);
    }
    return { joints, stance, load, support };
  }

  private touchdown(leg: LegId, gait: Gait, moving: boolean, v: number, w: number): P2 {
    if (!moving) return WALK_FOOTHOLDS[leg];
    const n = WALK_FOOTHOLDS[leg];
    const half = stanceTime(gait as Exclude<Gait, "rest">) / 2;
    // Land where the stance drift will carry the foot back through the neutral foothold.
    return { x: n.x - w * -n.z * half, z: n.z - (w * n.x + v) * half };
  }
}

function samePair(gait: Exclude<Gait, "rest">, a: LegId, b: LegId): boolean {
  return PHASE[gait][a] === PHASE[gait][b];
}
