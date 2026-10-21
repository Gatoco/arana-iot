/**
 * Kinematic model of the 8-servo quadruped spider.
 *
 * Each leg has 2 servos, matching the real MG90 kit:
 *   - coxa: horizontal yaw, swings the leg fore/aft
 *   - femur: vertical pitch, lifts and plants the foot
 *
 * The tibia is treated as a rigid extension of the femur (cheap kits ship
 * it as a fixed rod). This keeps IK closed-form and the twin honest about
 * what the real servos can do.
 */

import { LEG, LEGS, type LegId } from "../protocol";

export const BODY = {
  /** Body length along +Z (front is -Z in Three.js). */
  length: 0.18,
  width: 0.12,
  height: 0.05,
} as const;

export const LEG_GEOMETRY = {
  /** Horizontal reach when the coxa is centered, meters. */
  reach: 0.09,
  /** Height of the hip mount above the body bottom, meters. */
  hipHeight: BODY.height,
  /** Vertical travel of the foot from planted to fully lifted, meters. */
  lift: 0.03,
  /** Max coxa yaw each side of neutral, radians. */
  maxYaw: Math.PI / 4,
} as const;

/** Visual segment lengths of each leg (femur → tibia chain), meters. */
export const LEG_RIG = {
  femur: 0.06,
  tibia: 0.06,
} as const;

/** MG90 servo body, meters (approximate datasheet envelope, without tabs). */
export const SERVO = {
  width: 0.0122,
  height: 0.0225,
  depth: 0.0227,
} as const;

/** HC-SR04 ultrasonic sensor: datasheet range 2–400 cm, ~15° measuring angle. */
export const SENSOR = {
  minRange: 0.02,
  maxRange: 4.0,
  /** Half of the measuring cone angle, radians. */
  coneHalfAngle: (7.5 * Math.PI) / 180,
} as const;

/** Mount position of each leg's hip relative to body center. */
export const HIP: Record<LegId, { x: number; z: number }> = {
  [LEG.FL]: { x: -BODY.width / 2, z: -BODY.length / 2 },
  [LEG.FR]: { x: BODY.width / 2, z: -BODY.length / 2 },
  [LEG.RL]: { x: -BODY.width / 2, z: BODY.length / 2 },
  [LEG.RR]: { x: BODY.width / 2, z: BODY.length / 2 },
};

/** +1 for legs on the right (+X), -1 for legs on the left (-X). */
export function legSide(leg: LegId): 1 | -1 {
  return leg === LEG.FR || leg === LEG.RR ? 1 : -1;
}

/** -1 for front legs (-Z), +1 for rear legs (+Z). */
export function legEnd(leg: LegId): 1 | -1 {
  return leg === LEG.RL || leg === LEG.RR ? 1 : -1;
}

export interface LegAngles {
  /** Coxa yaw in radians. 0 = pointing straight out. */
  coxa: number;
  /** Femur pitch in radians. 0 = horizontal reach, positive lifts foot. */
  femur: number;
}

export interface FootTarget {
  /** Fore/aft offset along -Z (forward positive), meters. */
  forward: number;
  /** Foot height above the ground plane, meters. */
  height: number;
}

const REACH = LEG_GEOMETRY.reach;

/**
 * Closed-form IK for a 2-servo leg. The foot is at (forward, height)
 * relative to a neutral foot position `reach` meters straight out.
 */
export function solveLeg(target: FootTarget): LegAngles {
  const forward = clamp(target.forward, -REACH * 0.8, REACH * 0.8);
  const height = clamp(target.height, 0, LEG_GEOMETRY.lift);

  // Coxa yaw: swing the leg plane fore/aft.
  const coxa = Math.atan2(forward, REACH);
  // Femur pitch: raising the foot shortens effective vertical reach.
  const femur = Math.asin(clamp(height / REACH, -1, 1));

  return { coxa, femur };
}

/** Foot world position (x, y, z) relative to body center for a solved leg. */
export function footPosition(leg: LegId, target: FootTarget): [number, number, number] {
  const hip = HIP[leg];
  const side = legSide(leg);
  const angles = solveLeg(target);
  const planar = REACH * Math.cos(angles.coxa);
  const reachZ = REACH * Math.sin(angles.coxa);
  const footY = -(LEG_GEOMETRY.hipHeight + LEG_GEOMETRY.lift - target.height);
  return [hip.x + side * planar, footY, hip.z + reachZ * legEnd(leg)];
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Flatten per-leg angles into the 8-element servo array used in telemetry. */
export function flattenJoints(angles: Record<LegId, LegAngles>): number[] {
  return LEGS.flatMap((leg) => {
    const a = angles[leg];
    return [toDegrees(a.coxa), toDegrees(a.femur)];
  });
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
