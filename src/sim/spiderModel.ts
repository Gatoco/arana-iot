/**
 * Physical description of the LAFVIN LA072 quadruped (the kit this twin mirrors).
 *
 * Sources (see odd/tasks/desktop-experience.md for the evidence log):
 *   - official firmware `actionarray.h`: servo order, zero / standby angles, action tables
 *   - manual p.36 (CAD) and p.49 (calibration photo): zero pose = legs sideways, tibias flat
 *   - product photos in docs/reference/: proportions, scaled from the HC-SR04 (26 mm transducer
 *     pitch) and the 18650 holder (21 mm wide). No official dimensions are published.
 *
 * Frames and units:
 *   - meters and radians internally, degrees only at the protocol / UI boundary
 *   - body frame: +X robot right, +Y up, -Z robot forward (the face). y = 0 is the femur plane,
 *     the horizontal plane that holds every hip yaw pivot and knee pivot.
 *
 * Each leg has two MG90S servos: a hip servo with a vertical shaft (leg yaw) and a knee servo
 * with a horizontal shaft riding on the tibia (tibia pitch). The femur is a passive acrylic arm.
 */

import { LEG, LEGS, type LegId } from "../protocol";

/** All dimensions of the twin, in meters. Scene, sim and tests read only from here. */
export const SPIDER = {
  /** Hip yaw axis to knee pivot, horizontal acrylic arm. */
  femurLength: 0.048,
  /** Knee pivot to rubber foot tip, in the tibia plane. */
  tibiaLength: 0.066,
  /**
   * The knee servo is screwed flat onto the tibia plate with its horn on the far side, and the
   * femur bolts to that horn (manual step 9). The tibia plane therefore sits this far from the
   * femur along the knee axis, toward the body's middle.
   */
  kneeOffset: 0.027,
  /** Hip yaw axes sit at (±x, ±z) on the chassis corners. */
  hip: { x: 0.03, z: 0.036 },

  /** H-shaped black acrylic chassis plate, just above the femur plane. */
  chassis: { width: 0.078, length: 0.096, thickness: 0.003, y: 0.0015 },
  /** Black expansion board (charger, fuse, capacitor, servo headers) on M3 nuts. */
  expansion: { width: 0.04, length: 0.085, thickness: 0.0016, y: 0.0068 },
  /** Black NodeMCU on female headers, ESP-12F shield on top. */
  esp: { width: 0.026, length: 0.049, thickness: 0.0016, y: 0.0168 },
  /** Four brass M3x25 standoffs between the expansion board and the cover. */
  standoff: { radius: 0.0029, length: 0.025, x: 0.017, z: 0.035, y0: 0.01 },
  /** Black acrylic cover plate with the etched LAFVIN mark. */
  cover: { width: 0.048, length: 0.082, thickness: 0.003, y: 0.0365 },
  /** Cat-ear face plate at the front; the HC-SR04 transducers poke through the eye holes. */
  face: { width: 0.052, height: 0.039, thickness: 0.003, bottom: 0.003, z: -0.0495, eyeY: 0.02 },
  /** HC-SR04 board behind the face plate. */
  sonar: { width: 0.045, height: 0.02, thickness: 0.0016, z: -0.0455, pitch: 0.026, can: 0.008 },
  /** Single 18650 holder hanging under the chassis (cell not included in the kit). */
  battery: { width: 0.021, height: 0.017, length: 0.077, z: -0.0015, top: 0 },
  /** MG90S case: L along the long side, W thickness, H shaft axis, tabs extend L to 32 mm. */
  servo: { l: 0.0228, w: 0.0122, h: 0.0227, tabs: 0.032, shaftOffset: 0.0058 },
  /** Black anti-slip rubber sleeve on the tibia tip. */
  foot: { radius: 0.0042, length: 0.016 },
  /** Lowest body points (body frame) used to rest the belly on the floor. */
  belly: [
    { x: 0, y: -0.017, z: -0.04 },
    { x: 0, y: -0.017, z: 0.037 },
    { x: -0.03, y: -0.0195, z: -0.036 },
    { x: 0.03, y: -0.0195, z: -0.036 },
    { x: -0.03, y: -0.0164, z: 0.036 },
    { x: 0.03, y: -0.0164, z: 0.036 },
  ],
  /** Hip servo case span (y) and horn height for front (shaft down) and rear (shaft up) legs. */
  hipServo: {
    front: { bottom: -0.0175, top: 0.0052, horn: -0.0195 },
    rear: { bottom: -0.0129, top: 0.0098, horn: 0.0118 },
  },
} as const;

