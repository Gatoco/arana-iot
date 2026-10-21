/**
 * S14 / S16: the rendered spider is the solver's spider. Same joints -> same feet, and the
 * hierarchy has exactly 4 legs and 8 MG90S servos.
 */

import { test, expect } from "vitest";
import * as THREE from "three";
import { LEGS } from "../protocol";
import { LEG_CONFIG, NEUTRAL_POSE, toRadians } from "../sim/spiderModel";
import { footFromJoints } from "../sim/legKinematics";
import { createMaterials } from "./materials";
import { applyJoints, buildSpider, describeRig } from "./spiderMesh";

const rig = buildSpider(createMaterials());

test("4 legs and exactly 8 named MG90S servos (4 hip yaw + 4 knee pitch)", () => {
  const names: string[] = [];
  rig.root.traverse((o) => names.push(o.name));
  expect(names.filter((n) => /^hip:/.test(n))).toHaveLength(4);
  expect(names.filter((n) => /^knee:/.test(n))).toHaveLength(4);
  expect(names.filter((n) => /^servo:..:hip$/.test(n))).toHaveLength(4);
  expect(names.filter((n) => /^servo:..:knee$/.test(n))).toHaveLength(4);
  expect(names.filter((n) => /^servo:/.test(n))).toHaveLength(8);
  expect(names.filter((n) => /^foot:/.test(n))).toHaveLength(4);
  expect(describeRig(rig.root).length).toBeGreaterThan(20);
});

test("rendered foot tips match footFromJoints for any joints", () => {
  const poses = [
    NEUTRAL_POSE,
    LEGS.flatMap(() => [0, 0]),
    LEGS.flatMap((_, i) => [toRadians(i % 2 ? 20 : -15), toRadians(70 - i * 10)]),
  ];
  for (const joints of poses) {
    applyJoints(rig, joints);
    rig.root.updateMatrixWorld(true);
    LEGS.forEach((leg, i) => {
      const cfg = LEG_CONFIG[leg];
      const zt = -cfg.side * cfg.end * cfg.kneeOffset;
      const tip = new THREE.Vector3(cfg.tibiaLength, 0, zt).applyMatrix4(rig.legs[leg].knee.matrixWorld);
      const fk = footFromJoints(cfg, joints[2 * i], joints[2 * i + 1]);
      expect(tip.distanceTo(new THREE.Vector3(fk.x, fk.y, fk.z))).toBeLessThan(1e-9);
    });
  }
});

test("the rubber sleeve ends at the foot point", () => {
  applyJoints(rig, NEUTRAL_POSE);
  rig.root.updateMatrixWorld(true);
  for (const leg of LEGS) {
    const foot = rig.root.getObjectByName(`foot:${leg}`) as THREE.Mesh;
    foot.geometry.computeBoundingBox();
    const bb = foot.geometry.boundingBox!;
    expect(bb.max.x).toBeCloseTo(LEG_CONFIG[leg].tibiaLength, 6);
  }
});
