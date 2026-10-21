/**
 * Three.js view of the spider on its test bench. Built imperatively and mounted by a React
 * wrapper. Reads engine state; owns no simulation logic.
 *
 * The sim ticks at 30 Hz on its own timer (it is the body, it must keep running while the
 * window is hidden). The view renders with setAnimationLoop and interpolates between the last
 * two sim states, so motion is smooth at any refresh rate without allocating per frame.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SENSOR } from "../sim/spiderModel";
import type { RobotState } from "../sim/engine";
import { buildArena, type ArenaHandles } from "./arena";
import { createMaterials, disposeMaterials, type SpiderMaterials } from "./materials";
import { applyJoints, buildSpider, describeRig, type SpiderRig } from "./spiderMesh";
import { bodyRotationY } from "./heading";

export const CAMERA_MODE = {
  HERO: "hero",
  ORBIT: "orbit",
  FOLLOW: "follow",
  FRONT: "front",
  TOP: "top",
  SIDE: "side",
} as const;

export type CameraMode = (typeof CAMERA_MODE)[keyof typeof CAMERA_MODE];

/**
 * Camera offsets in the body frame (nose = -Z), look-at height above the femur plane and
 * vertical FOV. Inspection presets use a narrow FOV from farther away, like the product
 * photos (little perspective distortion); orbit and follow use 50°.
 */
const PRESET: Record<Exclude<CameraMode, "orbit">, { offset: [number, number, number]; look: number; fov: number }> = {
  // LA072a.png: seen from the robot's front-left, slightly above the cover.
  hero: { offset: [-0.225, 0.13, -0.46], look: -0.004, fov: 28 },
  follow: { offset: [0, 0.22, 0.4], look: 0.03, fov: 50 },
  front: { offset: [0, 0.1, -0.5], look: -0.008, fov: 28 },
  top: { offset: [0, 0.55, 0.0001], look: -0.03, fov: 30 },
  side: { offset: [0.5, 0.1, 0], look: -0.008, fov: 28 },
};
const ORBIT_FOV = 50;

export interface ViewOptions {
  grid: boolean;
  axes: boolean;
  sonar: boolean;
  contactShadow: boolean;
  wireframe: boolean;
}

export const DEFAULT_VIEW_OPTIONS: ViewOptions = {
  grid: true,
  axes: true,
  sonar: true,
  contactShadow: true,
  wireframe: false,
};

export interface RenderStats {
  fps: number;
  calls: number;
  triangles: number;
}

interface Snapshot {
  t: number;
  x: number;
  z: number;
  yaw: number;
  h: number;
  pitch: number;
  roll: number;
  joints: number[];
  distance: number | null;
}

function emptySnap(): Snapshot {
  return { t: 0, x: 0, z: 0, yaw: 0, h: 0, pitch: 0, roll: 0, joints: new Array(8).fill(0), distance: null };
}

const SIM_DT_MS = 1000 / 30;

