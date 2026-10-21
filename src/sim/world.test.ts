/**
 * Test zone geometry (S2) and the ultrasonic sensor reading inside it.
 */

import { test, expect } from "vitest";
import * as THREE from "three";
import { ARENA, OBSTACLE, senseDistance, headingVector } from "./world";
import { BODY, SENSOR } from "./spiderModel";
import { createEngine } from "./engine";
import { bodyRotationY } from "../scene/heading";
import { CMD_KIND } from "../protocol";

test("S2: arena is 12x12 m and the obstacle is 40x40x30 cm", () => {
  expect(ARENA.size).toBe(12);
  expect(OBSTACLE.size).toEqual({ x: 0.4, y: 0.3, z: 0.4 });
});

test("sensor reads the obstacle face straight ahead", () => {
  const pose = { x: OBSTACLE.center.x, z: OBSTACLE.center.z - 1, yaw: 0 };
  const expected = 1 - OBSTACLE.size.z / 2 - BODY.length / 2;
  expect(senseDistance(pose)).toBeCloseTo(expected, 6);
});

test("sensor reads the arena wall when in range", () => {
  const pose = { x: 0, z: ARENA.size / 2 - 1, yaw: 0 };
  expect(senseDistance(pose)).toBeCloseTo(1 - BODY.length / 2, 6);
});

test("sensor returns null beyond the HC-SR04 range", () => {
  const pose = { x: 0, z: 0, yaw: Math.PI };
  expect(ARENA.size / 2).toBeGreaterThan(SENSOR.maxRange);
  expect(senseDistance(pose)).toBeNull();
});

test("sensor never reports below the HC-SR04 minimum", () => {
  const pose = {
    x: OBSTACLE.center.x,
    z: OBSTACLE.center.z - OBSTACLE.size.z / 2 - BODY.length / 2 - 0.001,
    yaw: 0,
  };
  expect(senseDistance(pose)).toBe(SENSOR.minRange);
});

test("engine keeps the body inside the 12x12 m arena", () => {
  const engine = createEngine();
  engine.apply({ kind: CMD_KIND.MOVE, forward: -1, turn: 0 });
  for (let i = 0; i < 30 * 60; i++) {
    engine.apply({ kind: CMD_KIND.MOVE, forward: -1, turn: 0 });
    engine.step(1 / 30);
  }
  expect(engine.getState().z).toBeLessThan(-1.5);
  expect(engine.getState().z).toBeGreaterThanOrEqual(-ARENA.size / 2);
});

test("S4: the rendered nose points where the body actually moves", () => {
  for (const yaw of [0, 0.7, Math.PI / 2, -2.1]) {
    const nose = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      bodyRotationY(yaw),
    );
    const [hx, hz] = headingVector(yaw);
    expect(nose.x).toBeCloseTo(hx, 6);
    expect(nose.z).toBeCloseTo(hz, 6);
  }
});
