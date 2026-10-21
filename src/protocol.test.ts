/**
 * Wire compatibility: unknown input is ignored, joint order and turn sign are stable,
 * and the additive `pose` command is part of `Command`.
 */

import { test, expect } from "vitest";
import { CMD_KIND, GAIT, POSE, SERVO_COUNT, type Command } from "./protocol";
import { createEngine } from "./sim/engine";
import { joystickToMove } from "./ui/joystickMath";

test("pose is a Command kind", () => {
  const cmd: Command = { kind: CMD_KIND.POSE, pose: POSE.HELLO };
  expect(JSON.parse(JSON.stringify(cmd))).toEqual({ kind: "pose", pose: "hello" });
});

test("unknown command kinds and malformed payloads are ignored", () => {
  const engine = createEngine();
  const before = JSON.stringify({ ...engine.getState(), operatorIdle: 0 });
  const junk = [
    { kind: "selfdestruct" },
    null,
    { kind: CMD_KIND.GAIT, gait: "gallop" },
    { kind: CMD_KIND.MOVE, forward: "fast", turn: 0 },
    { kind: CMD_KIND.MOVE, forward: Number.NaN, turn: 0 },
    { kind: CMD_KIND.POSE, pose: 42 },
  ];
  for (const cmd of junk) expect(() => engine.apply(cmd as unknown as Command)).not.toThrow();
  expect(JSON.stringify({ ...engine.getState(), operatorIdle: 0 })).toBe(before);
  expect(engine.getState().gait).toBe(GAIT.REST);
});

test("invalid commands do not count as operator activity (manual still times out)", () => {
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
  for (let i = 0; i < 90; i++) engine.step(1 / 30);
  const idle = engine.getState().operatorIdle;
  engine.apply({ kind: "selfdestruct" } as unknown as Command);
  engine.apply({ kind: CMD_KIND.POSE, pose: "moonwalk" } as unknown as Command);
  engine.apply({ kind: CMD_KIND.MOVE, forward: Number.NaN, turn: 0 });
  expect(engine.getState().operatorIdle).toBe(idle);
});

test("telemetry joints: 8 values, hip then knee per leg, FL FR RL RR", () => {
  const t = createEngine().telemetry();
  expect(t.joints).toHaveLength(SERVO_COUNT);
  const [flHip, flKnee, frHip, frKnee, rlHip, rlKnee, rrHip, rrKnee] = t.joints;
  // Neutral stance: front hips forward (+), rear hips back (-), knees 65° down (+).
  expect(flHip).toBeCloseTo(45, 6);
  expect(frHip).toBeCloseTo(45, 6);
  expect(rlHip).toBeCloseTo(-45, 6);
  expect(rrHip).toBeCloseTo(-45, 6);
  for (const k of [flKnee, frKnee, rlKnee, rrKnee]) expect(k).toBeCloseTo(65, 6);
});

test("joystick right sends a negative turn (positive turn = left)", () => {
  expect(joystickToMove(1, 0).turn).toBeLessThan(0);
  expect(joystickToMove(-1, 0).turn).toBeGreaterThan(0);
});
