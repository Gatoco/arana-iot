/**
 * S17: walking with 2-DOF legs. Stance feet stay planted, swing feet clear the floor,
 * joints stay in limits, and the body motion that emerges is monotonic.
 */

import { test, expect } from "vitest";
import { createEngine, type TwinEngine } from "./engine";
import { CMD_KIND, GAIT, LEGS, SERVO_COUNT, type Gait } from "../protocol";
import { LEG_CONFIG } from "./spiderModel";
import { REST_FOOTHOLDS } from "./gait";
import { headingVector } from "./world";

const DT = 1 / 30;
const MM = 0.001;

function engineOnOpenFloor(): TwinEngine {
  const engine = createEngine();
  engine.setWorld({ sensor: false, collision: false });
  return engine;
}

function drive(engine: TwinEngine, gait: Gait, forward: number, turn: number): void {
  engine.apply({ kind: CMD_KIND.GAIT, gait });
  engine.apply({ kind: CMD_KIND.MOVE, forward, turn });
}

function run(engine: TwinEngine, seconds: number, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    engine.step(DT);
    each?.();
  }
}

for (const gait of [GAIT.TETRAPOD, GAIT.WAVE] as const) {
  test(`${gait}: stance feet stay planted (< 1 mm horizontal, < 2 mm vertical)`, () => {
    const engine = engineOnOpenFloor();
    drive(engine, gait, 1, 0.3);
    run(engine, 2);
    const planted: ({ x: number; z: number } | null)[] = [null, null, null, null];
    let worstXZ = 0;
    let worstY = 0;
    run(engine, 8, () => {
      const s = engine.getState();
      s.feet.forEach((f, i) => {
        if (!s.contact[i]) {
          planted[i] = null;
          return;
        }
        const p = planted[i] ?? (planted[i] = { x: f.x, z: f.z });
        worstXZ = Math.max(worstXZ, Math.hypot(f.x - p.x, f.z - p.z));
        worstY = Math.max(worstY, Math.abs(f.y));
      });
    });
    expect(worstXZ).toBeLessThan(1 * MM);
    expect(worstY).toBeLessThan(2 * MM);
  });

  // A 2-DOF leg cannot choose its foot height: a swing foot lands where its knee puts it, and the
// body absorbs the difference while the foot reloads (gait.ts swingLoad). Steady state lands
// within ~1.7 mm; the first step after standing up within 3 mm.
test(`${gait}: swing feet clear the floor by 5 mm and land within 3 mm of it`, () => {
    const engine = engineOnOpenFloor();
    drive(engine, gait, 1, 0);
    run(engine, 1);
    const peak = [0, 0, 0, 0];
    const landings: number[] = [];
    let wasContact = [...engine.getState().contact];
    run(engine, 6, () => {
      const s = engine.getState();
      s.feet.forEach((f, i) => {
        if (!s.contact[i]) peak[i] = Math.max(peak[i], f.y);
        if (s.contact[i] && !wasContact[i]) landings.push(f.y);
      });
      wasContact = [...s.contact];
    });
    for (const p of peak) expect(p).toBeGreaterThan(5 * MM);
    expect(landings.length).toBeGreaterThan(3);
    for (const y of landings) expect(Math.abs(y)).toBeLessThan(3 * MM);
  });

  test(`${gait}: no joint leaves its limits over 10 s of mixed commands`, () => {
    const engine = engineOnOpenFloor();
    const commands = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
    ];
    for (const [f, t] of commands) {
      drive(engine, gait, f, t);
      run(engine, 10 / commands.length, () => {
        const j = engine.getState().joints;
        LEGS.forEach((leg, i) => {
          const cfg = LEG_CONFIG[leg];
          expect(j[2 * i]).toBeGreaterThanOrEqual(cfg.hipYawLimits[0] - 1e-9);
          expect(j[2 * i]).toBeLessThanOrEqual(cfg.hipYawLimits[1] + 1e-9);
          expect(j[2 * i + 1]).toBeGreaterThanOrEqual(cfg.kneeLimits[0] - 1e-9);
          expect(j[2 * i + 1]).toBeLessThanOrEqual(cfg.kneeLimits[1] + 1e-9);
          expect(Number.isFinite(j[2 * i] + j[2 * i + 1])).toBe(true);
        });
      });
    }
  });
}

