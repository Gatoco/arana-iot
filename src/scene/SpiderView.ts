/**
 * Three.js view of the spider. Built imperatively and mounted by a React
 * wrapper. Reads RobotState; owns no simulation logic.
 */

import * as THREE from "three";
import { LEGS, type LegId } from "../protocol";
import { BODY, HIP, LEG_GEOMETRY, legSide, solveLeg, type FootTarget } from "../sim/spiderModel";
import type { RobotState } from "../sim/engine";

const REACH = LEG_GEOMETRY.reach;

interface LegParts {
  hip: THREE.Group;
  coxa: THREE.Group;
  femur: THREE.Mesh;
}

export class SpiderView {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private legs = new Map<LegId, LegParts>();
  private frame = 0;
  private wall: THREE.Mesh | null = null;
  private resizeObs: ResizeObserver | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.Fog(0x0f172a, 3, 8);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
    this.camera.position.set(0.55, 0.45, 0.55);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 1.1));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(1, 2, 1);
    this.scene.add(dir);

    this.buildArena();
    this.buildBody();
    for (const leg of LEGS) this.buildLeg(leg);
    this.scene.add(this.root);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  private buildArena(): void {
    const grid = new THREE.GridHelper(3, 30, 0x334155, 0x1e293b);
    this.scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.001;
    this.scene.add(ground);

    this.wall = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.2, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x422006 }),
    );
    this.wall.position.set(0, 0.1, -1.5);
    this.scene.add(this.wall);
  }

  private buildBody(): void {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BODY.width, BODY.height, BODY.length),
      new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.3, roughness: 0.4 }),
    );
    body.position.y = 0;
    this.root.add(body);
    // Heading marker (front).
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.015, 0.04, 12),
      new THREE.MeshStandardMaterial({ color: 0xef4444 }),
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, -BODY.length / 2 - 0.02);
    this.root.add(nose);
  }

  private buildLeg(leg: LegId): void {
    const hip = new THREE.Group();
    const h = HIP[leg];
    hip.position.set(h.x, 0, h.z);
    const side = legSide(leg);

    const coxa = new THREE.Group();
    hip.add(coxa);

    const femur = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, REACH, 8),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4, roughness: 0.5 }),
    );
    // Orient cylinder along +X (out from the body) by default.
    femur.rotation.z = Math.PI / 2;
    femur.position.set((side * REACH) / 2, -LEG_GEOMETRY.hipHeight, 0);
    coxa.add(femur);

    const foot = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x22c55e }),
    );
    foot.position.set(side * REACH, -LEG_GEOMETRY.hipHeight, 0);
    coxa.add(foot);

    this.root.add(hip);
    this.legs.set(leg, { hip, coxa, femur });
  }

  update(state: RobotState): void {
    this.root.position.set(state.x, LEG_GEOMETRY.hipHeight, state.z);
    // Three.js: +Z is toward the camera, our heading 0 faces -Z. Rotate by -yaw.
    this.root.rotation.y = -state.yaw;

    for (const leg of LEGS) {
      const parts = this.legs.get(leg);
      if (!parts) continue;
      const target: FootTarget = state.targets[leg] ?? { forward: 0, height: 0 };
      const angles = solveLeg(target);
      const side = legSide(leg);
      parts.coxa.rotation.y = angles.coxa * side;
      // Femur pitch: raising the foot lifts the whole leg.
      parts.coxa.rotation.z = -angles.femur * side;
      parts.coxa.rotation.x = 0;
    }

    // Follow camera, slightly behind the spider along its heading.
    const camTarget = new THREE.Vector3(
      state.x - Math.sin(state.yaw) * 0.55,
      0.45,
      state.z - Math.cos(state.yaw) * 0.55,
    );
    this.camera.position.lerp(camTarget, 0.05);
    this.camera.lookAt(state.x, 0, state.z);
  }

  render(): void {
    this.frame = (this.frame + 1) % 1000;
    this.renderer.render(this.scene, this.camera);
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.resizeObs?.disconnect();
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }
}
