/**
 * Test zone: a 12x12 m arena with corner pillars and one obstacle.
 *
 * Shared by the engine (sensor, bounds) and the 3D view (geometry), so what the
 * spider "sees" and what is drawn are the same numbers.
 */

import { BODY, SENSOR } from "./spiderModel";

export const ARENA = {
  /** Side of the square arena, meters. */
  size: 12,
} as const;

/** Square pillars standing at the four arena corners. */
export const PILLAR = {
  side: 0.3,
  height: 1.6,
} as const;

/** Axis-aligned box on the floor. */
export interface Box {
  center: { x: number; z: number };
  size: { x: number; y: number; z: number };
}

/** 40x40x30 cm obstacle, 1.5 m ahead of the origin along the start heading. */
export const OBSTACLE: Box = {
  center: { x: 0, z: 1.5 },
  size: { x: 0.4, y: 0.3, z: 0.4 },
};

export interface Pose {
  x: number;
  z: number;
  /** Heading, radians. 0 faces +Z; positive turns toward +X (left, seen from behind). */
  yaw: number;
}

/** Unit vector (x, z) the body moves along for a heading. */
export function headingVector(yaw: number): [number, number] {
  return [Math.sin(yaw), Math.cos(yaw)];
}

/**
 * Ultrasonic reading from the sensor at the body's nose, straight along the
 * heading. Returns null when nothing is within the HC-SR04 range.
 */
export function senseDistance(pose: Pose): number | null {
  const [dx, dz] = headingVector(pose.yaw);
  const ox = pose.x + dx * (BODY.length / 2);
  const oz = pose.z + dz * (BODY.length / 2);

  const hit = Math.min(rayToArenaWall(ox, oz, dx, dz), rayToBox(ox, oz, dx, dz, OBSTACLE));
  if (hit > SENSOR.maxRange) return null;
  return Math.max(SENSOR.minRange, hit);
}

function rayToArenaWall(ox: number, oz: number, dx: number, dz: number): number {
  const half = ARENA.size / 2;
  let t = Infinity;
  if (dx > 1e-9) t = Math.min(t, (half - ox) / dx);
  if (dx < -1e-9) t = Math.min(t, (-half - ox) / dx);
  if (dz > 1e-9) t = Math.min(t, (half - oz) / dz);
  if (dz < -1e-9) t = Math.min(t, (-half - oz) / dz);
  return Math.max(0, t);
}

/** Slab test in the floor plane; the sensor sits below the obstacle top. */
function rayToBox(ox: number, oz: number, dx: number, dz: number, box: Box): number {
  const min = [box.center.x - box.size.x / 2, box.center.z - box.size.z / 2];
  const max = [box.center.x + box.size.x / 2, box.center.z + box.size.z / 2];
  const o = [ox, oz];
  const d = [dx, dz];
  let tNear = -Infinity;
  let tFar = Infinity;
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return Infinity;
      continue;
    }
    const t1 = (min[i] - o[i]) / d[i];
    const t2 = (max[i] - o[i]) / d[i];
    tNear = Math.max(tNear, Math.min(t1, t2));
    tFar = Math.min(tFar, Math.max(t1, t2));
  }
  if (tNear > tFar || tFar < 0) return Infinity;
  return Math.max(0, tNear);
}
