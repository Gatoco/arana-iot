import { test, expect } from "vitest";
import { joystickToMove } from "./joystickMath";

test("pushing up drives forward, pushing right turns right (negative turn)", () => {
  expect(joystickToMove(0, -1)).toEqual({ forward: 1, turn: 0 });
  expect(joystickToMove(1, 0)).toEqual({ forward: 0, turn: -1 });
  expect(joystickToMove(-1, 0)).toEqual({ forward: 0, turn: 1 });
});
