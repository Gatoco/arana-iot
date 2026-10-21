/**
 * Test zone: a 12x12 m arena with low boundary walls, corner pillars and three obstacles.
 *
 * One collider list feeds the body collision, the ultrasonic ray and the 3D view, so what the
 * spider bumps into, what it "sees" and what is drawn are the same numbers.
 */

import { SENSOR } from "./spiderModel";

export const ARENA = {
  /** Side of the square arena, meters. */
  size: 12,
} as const;

/** Square pillars standing at the four arena corners. */
export const PILLAR = {
  side: 0.3,
  height: 0.6,
} as const;

/** Axis-aligned box on the floor. */
export interface Box {
  kind: "box";
  name: string;
  center: { x: number; z: number };
  size: { x: number; y: number; z: number };
}

/** Vertical cylinder on the floor. */
export interface Cylinder {
  kind: "cylinder";
  name: string;
  center: { x: number; z: number };
  radius: number;
  height: number;
}

export type Collider = Box | Cylinder;

/** 40x40x30 cm obstacle, 1.5 m ahead of the origin along the start heading. */
export const OBSTACLE: Box = {
  kind: "box",
  name: "box",
  center: { x: 0, z: 1.5 },
  size: { x: 0.4, y: 0.3, z: 0.4 },
};

export const CYLINDER: Cylinder = {
  kind: "cylinder",
  name: "cylinder",
  center: { x: 0.8, z: 2.5 },
  radius: 0.15,
  height: 0.3,
};

/** Low wall across the sonar lane at z = 3.5 m. */
export const LOW_WALL: Box = {
  kind: "box",
  name: "wall",
  center: { x: -0.4, z: 3.5 },
  size: { x: 1.6, y: 0.12, z: 0.06 },
};

const BOUNDARY_THICKNESS = 0.05;
const BOUNDARY_HEIGHT = 0.1;

function boundary(): Box[] {
  const half = ARENA.size / 2;
  const t = BOUNDARY_THICKNESS;
  const long = ARENA.size + 2 * t;
  return [
    { kind: "box", name: "boundary+z", center: { x: 0, z: half + t / 2 }, size: { x: long, y: BOUNDARY_HEIGHT, z: t } },
    { kind: "box", name: "boundary-z", center: { x: 0, z: -half - t / 2 }, size: { x: long, y: BOUNDARY_HEIGHT, z: t } },
    { kind: "box", name: "boundary+x", center: { x: half + t / 2, z: 0 }, size: { x: t, y: BOUNDARY_HEIGHT, z: long } },
    { kind: "box", name: "boundary-x", center: { x: -half - t / 2, z: 0 }, size: { x: t, y: BOUNDARY_HEIGHT, z: long } },
  ];
}

function pillars(): Box[] {
  const inset = ARENA.size / 2 - PILLAR.side / 2;
  return [
    [inset, inset],
    [-inset, inset],
    [inset, -inset],
    [-inset, -inset],
  ].map(([x, z], i) => ({
    kind: "box" as const,
    name: `pillar${i}`,
    center: { x, z },
    size: { x: PILLAR.side, y: PILLAR.height, z: PILLAR.side },
  }));
}

export const COLLIDERS: readonly Collider[] = [OBSTACLE, CYLINDER, LOW_WALL, ...boundary(), ...pillars()];

/** Body footprint for collision: a circle around the body center that covers the feet. */
export const BODY_RADIUS = 0.12;

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

/** World (x, z) of the ultrasonic transducers for a body pose. */
export function sensorOrigin(pose: Pose): [number, number] {
  const [dx, dz] = headingVector(pose.yaw);
  const ahead = -SENSOR.origin.z;
  return [pose.x + dx * ahead, pose.z + dz * ahead];
}

/**
 * Ultrasonic reading straight along the heading from the transducers. Returns null when
 * nothing is within the HC-SR04 range. Uses the same colliders as the body.
 */
export function senseDistance(pose: Pose, colliders: readonly Collider[] = COLLIDERS): number | null {
  const [dx, dz] = headingVector(pose.yaw);
  const [ox, oz] = sensorOrigin(pose);
  const hit = raycast(ox, oz, dx, dz, colliders);
  if (hit > SENSOR.maxRange) return null;
  return Math.max(SENSOR.minRange, hit);
}

export function raycast(ox: number, oz: number, dx: number, dz: number, colliders: readonly Collider[]): number {
  let best = Infinity;
  for (const c of colliders) {
    const t = c.kind === "box" ? rayToBox(ox, oz, dx, dz, c) : rayToCircle(ox, oz, dx, dz, c);
    if (t < best) best = t;
  }
  return best;
}

/** Slab test in the floor plane. */
function rayToBox(ox: number, oz: number, dx: number, dz: number, box: Box): number {
  const min = [box.center.x - box.size.x / 2, box.center.z - box.size.z / 2];
  const max = [box.center.x + box.size.x / 2, box.center.z + box.size.z / 2];
  const o = [ox, oz];
  const d = [dx, dz];
  let tNear = -Infinity;
  let tFar = Infinity;
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-12) {
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

function rayToCircle(ox: number, oz: number, dx: number, dz: number, c: Cylinder): number {
  const fx = ox - c.center.x;
  const fz = oz - c.center.z;
  const b = fx * dx + fz * dz;
  const cc = fx * fx + fz * fz - c.radius * c.radius;
  if (cc <= 0) return 0;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}

/**
 * Push a body circle out of every collider along the shortest way out. Returns the corrected
 * center and whether anything was hit. Sliding falls out naturally: only the penetrating
 * component is removed.
 */
export function resolveCollision(
  x: number,
  z: number,
  radius: number = BODY_RADIUS,
  colliders: readonly Collider[] = COLLIDERS,
): { x: number; z: number; hit: boolean } {
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const c of colliders) {
      const push = c.kind === "box" ? pushFromBox(x, z, radius, c) : pushFromCircle(x, z, radius, c);
      if (push) {
        x += push[0];
        z += push[1];
        moved = true;
        hit = true;
      }
    }
    if (!moved) break;
  }
  return { x, z, hit };
}

function pushFromBox(x: number, z: number, r: number, box: Box): [number, number] | null {
  const hx = box.size.x / 2;
  const hz = box.size.z / 2;
  const cx = Math.min(Math.max(x, box.center.x - hx), box.center.x + hx);
  const cz = Math.min(Math.max(z, box.center.z - hz), box.center.z + hz);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-18) {
    const d = Math.sqrt(d2);
    return [(dx / d) * (r - d), (dz / d) * (r - d)];
  }
  // Center inside the box: leave through the nearest face.
  const exits: [number, number][] = [
    [box.center.x + hx + r - x, 0],
    [box.center.x - hx - r - x, 0],
    [0, box.center.z + hz + r - z],
    [0, box.center.z - hz - r - z],
  ];
  return exits.reduce((a, b) => (Math.hypot(...a) < Math.hypot(...b) ? a : b));
}

function pushFromCircle(x: number, z: number, r: number, c: Cylinder): [number, number] | null {
  const dx = x - c.center.x;
  const dz = z - c.center.z;
  const d = Math.hypot(dx, dz);
  const min = r + c.radius;
  if (d >= min) return null;
  if (d < 1e-12) return [min, 0];
  return [(dx / d) * (min - d), (dz / d) * (min - d)];
}
