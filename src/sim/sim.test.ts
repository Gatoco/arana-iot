/**
 * Self-check for the non-trivial sim logic: gait stepping and leg IK.
 * Run: npx vitest run
 */

import { test, expect } from "vitest";
import { computeGait } from "./gait";
import { solveLeg, footPosition, LEG_GEOMETRY } from "./spiderModel";
import { createEngine } from "./engine";
import { CMD_KIND, GAIT, LEG, SERVO_COUNT } from "../protocol";

test("rest gait keeps all feet planted", () => {
  const out = computeGait({ forward: 0, turn: 0, gait: GAIT.REST, phase: 0.3 });
  for (const leg of Object.keys(out.targets)) {
    const t = out.targets[leg as keyof typeof out.targets];
    expect(t.height, `${leg} should stay planted`).toBe(0);
  }
  expect(out.speed).toBe(0);
});

test("moving produces exactly one lifted foot in wave gait", () => {
  const out = computeGait({ forward: 1, turn: 0, gait: GAIT.WAVE, phase: 0.1 });
  const lifted = Object.values(out.targets).filter((t) => t.height > 0).length;
  expect(lifted).toBe(1);
});

test("tetrapod lifts a diagonal pair", () => {
  const out = computeGait({ forward: 1, turn: 0, gait: GAIT.TETRAPOD, phase: 0.1 });
  expect(out.targets[LEG.FL].height).toBeGreaterThan(0);
  expect(out.targets[LEG.RR].height).toBeGreaterThan(0);
  expect(out.targets[LEG.FR].height).toBe(0);
  expect(out.targets[LEG.RL].height).toBe(0);
});

test("IK clamps and never returns NaN", () => {
  const a = solveLeg({ forward: 999, height: 999 });
  expect(Number.isFinite(a.coxa)).toBe(true);
  expect(Number.isFinite(a.femur)).toBe(true);
  const foot = footPosition(LEG.FL, { forward: 0, height: 0 });
  expect(foot.every((v) => Number.isFinite(v))).toBe(true);
  expect(Math.abs(foot[1])).toBeLessThanOrEqual(LEG_GEOMETRY.hipHeight + LEG_GEOMETRY.lift + 1e-9);
});

test("engine integrates motion and emits 8 servos", () => {
  const engine = createEngine();
  engine.setWorld({ wall: null });
  engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
  for (let i = 0; i < 30; i++) engine.step(1 / 30);
  const s = engine.getState();
  expect(Math.abs(s.z)).toBeGreaterThan(0);
  expect(engine.joints().length).toBe(SERVO_COUNT);
  expect(engine.telemetry().joints.length).toBe(SERVO_COUNT);
});

test("stop command resets to rest", () => {
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 1 });
  engine.apply({ kind: CMD_KIND.STOP });
  const s = engine.getState();
  expect(s.forward).toBe(0);
  expect(s.turn).toBe(0);
  expect(s.gait).toBe(GAIT.REST);
});
