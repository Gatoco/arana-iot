/**
 * Three.js view of the spider in its test zone. Built imperatively and mounted
 * by a React wrapper. Reads RobotState; owns no simulation logic.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LEGS, type LegId } from "../protocol";
import {
  BODY,
  HIP,
  LEG_GEOMETRY,
  SENSOR,
  SERVO,
  legSide,
  solveLeg,
  type FootTarget,
} from "../sim/spiderModel";
import { ARENA, OBSTACLE, PILLAR } from "../sim/world";
import type { RobotState } from "../sim/engine";
import { LEG_RIG, solveRenderLeg } from "./legRig";
import { bodyRotationY } from "./heading";

export const CAMERA_MODE = {
  ORBIT: "orbit",
  FOLLOW: "follow",
} as const;

export type CameraMode = (typeof CAMERA_MODE)[keyof typeof CAMERA_MODE];

const COLOR = {
  void: 0x030407,
  floor: 0x07090d,
  gridMajor: 0x1f6f7a,
  gridMinor: 0x0e1a20,
  tick: 0x2dd4bf,
  pillar: 0x14171d,
  pillarGlow: 0x22d3ee,
  obstacle: 0x1c1712,
  obstacleEdge: 0xf59e0b,
  chassis: 0x1a1d24,
  limb: 0x23272f,
  joint: 0x22d3ee,
  femurServo: 0x22d3ee,
  tibiaServo: 0xe879f9,
  servoCase: 0x0f1a2e,
  sensor: 0x38bdf8,
} as const;

/** Follow camera offset behind and above the body, meters. */
const FOLLOW = { back: 0.55, up: 0.32 } as const;

interface LegParts {
  yaw: THREE.Group;
  pitch: THREE.Group;
  knee: THREE.Group;
}

