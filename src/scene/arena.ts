/**
 * The test bench floor: a calibrated, low-contrast workspace. Geometry of every obstacle comes
 * from the shared collider list in src/sim/world.ts, so what is drawn is what the body bumps
 * into and what the sonar sees.
 */

import * as THREE from "three";
import { ARENA, COLLIDERS, type Box, type Cylinder } from "../sim/world";

export const ARENA_COLOR = {
  floor: 0x070a0e,
  gridMinor: 0x0e1a20,
  gridMajor: 0x1f6f7a,
  mat: 0x0b0f14,
  boxBody: 0x1c1712,
  boxEdge: 0xf59e0b,
  cylBody: 0x14171d,
  cylBand: 0x2dd4bf,
  wall: 0x14171d,
  pillar: 0x101318,
  axisX: 0x9b4a4a,
  axisZ: 0x4a6a9b,
} as const;

export interface ArenaHandles {
  group: THREE.Group;
  grid: THREE.Group;
  axes: THREE.Group;
  dispose(): void;
}

const SANS = "system-ui, 'Segoe UI', Roboto, sans-serif";

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  draw(ctx);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function lines(points: number[], color: number, opacity: number): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false }),
  );
}

/** Grid lines every `step` meters over the arena, skipping multiples of `skip`. */
function gridLines(step: number, skip: number | null, y: number): number[] {
  const half = ARENA.size / 2;
  const pts: number[] = [];
  const n = Math.round(ARENA.size / step);
  for (let i = 0; i <= n; i++) {
    const v = -half + i * step;
    if (skip && Math.abs(v / skip - Math.round(v / skip)) < 1e-6) continue;
    pts.push(v, y, -half, v, y, half, -half, y, v, half, y, v);
  }
  return pts;
}

