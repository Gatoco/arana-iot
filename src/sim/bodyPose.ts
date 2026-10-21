/**
 * Body pose from the feet. No physics engine: the body rests on whichever feet touch the
 * floor, and planted feet do not slip. Two small solvers:
 *
 *   1. support fit: height, pitch and roll that put the supporting feet on y = 0
 *      (Gauss-Newton, regularized toward zero tilt so two diagonal feet stay well posed)
 *   2. planar fit: x, z and yaw that keep anchored feet where they were planted
 *      (2D Procrustes over the anchors)
 *
 * World transform: world = (x, h, z) + Ry(yaw + π) · Rx(pitch) · Rz(roll) · body
 * (the body nose is local -Z; heading vector of yaw is (sin yaw, cos yaw), see world.ts).
 * pitch > 0 lifts the nose, roll > 0 lifts the right side.
 */

import { SPIDER, type Vec3 } from "./spiderModel";

export interface BodyPose {
  x: number;
  z: number;
  yaw: number;
  /** Height of the femur plane (body frame origin) above the floor, meters. */
  h: number;
  pitch: number;
  roll: number;
}

export interface Tilt {
  h: number;
  pitch: number;
  roll: number;
}

/** Body point rotated by pitch/roll only (no yaw, no translation). */
export function tiltPoint(p: Vec3, pitch: number, roll: number): Vec3 {
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const qx = p.x * cr - p.y * sr;
  const qy = p.x * sr + p.y * cr;
  const qz = p.z;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return { x: qx, y: qy * cp - qz * sp, z: qy * sp + qz * cp };
}

/** Inverse of tiltPoint: level (yaw-aligned) frame -> body frame. */
export function untiltPoint(q: Vec3, pitch: number, roll: number): Vec3 {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y1 = q.y * cp + q.z * sp;
  const z1 = -q.y * sp + q.z * cp;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  return { x: q.x * cr + y1 * sr, y: -q.x * sr + y1 * cr, z: z1 };
}

/** Body frame -> world frame. */
export function toWorld(pose: BodyPose, p: Vec3): Vec3 {
  const t = tiltPoint(p, pose.pitch, pose.roll);
  const a = pose.yaw + Math.PI;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: pose.x + t.x * c + t.z * s, y: pose.h + t.y, z: pose.z - t.x * s + t.z * c };
}

/** World height of a body point for a given tilt. */
function worldY(tilt: Tilt, p: Vec3): number {
  return tilt.h + tiltPoint(p, tilt.pitch, tilt.roll).y;
}

const REG = 1e-4;

/**
 * Fit h, pitch, roll so the given feet sit on the floor. With 3+ feet the result is the
 * least-squares plane; with 2 the regularizer picks the least tilt; with 1 only h moves.
 */
export function fitSupport(feet: readonly Vec3[], prev: Tilt, weights?: readonly number[]): Tilt {
  if (feet.length === 0) return { ...prev };
  let { h, pitch, roll } = prev;
  for (let iter = 0; iter < 6; iter++) {
    // Normal equations (J^T J + R) d = -(J^T r + R x) for x = (h, pitch, roll).
    const A = [
      [0, 0, 0],
      [0, REG, 0],
      [0, 0, REG],
    ];
    const b = [0, -REG * pitch, -REG * roll];
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    feet.forEach((f, n) => {
      const wgt = weights ? weights[n] : 1;
      const qy = f.x * sr + f.y * cr;
      const r = h + qy * cp - f.z * sp;
      const j = [1, -qy * sp - f.z * cp, (f.x * cr - f.y * sr) * cp];
      for (let i = 0; i < 3; i++) {
        b[i] -= wgt * j[i] * r;
        for (let k = 0; k < 3; k++) A[i][k] += wgt * j[i] * j[k];
      }
    });
    if (feet.length === 1) {
      h += b[0] / A[0][0];
      break;
    }
    const d = solve3(A, b);
    if (!d) break;
    h += d[0];
    pitch += d[1];
    roll += d[2];
    if (Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) < 1e-10) break;
  }
  return { h, pitch, roll };
}

/** Raise the body if a belly point would go below the floor (it rests on its belly). */
export function restOnBelly(tilt: Tilt): Tilt {
  let lowest = Infinity;
  for (const p of SPIDER.belly) lowest = Math.min(lowest, worldY(tilt, p));
  return lowest < 0 ? { ...tilt, h: tilt.h - lowest } : tilt;
}

