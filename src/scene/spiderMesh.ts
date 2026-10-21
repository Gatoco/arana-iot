/**
 * The LA072 spider as a Three.js hierarchy, built from SPIDER (src/sim/spiderModel.ts) only.
 *
 *   spider (root: world x, h, z; Euler YXZ = yaw + π, pitch, roll)
 *     body          chassis, electronics, cover, standoffs, face + HC-SR04, 18650 holder,
 *                   four hip servos, body wiring
 *     hip:<LEG>     rotates about Y by the hip yaw: horn, C-bracket, passive femur, wires
 *       knee:<LEG>  rotates about the knee axis: knee MG90S, forked tibia, rubber foot
 *
 * Each rigid part is merged per material (one draw call per finish). The joint angles come
 * from the engine; the leg geometry matches legKinematics.footFromJoints exactly.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LEGS, type LegId } from "../protocol";
import { LEG_CONFIG, SPIDER, SENSOR } from "../sim/spiderModel";
import type { SpiderMaterials } from "./materials";

export interface LegRig {
  hip: THREE.Group;
  knee: THREE.Group;
  /** +1 / -1: hip group yaw = ψ for right legs, π - ψ for left legs. */
  side: 1 | -1;
}

export interface SpiderRig {
  root: THREE.Group;
  body: THREE.Group;
  legs: Record<LegId, LegRig>;
}

// ------------------------------------------------------------------ geometry helpers

type Mat = THREE.Material;

/** Collects geometries of one rigid part and merges them per material. */
class Part {
  private byMat = new Map<Mat, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: Mat, matrix?: THREE.Matrix4): this {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    }
    if (!g.attributes.uv) {
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (matrix) g.applyMatrix4(matrix);
    g = g.index ? g.toNonIndexed() : g;
    const list = this.byMat.get(mat) ?? [];
    list.push(g);
    this.byMat.set(mat, list);
    geo.dispose();
    return this;
  }

  build(name: string, castShadow = true): THREE.Mesh {
    const mats: Mat[] = [];
    const merged: THREE.BufferGeometry[] = [];
    for (const [mat, list] of this.byMat) {
      const g = mergeGeometries(list, false);
      list.forEach((x) => x.dispose());
      if (!g) continue;
      mats.push(mat);
      merged.push(g);
    }
    const geo = mergeGeometries(merged, true) ?? new THREE.BufferGeometry();
    merged.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, mats);
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const M = () => new THREE.Matrix4();
const at = (x: number, y: number, z: number) => M().makeTranslation(x, y, z);
const rotX = (a: number) => M().makeRotationX(a);
const rotY = (a: number) => M().makeRotationY(a);
const chain = (...ms: THREE.Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), M());

function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Cylinder along Y. */
function cyl(r: number, h: number, seg = 20, rTop = r): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, r, h, seg);
}

function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  s.moveTo(x0 + r, y0);
  s.lineTo(x0 + w - r, y0);
  s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + h - r);
  s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  s.lineTo(x0 + r, y0 + h);
  s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  s.lineTo(x0, y0 + r);
  s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}

function rectPath(w: number, h: number, r: number, cx: number, cy: number): THREE.Path {
  const p = new THREE.Path();
  const s = roundedRect(w, h, r, cx, cy);
  p.curves = s.curves;
  return p;
}

function circlePath(r: number, cx: number, cy: number): THREE.Path {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

/** Extrude a shape (x, y) by depth along Z, centered on z = 0, with a small bevel. */
function extrude(shape: THREE.Shape, depth: number, bevel = 0.0004): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.translate(0, 0, -(depth - 2 * bevel) / 2);
  return g;
}

/** A flat plate: shape drawn in (x, z) plan view, thickness along Y centered on y = 0. */
function plate(shape: THREE.Shape, thickness: number, bevel = 0.0004): THREE.BufferGeometry {
  const g = extrude(shape, thickness, bevel);
  // rotateX(π/2) maps (x, y, z) -> (x, -z, y): the shape's y becomes world z.
  g.rotateX(Math.PI / 2);
  return g;
}