export class SpiderView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  private controls: OrbitControls;
  private mode: CameraMode = CAMERA_MODE.HERO;
  private mats: SpiderMaterials;
  private rig: SpiderRig;
  private arena: ArenaHandles;
  private sonarCone: THREE.Mesh;
  private sonarHit: THREE.Mesh;
  private contact: THREE.Mesh;
  private key: THREE.DirectionalLight;
  private envTarget: THREE.WebGLRenderTarget;
  private dome: THREE.Mesh;
  private options: ViewOptions = { ...DEFAULT_VIEW_OPTIONS };
  private resizeObs: ResizeObserver;
  private canvas: HTMLCanvasElement;

  private prev = emptySnap();
  private curr = emptySnap();
  private joints = new Array<number>(8).fill(0);
  private bodyPos = new THREE.Vector3();
  private lastBody = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private snapCamera = true;
  private frames = 0;
  private fpsWindow = 0;
  private stats: RenderStats = { fps: 0, calls: 0, triangles: 0 };
  private running = false;
  private lastFrame = 0;
  private renderedFrames = 0;
  private onVisibility = () => this.updateRunning();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Procedural environment (no HDR download) for acrylic / metal reflections only.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.32;
    this.scene.fog = new THREE.Fog(0x06080b, 1.6, 8);
    this.dome = this.buildDome();
    this.scene.add(this.dome);

    this.camera.position.set(0.2, 0.17, 0.26);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 6;
    this.controls.maxPolarAngle = (88 * Math.PI) / 180;
    this.controls.enabled = false;

    this.key = this.buildLights();
    this.arena = buildArena();
    this.scene.add(this.arena.group);

    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    this.mats = createMaterials(Math.min(8, aniso));
    this.rig = buildSpider(this.mats);
    this.scene.add(this.rig.root);
    this.contact = this.buildContactShadow();
    this.scene.add(this.contact);
    [this.sonarCone, this.sonarHit] = this.buildSonar();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);
    this.resize();
    document.addEventListener("visibilitychange", this.onVisibility);
    this.updateRunning();
  }

  // ------------------------------------------------------------------ public API

  /** Feed a new sim state (call at the sim rate). */
  pushState(state: RobotState): void {
    const now = performance.now();
    const fresh = this.curr.t === 0;
    const swap = this.prev;
    this.prev = this.curr;
    this.curr = swap;
    const c = this.curr;
    c.t = now;
    c.x = state.x;
    c.z = state.z;
    c.yaw = state.yaw;
    c.h = state.h;
    c.pitch = state.pitch;
    c.roll = state.roll;
    for (let i = 0; i < 8; i++) c.joints[i] = state.joints[i];
    c.distance = state.distance;
    if (fresh) this.copySnap(this.prev, c);
  }

  setCameraMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.controls.enabled = mode === CAMERA_MODE.ORBIT;
    if (mode === CAMERA_MODE.ORBIT) this.controls.target.copy(this.bodyPos);
  }

  getCameraMode(): CameraMode {
    return this.mode;
  }

  /** Jump the camera to its preset without damping (screenshots, "reset camera"). */
  snapCameraNow(): void {
    this.snapCamera = true;
  }

  setOptions(options: Partial<ViewOptions>): void {
    this.options = { ...this.options, ...options };
    this.arena.grid.visible = this.options.grid;
    this.arena.axes.visible = this.options.axes;
    this.sonarCone.visible = this.options.sonar;
    this.sonarHit.visible = this.options.sonar && this.curr.distance != null;
    this.contact.visible = this.options.contactShadow;
    const all = Object.values(this.mats) as THREE.MeshStandardMaterial[];
    for (const m of all) m.wireframe = this.options.wireframe;
  }

  getStats(): RenderStats {
    return { ...this.stats };
  }

  describe(): string[] {
    return describeRig(this.rig.root);
  }

  /** Resolves after `n` frames have been rendered. */
  async framesRendered(n: number): Promise<void> {
    const target = this.renderedFrames + n;
    while (this.renderedFrames < target) await new Promise((r) => requestAnimationFrame(r));
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.arena.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    disposeMaterials(this.mats);
    for (const m of [this.sonarCone, this.sonarHit, this.contact, this.dome]) {
      const mat = m.material as THREE.Material & { map?: THREE.Texture | null };
      mat.map?.dispose();
      mat.dispose();
    }
    this.envTarget.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------ frame

  private updateRunning(): void {
    const visible = typeof document === "undefined" || document.visibilityState !== "hidden";
    if (visible && !this.running) {
      this.running = true;
      this.lastFrame = performance.now();
      this.renderer.setAnimationLoop((t) => this.frame(t));
    } else if (!visible && this.running) {
      this.running = false;
      this.renderer.setAnimationLoop(null);
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const alpha = Math.min(1, Math.max(0, (performance.now() - this.curr.t) / SIM_DT_MS));
    const p = this.prev;
    const c = this.curr;
    const x = p.x + (c.x - p.x) * alpha;
    const z = p.z + (c.z - p.z) * alpha;
    const yaw = p.yaw + angleDelta(p.yaw, c.yaw) * alpha;
    const h = p.h + (c.h - p.h) * alpha;
    const pitch = p.pitch + (c.pitch - p.pitch) * alpha;
    const roll = p.roll + (c.roll - p.roll) * alpha;
    for (let i = 0; i < 8; i++) this.joints[i] = p.joints[i] + (c.joints[i] - p.joints[i]) * alpha;

    const root = this.rig.root;
    root.position.set(x, h, z);
    root.rotation.set(pitch, bodyRotationY(yaw), roll, "YXZ");
    applyJoints(this.rig, this.joints);

    this.bodyPos.set(x, h, z);
    this.updateSonar(c.distance);
    this.contact.position.set(x, 0.0009, z);
    this.contact.rotation.z = -yaw;
    const lift = Math.max(0, h - 0.045);
    (this.contact.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(0.35, 1 - lift * 12);
    this.updateKeyLight();
    this.updateCamera(yaw, dt);

    this.renderer.render(this.scene, this.camera);
    this.renderedFrames++;
    const info = this.renderer.info.render;
    this.stats.calls = info.calls;
    this.stats.triangles = info.triangles;
    this.frames++;
    this.fpsWindow += dt;
    if (this.fpsWindow >= 0.5) {
      this.stats.fps = this.frames / this.fpsWindow;
      this.frames = 0;
      this.fpsWindow = 0;
    }
  }

  private updateCamera(yaw: number, dt: number): void {
    const body = this.bodyPos;
    if (this.mode === CAMERA_MODE.ORBIT) {
      // Orbit keeps the user's angle and distance but travels with the body.
      this.tmpV.copy(body).sub(this.lastBody);
      this.camera.position.add(this.tmpV);
      this.controls.target.copy(body);
      this.controls.update();
      this.setFov(ORBIT_FOV);
    } else {
      const preset = PRESET[this.mode];
      this.setFov(preset.fov);
      const [ox, oy, oz] = preset.offset;
      // Body frame offset -> world (yaw only; the camera does not rock with the body).
      const a = bodyRotationY(yaw);
      const c = Math.cos(a);
      const s = Math.sin(a);
      this.tmpV.set(body.x + ox * c + oz * s, body.y + oy, body.z - ox * s + oz * c);
      this.tmpV2.set(body.x, body.y + preset.look, body.z);
      if (this.snapCamera || this.mode !== CAMERA_MODE.FOLLOW) {
        // Inspection presets are rigid; follow uses exponential smoothing.
        this.camera.position.copy(this.tmpV);
      } else {
        const k = 1 - Math.exp(-dt * 4);
        this.camera.position.lerp(this.tmpV, k);
      }
      this.camera.position.y = Math.max(0.012, this.camera.position.y);
      this.camera.lookAt(this.tmpV2);
      this.snapCamera = false;
    }
    this.lastBody.copy(body);
  }

  private setFov(fov: number): void {
    if (this.camera.fov === fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  private updateKeyLight(): void {
    // The key light's shadow frustum follows the robot so its shadow stays crisp.
    const b = this.bodyPos;
    this.key.position.set(b.x - 1.2, 2.2, b.z + 1.6);
    this.key.target.position.set(b.x, 0, b.z);
  }

  private updateSonar(distance: number | null): void {
    const reach = distance ?? SENSOR.maxRange;
    this.sonarCone.scale.set(reach, reach, reach);
    const mat = this.sonarCone.material as THREE.MeshBasicMaterial;
    mat.opacity = distance == null ? 0.03 : 0.07;
    this.sonarHit.visible = this.options.sonar && distance != null;
    if (distance != null) this.sonarHit.position.set(0, 0, -reach);
  }

  // ------------------------------------------------------------------ build

  private buildDome(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(40, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        bottom: { value: new THREE.Color(0x06080b) },
        top: { value: new THREE.Color(0x0b1118) },
      },
      vertexShader: `varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 bottom; uniform vec3 top; varying float vY; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.6, vY)), 1.0); }`,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.name = "dome";
    return dome;
  }

  private buildLights(): THREE.DirectionalLight {
    this.scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x080a0d, 0.25));
    // Key: warm-neutral from front-left-top, the only shadow caster.
    const key = new THREE.DirectionalLight(0xfff1e0, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -0.6;
    key.shadow.camera.right = 0.6;
    key.shadow.camera.top = 0.6;
    key.shadow.camera.bottom = -0.6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 6;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.002;
    key.shadow.radius = 3;
    this.scene.add(key, key.target);
    // Cool fill from the right, cool rim from behind: readable acrylic edges.
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.6);
    fill.position.set(2, 1.2, 0.5);
    const rim = new THREE.DirectionalLight(0xa8c8ff, 1.3);
    rim.position.set(0.4, 1.4, -2.5);
    this.scene.add(fill, rim);
    return key;
  }

  private buildContactShadow(): THREE.Mesh {
    let map: THREE.Texture | null = null;
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
        g.addColorStop(0, "rgba(0,0,0,0.85)");
        g.addColorStop(0.55, "rgba(0,0,0,0.35)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        map = new THREE.CanvasTexture(canvas);
      }
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.2),
      new THREE.MeshBasicMaterial({ map: map ?? undefined, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = "contact-shadow";
    return mesh;
  }

  private buildSonar(): [THREE.Mesh, THREE.Mesh] {
    // Unit cone: apex at the transducers, base 1 m ahead along the body's -Z.
    const geo = new THREE.ConeGeometry(Math.tan(SENSOR.coneHalfAngle), 1, 40, 1, true);
    geo.translate(0, -0.5, 0);
    // rotateX(π/2) maps (x, y, z) -> (x, -z, y): the base at y = -1 lands on z = -1 (ahead).
    geo.rotateX(Math.PI / 2);
    const cone = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x7fd6cf, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.name = "sonar-cone";
    const o = SENSOR.origin;
    const holder = new THREE.Group();
    holder.position.set(o.x, o.y, o.z);
    holder.add(cone);
    const hit = new THREE.Mesh(
      new THREE.RingGeometry(0.012, 0.016, 32),
      new THREE.MeshBasicMaterial({ color: 0x9ff3e8, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    hit.name = "sonar-hit";
    holder.add(hit);
    this.rig.body.add(holder);
    return [cone, hit];
  }

  private copySnap(dst: Snapshot, src: Snapshot): void {
    Object.assign(dst, { ...src, joints: [...src.joints] });
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