/**
 * Geometric support for joint-driven motion (actions, servo test): the body settles on the
 * lowest feet. Tries all four, then each triangle that holds the body center, then the
 * lowest pair. Returns the tilt and which feet carry the body.
 */
export function settleOnFeet(feet: readonly Vec3[], prev: Tilt): { tilt: Tilt; contact: boolean[] } {
  const all = [0, 1, 2, 3];
  const tolerance = 0.0015;
  const candidates: number[][] = [all, [0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
  let best: { tilt: Tilt; set: number[]; tiltSize: number } | null = null;
  for (const set of candidates) {
    const tilt = fitSupport(
      set.map((i) => feet[i]),
      prev,
    );
    const ys = feet.map((f) => worldY(tilt, f));
    const onFloor = set.every((i) => Math.abs(ys[i]) < tolerance);
    const noneBelow = ys.every((y) => y > -tolerance);
    if (!onFloor || !noneBelow) continue;
    if (set.length === 3 && !containsCenter(set.map((i) => feet[i]))) continue;
    const tiltSize = Math.abs(tilt.pitch) + Math.abs(tilt.roll);
    if (set.length === 4) {
      best = { tilt, set, tiltSize };
      break;
    }
    if (!best || tiltSize < best.tiltSize) best = { tilt, set, tiltSize };
  }
  if (!best) {
    // Two-point support (e.g. diagonal): rest on the two lowest feet.
    const order = all.slice().sort((a, b) => feet[a].y - feet[b].y);
    const set = order.slice(0, 2);
    best = { tilt: fitSupport(set.map((i) => feet[i]), prev), set, tiltSize: 0 };
  }
  const tilt = restOnBelly(best.tilt);
  const contact = feet.map((f) => worldY(tilt, f) < tolerance + 0.001);
  return { tilt, contact };
}

function containsCenter(tri: Vec3[]): boolean {
  const [a, b, c] = tri;
  const cross = (p: Vec3, q: Vec3) => (q.x - p.x) * (0 - p.z) - (q.z - p.z) * (0 - p.x);
  const d1 = cross(a, b);
  const d2 = cross(b, c);
  const d3 = cross(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

export interface Anchor {
  /** Planted world position (x, z). */
  x: number;
  z: number;
}

/**
 * Planar pose that keeps anchored feet still. `local` are the feet tilted into the horizontal
 * plane (tiltPoint), `anchors` the world positions they were planted at.
 */
export function fitPlanar(
  local: readonly Vec3[],
  anchors: readonly Anchor[],
  prev: { x: number; z: number; yaw: number },
): { x: number; z: number; yaw: number } {
  const n = local.length;
  if (n === 0) return { ...prev };
  if (n === 1) {
    const a = prev.yaw + Math.PI;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const p = local[0];
    return { x: anchors[0].x - (p.x * c + p.z * s), z: anchors[0].z - (-p.x * s + p.z * c), yaw: prev.yaw };
  }
  let lx = 0,
    lz = 0,
    ax = 0,
    az = 0;
  for (let i = 0; i < n; i++) {
    lx += local[i].x;
    lz += local[i].z;
    ax += anchors[i].x;
    az += anchors[i].z;
  }
  lx /= n;
  lz /= n;
  ax /= n;
  az /= n;
  // World (x, z) = R(a) local with R = [[c, s], [-s, c]] = standard rotation by beta = -a.
  let sxx = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    const px = local[i].x - lx;
    const pz = local[i].z - lz;
    const qx = anchors[i].x - ax;
    const qz = anchors[i].z - az;
    sxx += px * qx + pz * qz;
    sxy += px * qz - pz * qx;
  }
  const beta = Math.atan2(sxy, sxx);
  const a = -beta;
  const yawRaw = a - Math.PI;
  const yaw = prev.yaw + wrapAngle(yawRaw - prev.yaw);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: ax - (lx * c + lz * s), z: az - (-lx * s + lz * c), yaw };
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function solve3(A: number[][], b: number[]): number[] | null {
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-14) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k < 4; k++) m[r][k] -= f * m[col][k];
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}
