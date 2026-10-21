/**
 * S14: one 2-DOF leg solver (hip yaw + knee pitch, passive horizontal femur).
 */

import { test, expect } from "vitest";
import { LEGS, LEG } from "../protocol";
import { LEG_CONFIG, SPIDER, NEUTRAL_POSE, toRadians } from "./spiderModel";
import { footFromJoints, solveLegToFoot, clampJoints } from "./legKinematics";

const MM = 0.001;

test("FK -> IK round trip recovers the joints for every leg", () => {
  for (const leg of LEGS) {
    const cfg = LEG_CONFIG[leg];
    for (const hipDeg of [-30, -10, 0, 20, 35]) {
      for (const kneeDeg of [10, 45, 75, 100]) {
        const hip = toRadians(cfg.end < 0 ? hipDeg : -hipDeg);
        const knee = toRadians(kneeDeg);
        const foot = footFromJoints(cfg, hip, knee);
        const sol = solveLegToFoot(cfg, foot);
        expect(sol.reachable, `${leg} ${hipDeg}/${kneeDeg}`).toBe(true);
        expect(sol.hipYaw).toBeCloseTo(hip, 9);
        expect(sol.kneePitch).toBeCloseTo(knee, 9);
        expect(Math.hypot(sol.foot.x - foot.x, sol.foot.y - foot.y, sol.foot.z - foot.z)).toBeLessThan(1e-9);
      }
    }
  }
});

test("positive hip yaw moves every foot toward the nose (-Z)", () => {
  for (const leg of LEGS) {
    const cfg = LEG_CONFIG[leg];
    const a = footFromJoints(cfg, 0, toRadians(45));
    const b = footFromJoints(cfg, toRadians(10), toRadians(45));
    expect(b.z).toBeLessThan(a.z);
  }
});

test("positive knee pitch moves the foot down", () => {
  const cfg = LEG_CONFIG[LEG.FR];
  const flat = footFromJoints(cfg, 0, 0);
  const bent = footFromJoints(cfg, 0, toRadians(60));
  expect(flat.y).toBeCloseTo(0, 12);
  expect(bent.y).toBeLessThan(-0.05);
  expect(flat.x).toBeCloseTo(SPIDER.hip.x + SPIDER.femurLength + SPIDER.tibiaLength, 12);
});

test("unreachable targets clamp, report unreachable and never return NaN", () => {
  const cfg = LEG_CONFIG[LEG.FL];
  const targets = [
    { x: 9, y: 0, z: 9 },
    { x: -9, y: -9, z: 0 },
    { x: cfg.hip.x, y: 0, z: cfg.hip.z },
    { x: Number.NaN, y: 0, z: 0 },
  ];
  for (const t of targets) {
    const sol = solveLegToFoot(cfg, t);
    expect(sol.reachable).toBe(false);
    for (const v of [sol.hipYaw, sol.kneePitch, sol.foot.x, sol.foot.y, sol.foot.z]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(sol.hipYaw).toBeGreaterThanOrEqual(cfg.hipYawLimits[0]);
    expect(sol.hipYaw).toBeLessThanOrEqual(cfg.hipYawLimits[1]);
    expect(sol.kneePitch).toBeGreaterThanOrEqual(cfg.kneeLimits[0]);
    expect(sol.kneePitch).toBeLessThanOrEqual(cfg.kneeLimits[1]);
  }
});

test("clampJoints keeps the 8 joints inside each leg's limits", () => {
  const clamped = clampJoints([9, 9, -9, -9, 9, 9, -9, -9]);
  expect(clamped).toHaveLength(8);
  LEGS.forEach((leg, i) => {
    const cfg = LEG_CONFIG[leg];
    expect(clamped[2 * i]).toBeGreaterThanOrEqual(cfg.hipYawLimits[0]);
    expect(clamped[2 * i]).toBeLessThanOrEqual(cfg.hipYawLimits[1]);
    expect(clamped[2 * i + 1]).toBeGreaterThanOrEqual(cfg.kneeLimits[0]);
    expect(clamped[2 * i + 1]).toBeLessThanOrEqual(cfg.kneeLimits[1]);
  });
});

test("neutral pose: front feet forward-out, rear feet backward-out, symmetric footprint", () => {
  const feet = LEGS.map((leg, i) =>
    footFromJoints(LEG_CONFIG[leg], NEUTRAL_POSE[2 * i], NEUTRAL_POSE[2 * i + 1]),
  );
  const [fl, fr, rl, rr] = feet;
  expect(fl.x).toBeLessThan(-SPIDER.hip.x);
  expect(fr.x).toBeGreaterThan(SPIDER.hip.x);
  expect(fl.z).toBeLessThan(-SPIDER.hip.z);
  expect(rr.z).toBeGreaterThan(SPIDER.hip.z);
  // Mirror symmetry within 0.1 mm.
  expect(Math.abs(fl.x + fr.x)).toBeLessThan(0.1 * MM);
  expect(Math.abs(fl.z - rl.z * -1)).toBeLessThan(0.1 * MM);
  // All feet on one plane (same drop below the femur plane).
  for (const f of feet) expect(f.y).toBeCloseTo(fl.y, 9);
  // Footprint of the photographed pose: wider than long, foot span ≈ 3.9 face widths
  // (LA072_3.jpg, scale-free ratio). See odd/tasks/desktop-experience.md.
  const width = fr.x - fl.x;
  const length = rr.z - fr.z;
  expect(width).toBeGreaterThan(0.18);
  expect(width).toBeLessThan(0.22);
  expect(length).toBeGreaterThan(0.12);
  expect(length).toBeLessThan(0.16);
  expect(width / SPIDER.face.width).toBeGreaterThan(3.6);
  expect(width / SPIDER.face.width).toBeLessThan(4.2);
});
