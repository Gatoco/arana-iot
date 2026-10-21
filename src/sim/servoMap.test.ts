/**
 * S15: the twin's joint convention maps 1:1 onto the official LAFVIN firmware tables.
 */

import { test, expect } from "vitest";
import { firmwareToJoints, jointsToFirmware, FIRMWARE_ZERO, FIRMWARE_STANDBY } from "./servoMap";
import { toDegrees } from "./spiderModel";

const deg = (rad: number[]) => rad.map((r) => Math.round(toDegrees(r) * 1000) / 1000 + 0); // + 0 folds -0

test("firmware zero pose = all legs sideways, tibias horizontal", () => {
  expect(deg(firmwareToJoints(FIRMWARE_ZERO))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
});

test("firmware standby = front hips +45, rear hips -45, knees 75 down", () => {
  // Protocol order: FL hip, FL knee, FR hip, FR knee, RL hip, RL knee, RR hip, RR knee.
  expect(deg(firmwareToJoints(FIRMWARE_STANDBY))).toEqual([45, 75, 45, 75, -45, 75, -45, 75]);
});

test("round trip joints -> firmware -> joints", () => {
  const raw = [70, 39, 141, 90, 90, 90, 90, 70];
  expect(jointsToFirmware(firmwareToJoints(raw)).map(Math.round)).toEqual(raw);
});

test("forward table frame 'leg1,4 up; leg4 fw': FR and RL lift, RL swings forward", () => {
  const before = deg(firmwareToJoints([70, 90, 90, 110, 110, 90, 90, 70]));
  const after = deg(firmwareToJoints([90, 90, 90, 110, 110, 90, 45, 70 + 20]));
  // Knee decreases = foot rises.
  expect(after[3]).toBeLessThan(before[3]); // FR knee
  expect(after[5]).toBeLessThan(before[5]); // RL knee
  expect(after[4]).toBeGreaterThan(before[4]); // RL hip toward the nose
  expect(after[1]).toBe(before[1]); // FL untouched
});