export function buildArena(): ArenaHandles {
  const group = new THREE.Group();
  group.name = "arena";
  const disposables: { dispose(): void }[] = [];

  // Floor with a faint radial falloff so it is not a flat void.
  const floorTex = canvasTex(512, 512, (c) => {
    const g = c.createRadialGradient(256, 256, 20, 256, 256, 360);
    g.addColorStop(0, "#0c1117");
    g.addColorStop(1, "#05070a");
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
  });
  const floorMat = new THREE.MeshStandardMaterial({
    // The map carries the falloff; the tint keeps the lit floor near #070a0e, not gray.
    color: floorTex ? 0x59606a : ARENA_COLOR.floor,
    map: floorTex ?? undefined,
    roughness: 0.9,
    metalness: 0,
    // The procedural room is for hardware reflections; a matte floor should not mirror it.
    envMapIntensity: 0.05,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.size, ARENA.size), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "floor";
  group.add(floor);
  disposables.push(floor.geometry, floorMat, ...(floorTex ? [floorTex] : []));

  // Grid: 0.1 m minor, 1 m major, 5 m accents. Fog fades it with distance.
  const grid = new THREE.Group();
  grid.name = "grid";
  grid.add(
    lines(gridLines(0.1, 1, 0.0004), ARENA_COLOR.gridMinor, 0.18),
    lines(gridLines(1, 5, 0.0006), ARENA_COLOR.gridMajor, 0.35),
    lines(gridLines(5, null, 0.0008), ARENA_COLOR.gridMajor, 0.55),
  );
  group.add(grid);

  // Calibration mat: 1 x 1 m, 10 cm grid, 1 cm ticks on the axes, 5° rose around the origin.
  const matTex = canvasTex(1024, 1024, (c) => {
    c.fillStyle = "#0b0f14";
    c.fillRect(0, 0, 1024, 1024);
    c.strokeStyle = "rgba(120,140,155,0.35)";
    c.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const p = Math.round((i / 10) * 1023) + 0.5;
      c.beginPath();
      c.moveTo(p, 0);
      c.lineTo(p, 1024);
      c.moveTo(0, p);
      c.lineTo(1024, p);
      c.stroke();
    }
    c.strokeStyle = "rgba(120,140,155,0.28)";
    c.lineWidth = 1.5;
    for (let i = 0; i <= 100; i++) {
      const p = (i / 100) * 1024;
      const len = i % 10 === 0 ? 0 : i % 5 === 0 ? 14 : 7;
      if (!len) continue;
      c.beginPath();
      c.moveTo(p, 512 - len);
      c.lineTo(p, 512 + len);
      c.moveTo(512 - len, p);
      c.lineTo(512 + len, p);
      c.stroke();
    }
    c.strokeStyle = "rgba(120,140,155,0.3)";
    c.beginPath();
    c.arc(512, 512, 300, 0, Math.PI * 2);
    c.stroke();
    for (let a = 0; a < 360; a += 5) {
      const r0 = a % 45 === 0 ? 270 : a % 15 === 0 ? 282 : 290;
      const t = (a * Math.PI) / 180;
      c.beginPath();
      c.moveTo(512 + Math.cos(t) * r0, 512 + Math.sin(t) * r0);
      c.lineTo(512 + Math.cos(t) * 300, 512 + Math.sin(t) * 300);
      c.stroke();
    }
    c.fillStyle = "rgba(140,158,172,0.55)";
    c.font = `500 18px ${SANS}`;
    c.fillText("10 cm", 520, 96);
    c.fillText("1 m calibration mat", 18, 1010);
  });
  if (matTex) {
    const matMat = new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.92, metalness: 0, envMapIntensity: 0.05 });
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matMat);
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.0002;
    mat.receiveShadow = true;
    mat.name = "calibration-mat";
    group.add(mat);
    disposables.push(mat.geometry, matMat, matTex);
  }

  // Distance markers along +Z (the sonar lane at the start heading): 0.5, 1, 2, 3, 4 m.
  for (const d of [0.5, 1, 2, 3, 4]) {
    const tick = lines([-0.06, 0.001, d, 0.06, 0.001, d], ARENA_COLOR.gridMajor, 0.8);
    grid.add(tick);
    const label = canvasTex(256, 96, (c) => {
      c.fillStyle = "rgba(150,200,205,0.75)";
      c.font = `600 54px ${SANS}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(`${d} m`, 128, 48);
    });
    if (label) {
      const m = new THREE.MeshBasicMaterial({ map: label, transparent: true, depthWrite: false });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), m);
      plane.rotation.x = -Math.PI / 2;
      plane.rotation.z = Math.PI;
      plane.position.set(0.15, 0.0012, d);
      grid.add(plane);
      disposables.push(plane.geometry, m, label);
    }
  }

  // Origin ring and muted X (red) / Z (blue) axes.
  const axes = new THREE.Group();
  axes.name = "axes";
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.046, 48),
    new THREE.MeshBasicMaterial({ color: ARENA_COLOR.gridMajor, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.0014;
  axes.add(ring, lines([0, 0.0014, 0, 0.5, 0.0014, 0], ARENA_COLOR.axisX, 0.9), lines([0, 0.0014, 0, 0, 0.0014, 0.5], ARENA_COLOR.axisZ, 0.9));
  group.add(axes);

  // Colliders: obstacles, low boundary walls, corner pillars.
  const boxMat = new THREE.MeshStandardMaterial({ color: ARENA_COLOR.boxBody, roughness: 0.75, metalness: 0.1 });
  const cylMat = new THREE.MeshStandardMaterial({ color: ARENA_COLOR.cylBody, roughness: 0.6, metalness: 0.2 });
  const wallMat = new THREE.MeshStandardMaterial({ color: ARENA_COLOR.wall, roughness: 0.8, metalness: 0.1 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: ARENA_COLOR.pillar, roughness: 0.8, metalness: 0.1 });
  const bandMat = new THREE.MeshStandardMaterial({ color: ARENA_COLOR.cylBand, roughness: 0.5, emissive: ARENA_COLOR.cylBand, emissiveIntensity: 0.15 });
  disposables.push(boxMat, cylMat, wallMat, pillarMat, bandMat);
  for (const c of COLLIDERS) {
    const mesh = c.kind === "box" ? boxMesh(c, c.name === "box" ? boxMat : c.name.startsWith("pillar") ? pillarMat : wallMat) : cylMesh(c, cylMat, bandMat);
    mesh.name = `collider:${c.name}`;
    group.add(mesh);
  }
  const box = COLLIDERS.find((c) => c.name === "box") as Box;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(box.size.x, box.size.y, box.size.z)),
    new THREE.LineBasicMaterial({ color: ARENA_COLOR.boxEdge, transparent: true, opacity: 0.55 }),
  );
  edges.position.set(box.center.x, box.size.y / 2, box.center.z);
  group.add(edges);

  // 1 m ticks along the boundary.
  const half = ARENA.size / 2;
  const ticks: number[] = [];
  for (let i = -half; i <= half; i++) {
    const len = i % 5 === 0 ? 0.3 : 0.15;
    ticks.push(i, 0.001, half - len, i, 0.001, half, i, 0.001, -half, i, 0.001, -half + len);
    ticks.push(half - len, 0.001, i, half, 0.001, i, -half, 0.001, i, -half + len, 0.001, i);
  }
  grid.add(lines(ticks, ARENA_COLOR.gridMajor, 0.6));

  return {
    group,
    grid,
    axes,
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      disposables.forEach((d) => d.dispose());
    },
  };
}

function boxMesh(c: Box, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.size.x, c.size.y, c.size.z), mat);
  mesh.position.set(c.center.x, c.size.y / 2, c.center.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylMesh(c: Cylinder, mat: THREE.Material, band: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(c.radius, c.radius, c.height, 48), mat);
  mesh.position.set(c.center.x, c.height / 2, c.center.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(c.radius + 0.002, c.radius + 0.002, 0.012, 48, 1, true), band);
  ring.position.y = c.height / 2 - 0.03;
  mesh.add(ring);
  return mesh;
}