export class SpiderView {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private cameraMode: CameraMode = CAMERA_MODE.FOLLOW;
  private root = new THREE.Group();
  private legs = new Map<LegId, LegParts>();
  private sonarCone: THREE.Mesh;
  private lastBody = new THREE.Vector3();
  private resizeObs: ResizeObserver | null = null;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLOR.void);
    this.scene.fog = new THREE.Fog(COLOR.void, 2.5, 14);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 60);
    this.camera.position.set(0, FOLLOW.up, -FOLLOW.back);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 14;
    this.controls.enabled = false;

    this.buildLights();
    this.buildZone();
    this.buildBody();
    for (const leg of LEGS) this.buildLeg(leg);
    this.sonarCone = this.buildSonar();
    this.scene.add(this.root);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.controls.enabled = mode === CAMERA_MODE.ORBIT;
    if (mode === CAMERA_MODE.ORBIT) this.controls.target.copy(this.lastBody);
  }

  // ---------------------------------------------------------------- world

  private buildLights(): void {
    this.scene.add(new THREE.AmbientLight(0x8fb3ff, 0.12));
    const spots: [number, number, number, number][] = [
      [-3.5, 5, -3.5, 0xbfe9ff],
      [3.5, 5, 3.5, 0x9fd8ff],
    ];
    for (const [x, y, z, color] of spots) {
      const spot = new THREE.SpotLight(color, 90, 0, Math.PI / 5, 0.6, 1.6);
      spot.position.set(x, y, z);
      spot.target.position.set(0, 0, 0);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0005;
      this.scene.add(spot, spot.target);
    }
  }

  private buildZone(): void {
    const size = ARENA.size;
    const half = size / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: COLOR.floor, roughness: 0.95, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const minor = new THREE.GridHelper(size, size * 10, COLOR.gridMinor, COLOR.gridMinor);
    minor.position.y = 0.0005;
    const major = new THREE.GridHelper(size, size, COLOR.gridMajor, COLOR.gridMajor);
    major.position.y = 0.001;
    this.scene.add(minor, major);

    this.buildOrigin();
    this.buildEdgeTicks(half);
    this.buildPillars(half);
    this.buildObstacle();
  }

  private buildOrigin(): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.14, 48),
      new THREE.MeshBasicMaterial({ color: COLOR.tick, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    this.scene.add(ring);
    const axis = (color: number, to: THREE.Vector3) =>
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.003, 0), to]),
        new THREE.LineBasicMaterial({ color }),
      );
    this.scene.add(
      axis(0xef4444, new THREE.Vector3(0.5, 0.003, 0)),
      axis(0x3b82f6, new THREE.Vector3(0, 0.003, 0.5)),
    );
  }

  /** Tick marks every 1 m along the four arena borders (longer every 5 m). */
  private buildEdgeTicks(half: number): void {
    const mat = new THREE.MeshBasicMaterial({ color: COLOR.tick });
    for (let i = -half; i <= half; i++) {
      const length = i % 5 === 0 ? 0.35 : 0.18;
      const geo = new THREE.BoxGeometry(0.025, 0.004, length);
      const marks: [number, number, number][] = [
        [i, half - length / 2, 0],
        [i, -half + length / 2, 0],
        [half - length / 2, i, Math.PI / 2],
        [-half + length / 2, i, Math.PI / 2],
      ];
      for (const [x, z, rot] of marks) {
        const tick = new THREE.Mesh(geo, mat);
        tick.position.set(x, 0.002, z);
        tick.rotation.y = rot;
        this.scene.add(tick);
      }
    }
  }

  private buildPillars(half: number): void {
    const body = new THREE.MeshStandardMaterial({ color: COLOR.pillar, roughness: 0.6, metalness: 0.4 });
    const glow = new THREE.MeshStandardMaterial({
      color: COLOR.pillarGlow,
      emissive: COLOR.pillarGlow,
      emissiveIntensity: 1.4,
    });
    const inset = half - PILLAR.side / 2;
    for (const [x, z] of [
      [inset, inset],
      [-inset, inset],
      [inset, -inset],
      [-inset, -inset],
    ]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(PILLAR.side, PILLAR.height, PILLAR.side), body);
      pillar.position.set(x, PILLAR.height / 2, z);
      pillar.castShadow = true;
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(PILLAR.side + 0.01, 0.04, PILLAR.side + 0.01),
        glow,
      );
      band.position.set(x, PILLAR.height - 0.08, z);
      this.scene.add(pillar, band);
    }
  }

  private buildObstacle(): void {
    const { center, size } = OBSTACLE;
    const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    const box = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: COLOR.obstacle, roughness: 0.7, metalness: 0.2 }),
    );
    box.position.set(center.x, size.y / 2, center.z);
    box.castShadow = true;
    box.receiveShadow = true;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: COLOR.obstacleEdge }),
    );
    edges.position.copy(box.position);
    this.scene.add(box, edges);
  }

  // ---------------------------------------------------------------- spider

  private buildBody(): void {
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(BODY.width, BODY.height, BODY.length),
      new THREE.MeshStandardMaterial({ color: COLOR.chassis, metalness: 0.6, roughness: 0.35 }),
    );
    chassis.castShadow = true;
    this.root.add(chassis);

    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.002, BODY.length * 0.8),
      new THREE.MeshStandardMaterial({ color: COLOR.joint, emissive: COLOR.joint, emissiveIntensity: 1.2 }),
    );
    spine.position.y = BODY.height / 2 + 0.001;
    this.root.add(spine);

    // HC-SR04 at the nose (local -Z): board plus two transducers.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.02, 0.003),
      new THREE.MeshStandardMaterial({ color: 0x0b3b5c, roughness: 0.5 }),
    );
    board.position.set(0, 0, -BODY.length / 2 - 0.002);
    this.root.add(board);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      metalness: 0.8,
      roughness: 0.3,
      emissive: COLOR.sensor,
      emissiveIntensity: 0.25,
    });
    for (const x of [-0.013, 0.013]) {
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 20), eyeMat);
      eye.rotation.x = Math.PI / 2;
      eye.position.set(x, 0, -BODY.length / 2 - 0.009);
      this.root.add(eye);
    }
  }

  private buildSonar(): THREE.Mesh {
    // Unit cone with its apex at the origin and its base 1 m ahead (local -Z).
    const geo = new THREE.ConeGeometry(Math.tan(SENSOR.coneHalfAngle), 1, 32, 1, true);
    geo.translate(0, -0.5, 0);
    geo.rotateX(Math.PI / 2);
    const cone = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: COLOR.sensor,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    cone.position.set(0, 0, -BODY.length / 2 - 0.015);
    this.root.add(cone);
    return cone;
  }

  private jointMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: COLOR.joint,
      emissive: COLOR.joint,
      emissiveIntensity: 1.6,
    });
  }

  /** One MG90 case with a status LED in the servo's identifying color. */
  private buildServo(name: string, led: number): THREE.Group {
    const servo = new THREE.Group();
    servo.name = name;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(SERVO.width, SERVO.height, SERVO.depth),
      new THREE.MeshStandardMaterial({ color: COLOR.servoCase, metalness: 0.2, roughness: 0.6 }),
    );
    body.castShadow = true;
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(SERVO.width * 1.02, 0.003, SERVO.depth * 0.5),
      new THREE.MeshStandardMaterial({ color: led, emissive: led, emissiveIntensity: 2 }),
    );
    light.position.y = SERVO.height / 2;
    servo.add(body, light);
    return servo;
  }

  private buildLeg(leg: LegId): void {
    const h = HIP[leg];
    const side = legSide(leg);

    const hip = new THREE.Group();
    hip.position.set(h.x, 0, h.z);

    // Servo 1 (protocol "femur"): mounted on the chassis, swings the leg fore/aft.
    const femurServo = this.buildServo(`servo:${leg}:femur`, COLOR.femurServo);
    femurServo.position.set(-side * SERVO.width * 0.2, BODY.height / 2 + SERVO.height / 2 - 0.004, 0);
    hip.add(femurServo);

    const yaw = new THREE.Group();
    hip.add(yaw);
    const pitch = new THREE.Group();
    yaw.add(pitch);

    const limb = new THREE.MeshStandardMaterial({ color: COLOR.limb, metalness: 0.5, roughness: 0.4 });

    const hipJoint = new THREE.Mesh(new THREE.SphereGeometry(0.007, 16, 12), this.jointMaterial());
    pitch.add(hipJoint);

    const femur = new THREE.Mesh(new THREE.BoxGeometry(LEG_RIG.femur, 0.008, 0.012), limb);
    femur.position.set((side * LEG_RIG.femur) / 2, 0, 0);
    femur.castShadow = true;
    pitch.add(femur);

    // Knee: servo 2 (protocol "tibia") drives the tibia.
    const knee = new THREE.Group();
    knee.position.set(side * LEG_RIG.femur, 0, 0);
    pitch.add(knee);

    const tibiaServo = this.buildServo(`servo:${leg}:tibia`, COLOR.tibiaServo);
    tibiaServo.rotation.z = Math.PI / 2;
    knee.add(tibiaServo);

    const kneeJoint = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12), this.jointMaterial());
    knee.add(kneeJoint);

    const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0025, LEG_RIG.tibia, 10), limb);
    tibia.rotation.z = (side * Math.PI) / 2;
    tibia.position.set((side * LEG_RIG.tibia) / 2, 0, 0);
    tibia.castShadow = true;
    knee.add(tibia);

    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.005, 12, 10), this.jointMaterial());
    foot.position.set(side * LEG_RIG.tibia, 0, 0);
    knee.add(foot);

    this.root.add(hip);
    this.legs.set(leg, { yaw, pitch, knee });
  }

  // ---------------------------------------------------------------- frame

  update(state: RobotState): void {
    this.root.position.set(state.x, LEG_GEOMETRY.hipHeight, state.z);
    this.root.rotation.y = bodyRotationY(state.yaw);

    for (const leg of LEGS) {
      const parts = this.legs.get(leg);
      if (!parts) continue;
      const target: FootTarget = state.targets[leg] ?? { forward: 0, height: 0 };
      const side = legSide(leg);
      const rig = solveRenderLeg(target.height);
      parts.yaw.rotation.y = solveLeg(target).coxa * side;
      parts.pitch.rotation.z = rig.femurPitch * side;
      parts.knee.rotation.z = rig.kneeBend * side;
    }

    const reach = state.distance ?? SENSOR.maxRange;
    this.sonarCone.scale.setScalar(reach);
    (this.sonarCone.material as THREE.MeshBasicMaterial).opacity = state.distance == null ? 0.05 : 0.14;

    const body = new THREE.Vector3(state.x, LEG_GEOMETRY.hipHeight, state.z);
    if (this.cameraMode === CAMERA_MODE.FOLLOW) {
      const behind = new THREE.Vector3(
        state.x - Math.sin(state.yaw) * FOLLOW.back,
        FOLLOW.up,
        state.z - Math.cos(state.yaw) * FOLLOW.back,
      );
      this.camera.position.lerp(behind, 0.08);
      this.camera.lookAt(body);
    } else {
      // Orbit keeps the user's angle and distance but travels with the body.
      const delta = body.clone().sub(this.lastBody);
      this.camera.position.add(delta);
      this.controls.target.copy(body);
    }
    this.lastBody.copy(body);
  }

  render(): void {
    if (this.cameraMode === CAMERA_MODE.ORBIT) this.controls.update();
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
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
  }
}
