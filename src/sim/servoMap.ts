/**
 * Mapping between the twin's joint convention and the official LAFVIN firmware servo tables
 * (`0.SpiderBot/actionarray.h`). Raw firmware values are servo degrees 0–180 in the order
 * `G14, G12, G13, G15, G16, G5, G4, G2`.
 *
 * The leg/joint of each channel comes from the firmware's own comment on `Servo_Prg_9`:
 *   0 G14 right-front foot (knee)   1 G12 right-front leg (hip)
 *   2 G13 right-rear leg (hip)      3 G15 right-rear foot (knee)
 *   4 G16 left-front foot (knee)    5 G5  left-front leg (hip)
 *   6 G4  left-rear leg (hip)       7 G2  left-rear foot (knee)
 *
 * raw = zero + sign · angle, with the zero pose (legs sideways, tibias flat) from
 * `Servo_Act_0`. Signs were derived from `Servo_Act_1` (standby) and checked against the
 * forward table (diagonal pairs lift and swing as the comments say).
 *
 * Per-robot trim (`Servo_Offset`, EEPROM) is calibration, not geometry, and is not applied here.
 */

import { LEG, LEGS, type LegId } from "../protocol";
import { toDegrees, toRadians } from "./spiderModel";

type Joint = "hip" | "knee";

interface Channel {
  gpio: number;
  leg: LegId;
  joint: Joint;
  zero: number;
  sign: 1 | -1;
}

export const FIRMWARE_CHANNELS: readonly Channel[] = [
  { gpio: 14, leg: LEG.FR, joint: "knee", zero: 135, sign: -1 },
  { gpio: 12, leg: LEG.FR, joint: "hip", zero: 45, sign: 1 },
  { gpio: 13, leg: LEG.RR, joint: "hip", zero: 135, sign: 1 },
  { gpio: 15, leg: LEG.RR, joint: "knee", zero: 45, sign: 1 },
  { gpio: 16, leg: LEG.FL, joint: "knee", zero: 45, sign: 1 },
  { gpio: 5, leg: LEG.FL, joint: "hip", zero: 135, sign: -1 },
  { gpio: 4, leg: LEG.RL, joint: "hip", zero: 45, sign: -1 },
  { gpio: 2, leg: LEG.RL, joint: "knee", zero: 135, sign: -1 },
];

/** `Servo_Act_0`: power-on zero pose. */
export const FIRMWARE_ZERO: readonly number[] = [135, 45, 135, 45, 45, 135, 45, 135];
/** `Servo_Act_1`: standby pose. */
export const FIRMWARE_STANDBY: readonly number[] = [60, 90, 90, 120, 120, 90, 90, 60];

function protocolIndex(leg: LegId, joint: Joint): number {
  return LEGS.indexOf(leg) * 2 + (joint === "hip" ? 0 : 1);
}

/** Firmware raw servo degrees (firmware order) -> twin joints (radians, protocol order). */
export function firmwareToJoints(raw: readonly number[]): number[] {
  const joints = new Array<number>(8).fill(0);
  FIRMWARE_CHANNELS.forEach((ch, i) => {
    joints[protocolIndex(ch.leg, ch.joint)] = toRadians((raw[i] - ch.zero) * ch.sign);
  });
  return joints;
}

/** Twin joints (radians, protocol order) -> firmware raw servo degrees (firmware order). */
export function jointsToFirmware(joints: readonly number[]): number[] {
  return FIRMWARE_CHANNELS.map((ch) => ch.zero + ch.sign * toDegrees(joints[protocolIndex(ch.leg, ch.joint)]));
}