/** Ribbon of three servo wires along a curve. */
function wireRibbon(part: Part, mats: SpiderMaterials, points: THREE.Vector3[], normal = new THREE.Vector3(0, 1, 0)): void {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = Math.max(8, Math.round(curve.getLength() / 0.004));
  const colors = [mats.wireBrown, mats.wireRed, mats.wireOrange];
  colors.forEach((mat, i) => {
    const off = (i - 1) * 0.0011;
    const shifted = new THREE.CatmullRomCurve3(
      curve.getPoints(segs).map((p, k, arr) => {
        const next = arr[Math.min(arr.length - 1, k + 1)];
        const prev = arr[Math.max(0, k - 1)];
        const tangent = next.clone().sub(prev).normalize();
        const side = tangent.clone().cross(normal).normalize();
        if (!Number.isFinite(side.x)) return p.clone();
        return p.clone().addScaledVector(side, off);
      }),
    );
    part.add(new THREE.TubeGeometry(shifted, segs, 0.00055, 5, false), mat);
  });
}

function screwHead(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(0.0026, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.55, 1);
  return g;
}

/** Hex nut / standoff profile: cylinder with 6 sides. */
function hex(r: number, h: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, h, 6);
}

// ------------------------------------------------------------------ MG90S

const S = SPIDER.servo;

/**
 * One MG90S, local frame: shaft along +Y from the case top, case long side along +X with the
 * shaft `shaftOffset` from the -X end, thickness along Z. Origin at the shaft axis on the
 * case top face. The label sits on the +Z face.
 */
function addServo(part: Part, mats: SpiderMaterials, m: THREE.Matrix4, labelSide: 1 | -1 = 1): void {
  const cx = S.l / 2 - S.shaftOffset;
  part.add(box(S.l, S.h, S.w), mats.servoCase, chain(m, at(cx, -S.h / 2, 0)));
  // Mounting tabs at 15.9 mm from the case bottom.
  part.add(box(S.tabs, 0.0025, S.w), mats.servoCase, chain(m, at(cx, -S.h + 0.0159, 0)));
  // Dark gear-train bulge on top and the output shaft.
  part.add(cyl(0.0058, 0.004, 20), mats.servoDark, chain(m, at(0, 0.002, 0)));
  part.add(cyl(0.0024, 0.0035, 12), mats.servoDark, chain(m, at(0, 0.0055, 0)));
  // Pink label on the wide face.
  const label = new THREE.PlaneGeometry(S.l * 0.86, S.h * 0.42);
  part.add(
    label,
    mats.servoLabel,
    chain(m, at(cx, -S.h * 0.55, labelSide * (S.w / 2 + 0.0002)), rotY(labelSide > 0 ? 0 : Math.PI)),
  );
}

// ------------------------------------------------------------------ body