// The body origin sits on the femur plane ~60 mm above the floor, so a fraction of a degree of
// rocking moves it a fraction of a millimeter: "monotonic" allows that, not a step back.
test("constant forward command: body advances monotonically along its heading", () => {
  const engine = engineOnOpenFloor();
  drive(engine, GAIT.TETRAPOD, 1, 0);
  const [hx, hz] = headingVector(0);
  let prev = 0;
  let back = 0;
  run(engine, 10, () => {
    const s = engine.getState();
    const along = s.x * hx + s.z * hz;
    back = Math.max(back, prev - along);
    prev = along;
  });
  expect(back).toBeLessThan(1 * MM);
  expect(prev).toBeGreaterThan(0.15);
  expect(Math.abs(engine.getState().yaw)).toBeLessThan(0.02);
});

test("positive turn (left, per protocol) increases yaw monotonically and stays in place", () => {
  const engine = engineOnOpenFloor();
  drive(engine, GAIT.TETRAPOD, 0, 1);
  let prev = 0;
  let back = 0;
  run(engine, 8, () => {
    const yaw = engine.getState().yaw;
    back = Math.max(back, prev - yaw);
    prev = yaw;
  });
  expect(back).toBeLessThan(1e-6);
  expect(prev).toBeGreaterThan(0.5);
  const s = engine.getState();
  expect(Math.hypot(s.x, s.z)).toBeLessThan(0.02);
});

test("engine emits 8 servos and stop returns to rest", () => {
  const engine = engineOnOpenFloor();
  drive(engine, GAIT.TETRAPOD, 1, 0);
  run(engine, 2);
  expect(engine.joints()).toHaveLength(SERVO_COUNT);
  expect(engine.telemetry().joints).toHaveLength(SERVO_COUNT);
  engine.apply({ kind: CMD_KIND.STOP });
  const s = engine.getState();
  expect(s.forward).toBe(0);
  expect(s.turn).toBe(0);
  expect(s.gait).toBe(GAIT.REST);
});

test("rest re-places the feet on the neutral stance after walking", () => {
  const engine = engineOnOpenFloor();
  drive(engine, GAIT.TETRAPOD, 1, 0.5);
  run(engine, 4);
  engine.apply({ kind: CMD_KIND.STOP });
  run(engine, 6);
  const s = engine.getState();
  const c = Math.cos(s.yaw + Math.PI);
  const sn = Math.sin(s.yaw + Math.PI);
  LEGS.forEach((leg, i) => {
    // World foot back into the body frame (planar part).
    const dx = s.feet[i].x - s.x;
    const dz = s.feet[i].z - s.z;
    const bx = dx * c - dz * sn;
    const bz = dx * sn + dz * c;
    expect(Math.hypot(bx - REST_FOOTHOLDS[leg].x, bz - REST_FOOTHOLDS[leg].z)).toBeLessThan(5 * MM);
  });
  expect(s.contact.every(Boolean)).toBe(true);
});

test("neutral stance stands level, all four feet on the floor", () => {
  const engine = engineOnOpenFloor();
  run(engine, 0.5);
  const s = engine.getState();
  expect(s.contact.every(Boolean)).toBe(true);
  for (const f of s.feet) expect(Math.abs(f.y)).toBeLessThan(0.1 * MM);
  expect(Math.abs(s.pitch)).toBeLessThan(1e-6);
  expect(Math.abs(s.roll)).toBeLessThan(1e-6);
  expect(s.h).toBeGreaterThan(0.04);
});
