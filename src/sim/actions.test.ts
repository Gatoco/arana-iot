/**
 * S20: the nine preset actions come from the firmware tables and behave like the firmware.
 */

import { test, expect } from "vitest";
import { ACTIONS, ACTION_ORDER, ActionPlayer, ACTION } from "./actions";
import { clampJoints } from "./legKinematics";
import { NEUTRAL_POSE, toDegrees } from "./spiderModel";
import { createEngine } from "./engine";
import { CMD_KIND, GAIT, POSE } from "../protocol";
import { firmwareToJoints, FIRMWARE_STANDBY } from "./servoMap";

const DT = 1 / 30;

test("all nine product actions exist, in the LA072_3 grid order", () => {
  expect(ACTION_ORDER).toHaveLength(9);
  expect(new Set(ACTION_ORDER).size).toBe(9);
  for (const name of ACTION_ORDER) expect(ACTIONS[name].name).toBe(name);
});

test("every keyframe is finite, inside the joint limits, with positive duration", () => {
  for (const name of ACTION_ORDER) {
    const spec = ACTIONS[name];
    expect(spec.duration, name).toBeGreaterThan(0);
    for (const f of spec.frames) {
      expect(f.duration).toBeGreaterThan(0);
      expect(f.joints).toHaveLength(8);
      for (const j of f.joints) expect(Number.isFinite(j)).toBe(true);
      expect(clampJoints(f.joints).map((v, i) => v - f.joints[i]).every((d) => Math.abs(d) < 1e-12), name).toBe(true);
    }
  }
});

test("player starts at the current pose and ends on the last keyframe", () => {
  const spec = ACTIONS[ACTION.LIE];
  const player = new ActionPlayer(spec, NEUTRAL_POSE);
  expect(player.sample(0)).toEqual(NEUTRAL_POSE);
  let joints: number[] = [];
  for (let t = 0; t < spec.duration + 0.2; t += DT) joints = player.step(DT);
  expect(player.done).toBe(true);
  joints.forEach((j, i) => expect(j).toBeCloseTo(spec.frames.at(-1)!.joints[i], 12));
});

test("standby ends on the firmware standby pose; greet raises the front-left foot", () => {
  const standby = ACTIONS[ACTION.STANDBY].frames.at(-1)!.joints;
  firmwareToJoints(FIRMWARE_STANDBY).forEach((j, i) => expect(standby[i]).toBeCloseTo(j, 12));
  const hello = ACTIONS[ACTION.HELLO];
  const raised = Math.min(...hello.frames.map((f) => toDegrees(f.joints[1])));
  expect(raised).toBeLessThan(0); // FL knee above the femur line: the "hand" is up
  // hello() ends with Prg_1, back to standby.
  hello.frames.at(-1)!.joints.forEach((j, i) => expect(j).toBeCloseTo(standby[i], 12));
});

test("pose command runs the action; stop cancels it and blends back to rest", () => {
  const engine = createEngine();
  engine.setWorld({ sensor: false });
  engine.apply({ kind: CMD_KIND.POSE, pose: POSE.PUSHUP });
  expect(engine.getState().controller).toBe("action");
  expect(engine.getState().action).toBe(POSE.PUSHUP);
  for (let i = 0; i < 30; i++) engine.step(DT);
  engine.apply({ kind: CMD_KIND.STOP });
  const s = engine.getState();
  expect(s.action).toBeNull();
  expect(s.controller).toBe("blend");
  expect(s.gait).toBe(GAIT.REST);
  for (let i = 0; i < 30; i++) engine.step(DT);
  expect(engine.getState().controller).toBe("rest");
  engine.getState().joints.forEach((j, i) => expect(j).toBeCloseTo(NEUTRAL_POSE[i], 6));
});

test("a move command cancels an action; an unknown pose is ignored", () => {
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.POSE, pose: "moonwalk" as never });
  expect(engine.getState().controller).toBe("rest");
  engine.apply({ kind: CMD_KIND.POSE, pose: POSE.FIGHTING });
  engine.step(DT);
  engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
  expect(engine.getState().action).toBeNull();
  expect(engine.getState().controller).toBe("blend");
});

test("lie down lowers the body; the action holds its last pose when done", () => {
  const engine = createEngine();
  engine.setWorld({ sensor: false });
  engine.step(DT);
  const standing = engine.getState().h;
  engine.apply({ kind: CMD_KIND.POSE, pose: POSE.LIE });
  for (let i = 0; i < 60; i++) engine.step(DT);
  const s = engine.getState();
  expect(s.controller).toBe("hold");
  expect(s.h).toBeLessThan(standing - 0.015);
  for (const f of s.feet) expect(f.y).toBeGreaterThan(-0.002);
});