function buildBody(mats: SpiderMaterials): THREE.Group {
  const body = new THREE.Group();
  body.name = "body";
  const acrylic = new Part();
  const metal = new Part();
  const elec = new Part();
  const servos = new Part();
  const wires = new Part();

  // Chassis: H plate with servo cutouts at the corners and a central window.
  const C = SPIDER.chassis;
  const chassis = roundedRect(C.width, C.length, 0.004);
  chassis.holes.push(rectPath(0.034, 0.046, 0.004, 0, 0));
  for (const leg of LEGS) {
    const cfg = LEG_CONFIG[leg];
    const cz = cfg.hip.z - cfg.end * (S.l / 2 - S.shaftOffset);
    chassis.holes.push(rectPath(S.w + 0.0006, S.l + 0.0006, 0.0006, cfg.hip.x, cz));
  }
  acrylic.add(plate(chassis, C.thickness), mats.acrylic, at(0, C.y, 0));

  // Expansion board on four M3 nuts.
  const E = SPIDER.expansion;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      metal.add(hex(0.0029, 0.0027), mats.silver, at(sx * 0.0165, 0.0045, sz * 0.038));
    }
  }
  elec.add(box(E.width, E.thickness, E.length), mats.pcbBlack, at(0, E.y, 0));
  const top = E.y + E.thickness / 2;
  // Eight blue three-pin servo headers along the long edges.
  for (const sx of [-1, 1]) {
    for (const z of [-0.027, -0.009, 0.009, 0.027]) {
      elec.add(box(0.0026, 0.0025, 0.0078), mats.header, at(sx * 0.0168, top + 0.00125, z));
      for (const k of [-1, 0, 1]) metal.add(box(0.0007, 0.006, 0.0007), mats.silver, at(sx * 0.0168, top + 0.003, z + k * 0.00254));
    }
  }
  // 1000 µF capacitor, switch, micro-USB, fuse, charger IC, IR receiver.
  elec.add(cyl(0.005, 0.0125, 24), mats.capacitor, at(0.006, top + 0.00625, 0.031));
  metal.add(cyl(0.005, 0.0006, 24), mats.silver, at(0.006, top + 0.0128, 0.031));
  elec.add(box(0.0085, 0.0035, 0.0045), mats.plastic, at(-0.012, top + 0.00175, -0.037));
  metal.add(box(0.0075, 0.0028, 0.0055), mats.silver, at(-0.003, top + 0.0014, -0.0395));
  elec.add(box(0.0035, 0.0015, 0.0018), mats.plastic, at(0.009, top + 0.00075, -0.033));
  elec.add(box(0.004, 0.001, 0.005), mats.plastic, at(0.0125, top + 0.0005, 0.016));
  elec.add(box(0.0055, 0.0055, 0.004), mats.plastic, at(-0.0115, top + 0.00275, 0.039));
  elec.add(new THREE.SphereGeometry(0.0022, 12, 8), mats.plastic, at(-0.0115, top + 0.003, 0.0412));
  // CHRG / STDBY / PWR indicator LEDs (low intensity).
  const leds: [THREE.Material, number][] = [
    [mats.ledRed, -0.0165],
    [mats.ledGreen, -0.0135],
    [mats.ledBlue, -0.0105],
  ];
  for (const [mat, x] of leds) elec.add(box(0.0016, 0.0008, 0.0009), mat, at(x, top + 0.0004, -0.031));

  // NodeMCU on female headers (black PCB, silver ESP-12F shield, micro-USB at the rear).
  const P = SPIDER.esp;
  for (const sx of [-1, 1]) elec.add(box(0.0025, 0.0085, 0.038), mats.plastic, at(sx * 0.01143, top + 0.00425, -0.002));
  elec.add(box(P.width, P.thickness, P.length), mats.pcbBlack, at(0, P.y, -0.002));
  const espTop = P.y + P.thickness / 2;
  elec.add(box(0.016, 0.0008, 0.024), mats.pcbBlack, at(0, espTop + 0.0004, -0.016));
  const shieldTop = new THREE.BoxGeometry(0.012, 0.0024, 0.015);
  elec.add(shieldTop, mats.shield, at(0, espTop + 0.002, -0.0145));
  metal.add(box(0.0076, 0.0027, 0.0056), mats.silver, at(0, espTop + 0.00135, 0.0205));
  elec.add(box(0.0042, 0.0012, 0.0042), mats.plastic, at(0.004, espTop + 0.0006, 0.008));
  for (const sx of [-1, 1]) elec.add(box(0.003, 0.0015, 0.003), mats.plastic, at(sx * 0.0085, espTop + 0.00075, 0.017));
  elec.add(box(0.0012, 0.0006, 0.0008), mats.ledBlue, at(-0.006, espTop + 0.0011, -0.026));

  // Brass standoffs and their nuts; cover with screws and the etched mark.
  const D = SPIDER.standoff;
  const V = SPIDER.cover;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      metal.add(hex(D.radius, D.length), mats.brass, at(sx * D.x, D.y0 + D.length / 2, sz * D.z));
      metal.add(hex(0.0029, 0.0024), mats.silver, at(sx * D.x, top + 0.0012, sz * D.z));
      metal.add(screwHead(), mats.silver, at(sx * D.x, V.y + V.thickness / 2, sz * D.z));
    }
  }
  acrylic.add(plate(roundedRect(V.width, V.length, 0.0035), V.thickness), mats.acrylic, at(0, V.y, 0));
  const mark = new THREE.PlaneGeometry(0.03, 0.03);
  mark.rotateX(-Math.PI / 2);
  elec.add(mark, mats.coverMark, at(0, V.y + V.thickness / 2 + 0.00005, 0.004));

  // Face plate (cat head, two eye holes, mouth slot, small holes) and the HC-SR04 behind it.
  const F = SPIDER.face;
  const face = catFace(F.width, F.height);
  const faceGeo = extrude(face, F.thickness, 0.0004);
  acrylic.add(faceGeo, mats.acrylic, at(0, F.bottom, F.z));
  for (const sx of [-1, 1]) metal.add(screwHead(), mats.silver, chain(at(sx * 0.02, F.bottom + 0.004, F.z - F.thickness / 2), rotX(-Math.PI / 2)));

  const U = SPIDER.sonar;
  const sonarPcb = new THREE.BoxGeometry(U.width, U.height, U.thickness);
  elec.add(sonarPcb, mats.pcbBlue, at(0, F.eyeY, U.z));
  const silk = new THREE.PlaneGeometry(U.width, U.height);
  silk.rotateY(Math.PI);
  elec.add(silk, mats.sonarSilk, at(0, F.eyeY, U.z + U.thickness / 2 + 0.0001));
  const canLen = U.z - U.thickness / 2 - SENSOR.origin.z;
  for (const sx of [-1, 1]) {
    const x = (sx * U.pitch) / 2;
    metal.add(cylAlongZ(U.can, canLen, 28), mats.silver, at(x, F.eyeY, SENSOR.origin.z + canLen / 2));
    const meshDisc = new THREE.CircleGeometry(U.can * 0.82, 28);
    meshDisc.rotateY(Math.PI);
    elec.add(meshDisc, mats.sonarMesh, at(x, F.eyeY, SENSOR.origin.z - 0.0001));
  }
  metal.add(box(0.0105, 0.0035, 0.0045), mats.silver, at(0, F.eyeY + 0.0068, U.z - 0.0028));
  for (let k = 0; k < 4; k++) {
    metal.add(box(0.0007, 0.006, 0.0007), mats.silver, at(-0.0038 + k * 0.00254, F.eyeY - U.height / 2 - 0.002, U.z + 0.0018));
  }

  // 18650 holder under the chassis (the kit ships without the cell).
  const B = SPIDER.battery;
  const holder = roundedRect(B.width, B.length, 0.002);
  holder.holes.push(rectPath(B.width - 0.003, B.length - 0.009, 0.0015, 0, 0));
  elec.add(plate(holder, B.height, 0.0004), mats.plastic, at(0, B.top - B.height / 2, B.z));
  elec.add(box(B.width - 0.003, 0.0015, B.length - 0.009), mats.plastic, at(0, B.top - 0.00075, B.z));
  for (const sz of [-1, 1]) metal.add(box(0.008, 0.008, 0.0008), mats.silver, at(0, B.top - 0.009, B.z + sz * (B.length / 2 - 0.006)));

  // Hip servos fixed to the chassis corners; shafts vertical on the hip yaw axes.
  for (const leg of LEGS) {
    const cfg = LEG_CONFIG[leg];
    const front = cfg.end < 0;
    const H = front ? SPIDER.hipServo.front : SPIDER.hipServo.rear;
    // Local servo frame: +X along the case toward the body middle (+X -> -end·Z), shaft up for
    // the rear pair and down for the front pair (manual step 3), label facing outward.
    const toward = rotY(cfg.end < 0 ? -Math.PI / 2 : Math.PI / 2);
    const flip = front ? rotX(Math.PI) : M();
    const shaftFace = front ? H.bottom : H.top;
    addServo(servos, mats, chain(at(cfg.hip.x, shaftFace, cfg.hip.z), toward, flip), cfg.side);
    // Body wiring: servo lead to its header on the expansion board.
    const exitZ = cfg.hip.z - cfg.end * (S.l - S.shaftOffset);
    wireRibbon(wires, mats, [
      new THREE.Vector3(cfg.hip.x - cfg.side * 0.002, front ? H.top - 0.004 : H.bottom + 0.004, exitZ),
      new THREE.Vector3(cfg.hip.x * 0.85, 0.008, exitZ - cfg.end * 0.004),
      new THREE.Vector3(cfg.side * 0.0168, top + 0.006, cfg.end * 0.022),
    ]);
  }

  body.add(
    acrylic.build("body:acrylic"),
    metal.build("body:metal"),
    elec.build("body:electronics"),
    servos.build("body:hipServos"),
    wires.build("body:wires"),
  );
  return body;
}

