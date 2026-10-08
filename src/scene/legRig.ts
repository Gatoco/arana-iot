/**
 * Purely visual leg rig for the 3D view.
 *
 * The real kit has 2 servos per leg (coxa yaw + femur pitch); the tibia is a
 * fixed rod. To keep the twin honest we render exactly that: two actuated
 * segments, and a knee whose bend is fixed by the hardware geometry.
 *
 * The sim (src/sim) owns total reach. Here we only solve where to *draw* the
 * femur and tibia so the foot lands at that reach.
 */

import { LEG_GEOMETRY } from "../sim/spiderModel";

const REACH = LEG_GEOMETRY.reach;
const HIP_HEIGHT = LEG_GEOMETRY.hipHeight;

/** Segment lengths, meters. Chosen so the neutral knee bends ~118deg. */
export const LEG_RIG = {
  femur: 0.06,
  tibia: 0.06,
} as const;

export interface RenderLeg {
  /** Femur pitch from horizontal, radians, in the leg plane. */
  femurPitch: number;
  /** Fixed bend of the tibia relative to the femur, radians (negative = down). */
  kneeBend: number;
}

/**
 * Two-link IK for a foot lifted `height` meters above the ground, kept at the
 * neutral horizontal reach `REACH`. height = 0 reproduces the planted pose.
 */
export function solveRenderLeg(height: number): RenderLeg {
  const u = REACH;
  const v = height - HIP_HEIGHT;
  const { femur: L1, tibia: L2 } = LEG_RIG;

  const raw = Math.hypot(u, v);
  // Keep the triangle solvable; targets never approach this, guard only.
  const d = Math.min(L1 + L2 - 1e-6, Math.max(Math.abs(L1 - L2) + 1e-6, raw));

  const knee = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2)));
  const hip = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const direction = Math.atan2(v, u);

  return { femurPitch: direction + hip, kneeBend: -(Math.PI - knee) };
}

function clamp(v: number): number {
  return Math.min(1, Math.max(-1, v));
}
