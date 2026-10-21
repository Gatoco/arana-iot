/**
 * Control mode (S5–S8): auto/manual arbitration between the operator and the brain.
 */

import { test, expect, vi } from "vitest";
import { createEngine, OPERATOR_IDLE_TIMEOUT_S } from "./engine";
import { TwinRuntime } from "../runtime/TwinRuntime";
import { CMD_KIND, CONTROL_MODE, GAIT } from "../protocol";

const DT = 1 / 30;

function stepFor(engine: ReturnType<typeof createEngine>, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) engine.step(DT);
}

test("S5: mode defaults to auto", () => {
  const engine = createEngine();
  expect(engine.getState().mode).toBe(CONTROL_MODE.AUTO);
});

test("S5: mode command switches between auto and manual", () => {
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.MODE, mode: CONTROL_MODE.MANUAL });
  expect(engine.getState().mode).toBe(CONTROL_MODE.MANUAL);
  engine.apply({ kind: CMD_KIND.MODE, mode: CONTROL_MODE.AUTO });
  expect(engine.getState().mode).toBe(CONTROL_MODE.AUTO);
});

test("S6: an operator move command switches to manual", () => {
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
  expect(engine.getState().mode).toBe(CONTROL_MODE.MANUAL);
});

test("S6: non-move commands do not leave auto", () => {
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.GAIT, gait: GAIT.WAVE });
  engine.apply({ kind: CMD_KIND.STOP });
  expect(engine.getState().mode).toBe(CONTROL_MODE.AUTO);
});

test("S7: 5 s without operator commands returns to auto", () => {
  expect(OPERATOR_IDLE_TIMEOUT_S).toBe(5);
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
  stepFor(engine, 4.9);
  expect(engine.getState().mode).toBe(CONTROL_MODE.MANUAL);
  stepFor(engine, 0.2);
  expect(engine.getState().mode).toBe(CONTROL_MODE.AUTO);
});

test("S7: any operator command restarts the idle timer", () => {
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
  stepFor(engine, 4);
  engine.apply({ kind: CMD_KIND.GAIT, gait: GAIT.WAVE });
  stepFor(engine, 4);
  expect(engine.getState().mode).toBe(CONTROL_MODE.MANUAL);
  stepFor(engine, 1.1);
  expect(engine.getState().mode).toBe(CONTROL_MODE.AUTO);
});

test("S8: telemetry carries the mode", () => {
  const engine = createEngine();
  expect(engine.telemetry().mode).toBe(CONTROL_MODE.AUTO);
  engine.apply({ kind: CMD_KIND.MOVE, forward: 0.5, turn: 0 });
  expect(engine.telemetry().mode).toBe(CONTROL_MODE.MANUAL);
});

test("brain state reaches the bridge only in auto", () => {
  const runtime = new TwinRuntime();
  const bridge = vi.fn();
  runtime.setBrainBridge(bridge);

  runtime.handleBrainState({ any: "payload" });
  expect(bridge).toHaveBeenCalledTimes(1);

  runtime.move(1, 0);
  runtime.handleBrainState({ any: "payload" });
  expect(bridge).toHaveBeenCalledTimes(1);
});
