/**
 * The single leg solver for the twin. The engine and the renderer both use it, so what the
 * telemetry reports and what the screen shows are the same joint angles.
 *
 * Geometry of one leg (body frame, see spiderModel.ts):
 *   - hip yaw ψ rotates the leg's vertical plane around the hip axis. Outward direction:
 *       u(ψ) = (side·cos ψ, 0, -sin ψ)   (ψ > 0 moves the foot toward the nose)
 *   - the femur is a passive horizontal arm of length L1 in that plane
 *   - knee pitch κ rotates the tibia (L2) below the femur line; the tibia plane is offset by t
 *     along the knee axis n(ψ) = end·(-side·sin ψ, 0, -cos ψ) (toward the body's middle at ψ = 0):
 *       foot = hip + u(ψ)·(L1 + L2·cos κ) + n(ψ)·t - ŷ·L2·sin κ
 *
 * Two degrees of freedom: the horizontal foot position fixes both angles, and the foot height
 * is a consequence. The body pose solver puts planted feet on the floor.
 */

import { LEGS } from "../protocol";
import { LEG_CONFIG, clamp, type LegConfig, type Vec3 } from "./spiderModel";

export interface LegSolution {
  /** Radians, relative to the leg pointing straight out sideways. */
  hipYaw: number;
  /** Radians, relative to the femur line; positive = foot down. */
  kneePitch: number;
  /** Foot reached by the (clamped) joints, body frame. */
  foot: Vec3;
  /** False when the target was clamped by reach or joint limits. */
  reachable: boolean;
}

const EPS = 1e-9;

export function footFromJoints(cfg: LegConfig, hipYaw: number, kneePitch: number): Vec3 {
  const radial = cfg.femurLength + cfg.tibiaLength * Math.cos(kneePitch);
  const c = Math.cos(hipYaw);
  const s = Math.sin(hipYaw);
  const t = cfg.kneeOffset * cfg.end;
  return {
    x: cfg.hip.x + cfg.side * (c * radial - s * t),
    y: cfg.hip.y - cfg.tibiaLength * Math.sin(kneePitch),
    z: cfg.hip.z - s * radial - c * t,
  };
}

/**
 * Solve the joints that put the foot at the target's horizontal position (x, z).
 * The target's y is only used to report reachability; a 2-DOF leg cannot choose it.
 */
export function solveLegToFoot(cfg: LegConfig, target: Vec3): LegSolution {
  const dx = target.x - cfg.hip.x;
  const dz = target.z - cfg.hip.z;
  const finite = Number.isFinite(dx) && Number.isFinite(dz) && Number.isFinite(target.y);
  const d2 = finite ? dx * dx + dz * dz : 0;
  const t = cfg.kneeOffset;
  // Radial reach in the leg plane: |d|² = r² + t².
  let reachable = finite && d2 > t * t + EPS;
  const r = reachable ? Math.sqrt(d2 - t * t) : 0;
  // In (side·x, -z) coordinates u(ψ) is the plain angle ψ and n is u turned by end·90°.
  const rawYaw = reachable ? Math.atan2(-dz, cfg.side * dx) - Math.atan2(cfg.end * t, r) : 0;
  const hipYaw = clamp(rawYaw, cfg.hipYawLimits[0], cfg.hipYawLimits[1]);
  if (Math.abs(hipYaw - rawYaw) > EPS) reachable = false;

  const cosK = (r - cfg.femurLength) / cfg.tibiaLength;
  const rawKnee = Math.acos(clamp(cosK, -1, 1));
  if (cosK > 1 + EPS || cosK < -1 - EPS) reachable = false;
  const kneePitch = clamp(rawKnee, cfg.kneeLimits[0], cfg.kneeLimits[1]);
  if (Math.abs(kneePitch - rawKnee) > EPS) reachable = false;

  const foot = footFromJoints(cfg, hipYaw, kneePitch);
  if (reachable && Math.abs(foot.y - target.y) > 1e-6) reachable = false;
  return { hipYaw, kneePitch, foot, reachable };
}

/** Horizontal-only solve used for planted feet (height comes from the body pose). */
export function solveLegHorizontal(cfg: LegConfig, x: number, z: number): LegSolution {
  const sol = solveLegToFoot(cfg, { x, y: 0, z });
  // y is free for a 2-DOF leg; reachability here means "inside reach and joint limits".
  const back = footFromJoints(cfg, sol.hipYaw, sol.kneePitch);
  const reachable = Math.hypot(back.x - x, back.z - z) < 1e-6;
  return { ...sol, foot: back, reachable };
}

/** Clamp an 8-joint vector (protocol order) to each leg's limits. */
export function clampJoints(joints: readonly number[]): number[] {
  return LEGS.flatMap((leg, i) => {
    const cfg = LEG_CONFIG[leg];
    const hip = Number.isFinite(joints[2 * i]) ? joints[2 * i] : 0;
    const knee = Number.isFinite(joints[2 * i + 1]) ? joints[2 * i + 1] : 0;
    return [
      clamp(hip, cfg.hipYawLimits[0], cfg.hipYawLimits[1]),
      clamp(knee, cfg.kneeLimits[0], cfg.kneeLimits[1]),
    ];
  });
}

/** Feet of all four legs (protocol order) for an 8-joint vector, body frame. */
export function feetFromJoints(joints: readonly number[]): Vec3[] {
  return LEGS.map((leg, i) => footFromJoints(LEG_CONFIG[leg], joints[2 * i], joints[2 * i + 1]));
}