function cylAlongZ(r: number, h: number, seg: number): THREE.BufferGeometry {
  const g = cyl(r, h, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Cat-head outline in (x, y) with y = 0 at the bottom edge. */
function catFace(w: number, h: number): THREE.Shape {
  // Wide rounded head, two pointed ears leaning out at the top corners (LA072a.png).
  const hw = w / 2;
  const body = h - 0.0085;
  const s = new THREE.Shape();
  s.moveTo(-hw + 0.011, 0);
  s.lineTo(hw - 0.011, 0);
  s.quadraticCurveTo(hw, 0, hw, 0.011);
  s.lineTo(hw, body - 0.009);
  s.quadraticCurveTo(hw, body - 0.003, hw - 0.002, body);
  // Right ear: outer edge up to the tip, inner edge back down to the crown.
  s.lineTo(hw + 0.0005, h);
  s.lineTo(hw - 0.0125, body + 0.0015);
  s.quadraticCurveTo(0, body + 0.0035, -hw + 0.0125, body + 0.0015);
  // Left ear.
  s.lineTo(-hw - 0.0005, h);
  s.lineTo(-hw + 0.002, body);
  s.quadraticCurveTo(-hw, body - 0.003, -hw, body - 0.009);
  s.lineTo(-hw, 0.011);
  s.quadraticCurveTo(-hw, 0, -hw + 0.011, 0);
  const eyeY = SPIDER.face.eyeY - SPIDER.face.bottom;
  const eyeR = SPIDER.sonar.can + 0.0012;
  for (const sx of [-1, 1]) s.holes.push(circlePath(eyeR, (sx * SPIDER.sonar.pitch) / 2, eyeY));
  s.holes.push(rectPath(0.0085, 0.0034, 0.0016, 0, 0.0058));
  for (const x of [-0.0165, -0.0065, 0.0065, 0.0165]) s.holes.push(circlePath(0.0009, x, body - 0.0015 - Math.abs(x) * 0.08));
  return s;
}

// ------------------------------------------------------------------ legs

function buildLeg(leg: LegId, mats: SpiderMaterials): LegRig {
  const cfg = LEG_CONFIG[leg];
  const front = cfg.end < 0;
  const H = front ? SPIDER.hipServo.front : SPIDER.hipServo.rear;
  const L1 = cfg.femurLength;
  const L2 = cfg.tibiaLength;
  // Tibia plane along the local knee axis (+Z'): t·n = t·(-side·end)·Z'.
  const zt = -cfg.side * cfg.end * cfg.kneeOffset;
  const zs = Math.sign(zt);

  const hip = new THREE.Group();
  hip.name = `hip:${leg}`;
  hip.position.set(cfg.hip.x, cfg.hip.y, cfg.hip.z);

  // ---- hip group: horn, C-bracket around the hip servo, passive femur, femur wiring
  const acrylic = new Part();
  const metal = new Part();
  const dark = new Part();
  const wires = new Part();

  const hornY = H.horn;
  const plateT = 0.003;
  const topY = front ? H.top + 0.0005 + plateT / 2 : H.horn + 0.002 + plateT / 2;
  const botY = front ? H.horn - 0.002 - plateT / 2 : H.bottom - 0.0005 - plateT / 2;
  dark.add(cyl(0.0042, 0.0018, 18), mats.horn, at(0, hornY, 0));
  dark.add(box(0.016, 0.0016, 0.0042), mats.horn, at(0.002, hornY + (front ? -0.0012 : 0.0012), 0));

  const bracketPlate = roundedRect(0.026, 0.012, 0.0055, 0.004, 0);
  acrylic.add(plate(bracketPlate, plateT), mats.acrylic, at(0, topY, 0));
  acrylic.add(plate(roundedRect(0.026, 0.012, 0.0055, 0.004, 0), plateT), mats.acrylic, at(0, botY, 0));
  const vh = topY - botY + plateT;
  acrylic.add(box(0.003, vh, 0.012), mats.acrylic, at(0.0155, (topY + botY) / 2, 0));
  for (const y of [topY, botY]) metal.add(screwHead(), mats.silver, chain(at(0, y + (y === topY ? plateT / 2 : -plateT / 2), 0), y === topY ? M() : rotX(Math.PI)));

  // Femur: tapered acrylic arm from the bracket to the knee boss, on the femur plane.
  const femur = new THREE.Shape();
  femur.moveTo(0.014, -0.006);
  femur.lineTo(L1, -0.0052);
  femur.absarc(L1, 0, 0.0052, -Math.PI / 2, Math.PI / 2, false);
  femur.lineTo(0.014, 0.006);
  femur.lineTo(0.014, -0.006);
  femur.holes.push(circlePath(0.0012, 0.024, 0));
  acrylic.add(plate(femur, 0.004), mats.acrylic);
  for (const x of [0.019, 0.03, L1 - 0.007]) metal.add(screwHead(), mats.silver, at(x, 0.002, 0));
  // Knee boss: femur clamps the knee horn.
  dark.add(cylAlongZ(0.0052, 0.0028, 20), mats.horn, at(L1, 0, zs * 0.0014));
  metal.add(cylAlongZ(0.0018, 0.0012, 12), mats.silver, at(L1, 0, -zs * 0.0026));

  // Knee servo lead runs back along the femur with a slack loop and one cable tie.
  const wy = 0.0045;
  wireRibbon(wires, mats, [
    new THREE.Vector3(L1 - 0.004, 0.003, zs * 0.012),
    new THREE.Vector3(L1 - 0.012, wy + 0.002, zs * 0.004),
    new THREE.Vector3(0.026, wy, 0),
    new THREE.Vector3(0.01, wy + 0.008, -0.002),
    new THREE.Vector3(-0.004, topY + 0.008, 0.002),
  ]);
  dark.add(box(0.0018, 0.0062, 0.0062), mats.plastic, at(0.026, wy - 0.0005, 0));

  hip.add(acrylic.build(`femur:${leg}`), metal.build(`hip-metal:${leg}`), dark.build(`hip-dark:${leg}`), wires.build(`hip-wires:${leg}`));

  // ---- knee group: knee MG90S riding on the tibia, forked tibia, rubber foot
  const knee = new THREE.Group();
  knee.name = `knee:${leg}`;
  knee.position.set(L1, 0, 0);
  hip.add(knee);

  const kServo = new Part();
  const kAcrylic = new Part();
  const kMetal = new Part();
  const kRubber = new Part();

  // Servo frame: shaft (+Y) toward the femur (-zs·Z'), case body between the femur horn and
  // the tibia plate, long side running back up from the hub (-X'), as in the photos where
  // the knee servo stands above the knee and the tibia hangs from it.
  addServo(kServo, mats, chain(at(0, 0, zs * 0.003), rotX((-zs * Math.PI) / 2), rotY(Math.PI)), 1);

  // Tibia: forked acrylic plate in the leg plane (X'Y'), offset to the tibia plane.
  const tibia = new THREE.Shape();
  const tipX = L2 - 0.013;
  // Wide head carries the knee servo (which runs back to x' = -17 mm), then the fork.
  tibia.moveTo(-0.0175, -0.0075);
  tibia.lineTo(0.016, -0.0085);
  tibia.lineTo(tipX, -0.0028);
  tibia.absarc(tipX, 0, 0.0028, -Math.PI / 2, Math.PI / 2, false);
  tibia.lineTo(0.016, 0.0085);
  tibia.lineTo(-0.0175, 0.0075);
  tibia.quadraticCurveTo(-0.0215, 0.0075, -0.0215, 0.0035);
  tibia.lineTo(-0.0215, -0.0035);
  tibia.quadraticCurveTo(-0.0215, -0.0075, -0.0175, -0.0075);
  const slot = new THREE.Path();
  slot.moveTo(0.019, -0.0047);
  slot.lineTo(tipX - 0.008, -0.0011);
  slot.lineTo(tipX - 0.008, 0.0011);
  slot.lineTo(0.019, 0.0047);
  slot.lineTo(0.019, -0.0047);
  tibia.holes.push(slot);
  kAcrylic.add(extrude(tibia, 0.003), mats.acrylic, at(0, 0, zt));
  for (const x of [-0.016, 0.004]) {
    for (const y of [-0.0055, 0.0055]) {
      kMetal.add(screwHead(), mats.silver, chain(at(x, y, zt + zs * 0.0015), rotX((zs * Math.PI) / 2)));
    }
  }

  // Rubber sleeve: bulbous lathe along +X' ending exactly at the foot point (L2, 0, zt).
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.0026, 0.0007),
    new THREE.Vector2(0.0042, 0.003),
    new THREE.Vector2(0.0044, 0.008),
    new THREE.Vector2(0.0036, 0.0145),
    new THREE.Vector2(0.0031, SPIDER.foot.length),
  ];
  const sleeve = new THREE.LatheGeometry(profile, 18);
  sleeve.rotateZ(Math.PI / 2);
  kRubber.add(sleeve, mats.rubber, at(L2, 0, zt));

  knee.add(
    kServo.build(`servo:${leg}:knee`),
    kAcrylic.build(`tibia:${leg}`),
    kMetal.build(`knee-metal:${leg}`),
    kRubber.build(`foot:${leg}`),
  );

  return { hip, knee, side: cfg.side };
}