/** HC-SR04 datasheet: 2–400 cm range, ~15° measuring cone. */
export const SENSOR = {
  minRange: 0.02,
  maxRange: 4.0,
  /** Half of the measuring cone angle, radians. */
  coneHalfAngle: (7.5 * Math.PI) / 180,
  /** Transducer front face in the body frame. */
  origin: { x: 0, y: SPIDER.face.eyeY, z: -0.058 },
} as const;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LegConfig {
  id: LegId;
  /** Hip yaw axis in the body frame (y = 0, the femur plane). */
  hip: Vec3;
  /** +1 for right legs (+X), -1 for left legs. */
  side: 1 | -1;
  /** -1 for front legs (-Z), +1 for rear legs. */
  end: 1 | -1;
  femurLength: number;
  tibiaLength: number;
  /** Tibia plane offset along the knee axis, toward the body's middle, meters. */
  kneeOffset: number;
  /** Hip yaw limits, radians; positive moves the foot toward the nose. */
  hipYawLimits: [number, number];
  /** Knee pitch limits, radians; 0 = tibia in line with the femur, positive = foot down. */
  kneeLimits: [number, number];
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Servo travel is 0–180° around the firmware zero (45° or 135°), so each leg has
 * 45° on one side and 135° on the other. Front legs can swing far forward, rear legs far
 * back. Limits are kept a few degrees inside that travel; every firmware keyframe fits.
 */
const FRONT_HIP: [number, number] = [toRadians(-40), toRadians(90)];
const REAR_HIP: [number, number] = [toRadians(-90), toRadians(40)];
const KNEE: [number, number] = [toRadians(-30), toRadians(110)];

function legConfig(id: LegId, side: 1 | -1, end: 1 | -1): LegConfig {
  return {
    id,
    hip: { x: side * SPIDER.hip.x, y: 0, z: end * SPIDER.hip.z },
    side,
    end,
    femurLength: SPIDER.femurLength,
    tibiaLength: SPIDER.tibiaLength,
    kneeOffset: SPIDER.kneeOffset,
    hipYawLimits: end < 0 ? FRONT_HIP : REAR_HIP,
    kneeLimits: KNEE,
  };
}

export const LEG_CONFIG: Record<LegId, LegConfig> = {
  [LEG.FL]: legConfig(LEG.FL, -1, -1),
  [LEG.FR]: legConfig(LEG.FR, 1, -1),
  [LEG.RL]: legConfig(LEG.RL, -1, 1),
  [LEG.RR]: legConfig(LEG.RR, 1, 1),
};

/** Joint vector helper: protocol order FL, FR, RL, RR, [hip, knee] each. */
export function jointsFor(perLeg: (cfg: LegConfig) => [number, number]): number[] {
  return LEGS.flatMap((leg) => perLeg(LEG_CONFIG[leg]));
}

/**
 * Neutral stance as photographed in docs/reference/: hips 45° splayed, knees 65° down. This is
 * the firmware's walking standby (`Servo_Prg_2` row 0, raw 70/90/90/110/110/90/90/70); scale-free
 * ratios on LA072_3.jpg (foot span and knee height over face width) match it, not the 45° center.
 */
export const NEUTRAL_POSE: number[] = jointsFor((cfg) => [
  -cfg.end * toRadians(45),
  toRadians(65),
]);

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
