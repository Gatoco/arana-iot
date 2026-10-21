import { test, expect } from "vitest";
import { applyThrottle, DEADZONE, joystickToMove, keysToMove } from "./joystickMath";
import { barFromZero, clampDeg, normalize } from "./servoMath";
import { parsePrefs, DEFAULT_PREFS, PANEL_MAX } from "./prefs";

test("pushing up drives forward, pushing right turns right (negative turn)", () => {
  expect(joystickToMove(0, -1)).toEqual({ forward: 1, turn: 0 });
  expect(joystickToMove(1, 0)).toEqual({ forward: 0, turn: -1 });
  expect(joystickToMove(-1, 0)).toEqual({ forward: 0, turn: 1 });
});

test("deadzone kills small offsets and full deflection still reaches 1", () => {
  expect(joystickToMove(0.05, 0.03, DEADZONE)).toEqual({ forward: 0, turn: 0 });
  expect(joystickToMove(0, -1, DEADZONE).forward).toBeCloseTo(1, 12);
  expect(joystickToMove(0, -2, DEADZONE).forward).toBeCloseTo(1, 12);
  const half = joystickToMove(0, -0.54, DEADZONE).forward;
  expect(half).toBeCloseTo(0.5, 6);
  expect(joystickToMove(Number.NaN, 0, DEADZONE)).toEqual({ forward: 0, turn: 0 });
});

test("throttle scales the command and is clamped", () => {
  expect(applyThrottle({ forward: 1, turn: -1 }, 0.7)).toEqual({ forward: 0.7, turn: -0.7 });
  expect(applyThrottle({ forward: 1, turn: 1 }, 3)).toEqual({ forward: 1, turn: 1 });
  expect(applyThrottle({ forward: 1, turn: 1 }, Number.NaN)).toEqual({ forward: 0, turn: 0 });
});

test("WASD: D turns right (negative), opposite keys cancel", () => {
  expect(keysToMove(new Set(["w"]))).toEqual({ forward: 1, turn: 0 });
  expect(keysToMove(new Set(["d"]))).toEqual({ forward: 0, turn: -1 });
  expect(keysToMove(new Set(["a", "d", "w", "s"]))).toEqual({ forward: 0, turn: 0 });
});

test("servo bars: zero tick inside the limits, no division by zero", () => {
  expect(normalize(5, 5, 5)).toBe(0.5);
  expect(normalize(Number.NaN, 0, 1)).toBe(0.5);
  const hip = barFromZero(45, -40, 90);
  expect(hip.zero).toBeCloseTo(40 / 130, 12);
  expect(hip.left).toBeCloseTo(hip.zero, 12);
  expect(hip.width).toBeCloseTo(45 / 130, 12);
  const back = barFromZero(-20, -40, 90);
  expect(back.left + back.width).toBeCloseTo(back.zero, 12);
  expect(clampDeg(200, -30, 110)).toBe(110);
});

test("prefs: corrupt or partial storage falls back to defaults", () => {
  expect(parsePrefs("{not json")).toEqual(DEFAULT_PREFS);
  expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
  const p = parsePrefs(JSON.stringify({ panelWidth: 999, camera: "drone", password: "x" }));
  expect(p.panelWidth).toBe(PANEL_MAX);
  expect(p.camera).toBe(DEFAULT_PREFS.camera);
});