export function buildSpider(mats: SpiderMaterials): SpiderRig {
  const root = new THREE.Group();
  root.name = "spider";
  root.rotation.order = "YXZ";
  const body = buildBody(mats);
  root.add(body);
  const legs = {} as Record<LegId, LegRig>;
  for (const leg of LEGS) {
    legs[leg] = buildLeg(leg, mats);
    body.add(legs[leg].hip);
  }
  // The four hip servos are merged in one body mesh; name markers keep the 8-servo count
  // inspectable (debug dump, tests).
  for (const leg of LEGS) {
    const marker = new THREE.Object3D();
    marker.name = `servo:${leg}:hip`;
    marker.position.copy(legs[leg].hip.position);
    body.add(marker);
  }
  return { root, body, legs };
}

/** Pose the rig: joints in radians, protocol order. Same math as footFromJoints. */
export function applyJoints(rig: SpiderRig, joints: readonly number[]): void {
  LEGS.forEach((leg, i) => {
    const l = rig.legs[leg];
    const psi = joints[2 * i];
    l.hip.rotation.y = l.side > 0 ? psi : Math.PI - psi;
    l.knee.rotation.z = -joints[2 * i + 1];
  });
}

/** Text dump of the hierarchy with names, for the debug panel and tests. */
export function describeRig(root: THREE.Object3D): string[] {
  const lines: string[] = [];
  root.traverse((o) => {
    let depth = 0;
    for (let p = o.parent; p && p !== root.parent; p = p.parent) depth++;
    const mesh = o as THREE.Mesh;
    const tris = mesh.isMesh && mesh.geometry.attributes.position ? mesh.geometry.attributes.position.count / 3 : 0;
    lines.push(`${"  ".repeat(depth)}${o.name || o.type}${tris ? ` (${Math.round(tris)} tris)` : ""}`);
  });
  return lines;
}
