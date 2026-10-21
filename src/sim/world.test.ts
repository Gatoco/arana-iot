/**
 * Test zone (S2, S18, S19): colliders shared by the body and the ultrasonic sensor.
 */

import { test, expect } from "vitest";
import * as THREE from "three";
import {
  ARENA,
  BODY_RADIUS,
  CYLINDER,
  OBSTACLE,
  senseDistance,
  headingVector,
  resolveCollision,
} from "./world";
import { SENSOR } from "./spiderModel";
import { createEngine } from "./engine";
import { bodyRotationY } from "../scene/heading";
import { CMD_KIND, GAIT } from "../protocol";

const DT = 1 / 30;
const MM = 0.001;
const NOSE = -SENSOR.origin.z;

test("S2: arena is 12x12 m and the obstacle is 40x40x30 cm", () => {
  expect(ARENA.size).toBe(12);
  expect(OBSTACLE.size).toEqual({ x: 0.4, y: 0.3, z: 0.4 });
});

test("sonar reads the box face straight ahead within 1 mm", () => {
  const pose = { x: 0, z: 0, yaw: 0 };
  const expected = OBSTACLE.center.z - OBSTACLE.size.z / 2 - NOSE;
  expect(Math.abs(senseDistance(pose)! - expected)).toBeLessThan(MM);
});

test("sonar reads the cylinder within 1 mm", () => {
  const pose = { x: CYLINDER.center.x, z: 1.9, yaw: 0 };
  const expected = CYLINDER.center.z - CYLINDER.radius - (1.9 + NOSE);
  expect(Math.abs(senseDistance(pose)! - expected)).toBeLessThan(MM);
});

test("sonar reads the arena boundary when in range, null beyond 4 m", () => {
  const near = { x: 3, z: 0, yaw: Math.PI / 2 };
  expect(Math.abs(senseDistance(near)! - (ARENA.size / 2 - 3 - NOSE))).toBeLessThan(MM);
  expect(senseDistance({ x: 0, z: 0, yaw: Math.PI })).toBeNull();
});

test("sonar never reports below the HC-SR04 minimum", () => {
  const pose = { x: 0, z: OBSTACLE.center.z - OBSTACLE.size.z / 2 - NOSE - 0.001, yaw: 0 };
  expect(senseDistance(pose)).toBe(SENSOR.minRange);
});

test("walking straight into the box stops at a stable distance", () => {
  const engine = createEngine();
  engine.teleport(0, 0.9, 0);
  engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
  const zs: number[] = [];
  for (let i = 0; i < 30 * 30; i++) {
    engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
    engine.step(DT);
    zs.push(engine.getState().z);
  }
  const face = OBSTACLE.center.z - OBSTACLE.size.z / 2;
  const last = zs.slice(-60);
  expect(Math.max(...zs)).toBeLessThanOrEqual(face - BODY_RADIUS + 1e-9);
  expect(Math.max(...last) - Math.min(...last)).toBeLessThan(MM);
  expect(engine.getState().collided).toBe(true);
});

test("sliding along the boundary never penetrates it", () => {
  const engine = createEngine();
  const half = ARENA.size / 2;
  engine.teleport(half - BODY_RADIUS - 0.05, 0, Math.PI / 2 - 0.4);
  engine.apply({ kind: CMD_KIND.GAIT, gait: GAIT.TETRAPOD });
  let maxX = -Infinity;
  for (let i = 0; i < 30 * 25; i++) {
    engine.apply({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 });
    engine.step(DT);
    maxX = Math.max(maxX, engine.getState().x);
  }
  expect(maxX).toBeLessThanOrEqual(half - BODY_RADIUS + 1e-9);
  expect(engine.getState().z).toBeGreaterThan(0.1); // it slid along the wall
});

test("collision push-out works for boxes and cylinders", () => {
  const inBox = resolveCollision(0, OBSTACLE.center.z - 0.1);
  expect(inBox.hit).toBe(true);
  const inCyl = resolveCollision(CYLINDER.center.x + 0.1, CYLINDER.center.z);
  expect(Math.hypot(inCyl.x - CYLINDER.center.x, inCyl.z - CYLINDER.center.z)).toBeCloseTo(
    CYLINDER.radius + BODY_RADIUS,
    9,
  );
});

test("S4: the rendered nose (and the HC-SR04) points where the body moves", () => {
  for (const yaw of [0, 0.7, Math.PI / 2, -2.1]) {
    const nose = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), bodyRotationY(yaw));
    const [hx, hz] = headingVector(yaw);
    expect(nose.x).toBeCloseTo(hx, 6);
    expect(nose.z).toBeCloseTo(hz, 6);
  }
  expect(bodyRotationY(0)).toBeCloseTo(Math.PI, 12);
});
