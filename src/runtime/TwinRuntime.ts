/**
 * Runtime: binds the headless engine to a transport at a fixed tick rate.
 *
 * The engine is the twin's firmware; transport is how commands/telemetry
 * travel. React subscribes for rendering; it never drives the sim directly.
 *
 * Two subscription rates:
 *   - onTick: every sim tick (30 Hz), for the 3D view
 *   - subscribe/getSnapshot: the React store, refreshed at 10 Hz and on discrete events
 */

import {
  CMD_KIND,
  CONTROL_MODE,
  GAIT,
  TOPIC,
  type Command,
  type ControlMode,
  type Gait,
  type PoseName,
  type Telemetry,
  type Topic,
} from "../protocol";
import { createEngine, TwinEngine, type RobotState } from "../sim/engine";
import { toRadians, toDegrees } from "../sim/spiderModel";
import {
  createTransport,
  TRANSPORT_KIND,
  type Transport,
  type TransportAuth,
  type TransportKind,
  type TransportStatus,
} from "../net/transport";

export const TICK_HZ = 30;
const DT = 1 / TICK_HZ;
const UI_HZ = 10;
export const PACKET_LOG_SIZE = 50;
/** An echo older than this is not ours anymore (broker round trips are milliseconds). */
export const ECHO_TTL_MS = 2000;

/**
 * Extension point: turns `arana/brain/state` payloads into body behavior while
 * the body is in `auto`. Intentionally not implemented yet; the brain message
 * shape is not part of the protocol contract.
 *
 * Rule for the implementation: the bridge must drive the engine through a
 * non-operator input. Going through `command()` / `engine.apply()` or publishing
 * on `arana/cmd` counts as operator input and would switch the body to manual.
 */
export type BrainBridge = (brainState: unknown) => void;

export interface Packet {
  id: number;
  t: number;
  dir: "in" | "out";
  topic: string;
  payload: string;
}

export interface RuntimeSnapshot {
  state: RobotState;
  /** Joint angles in degrees, protocol order. */
  joints: number[];
  telemetry: Telemetry;
  transport: TransportStatus;
  running: boolean;
  /** Measured sim ticks per second. */
  tickHz: number;
  packetsIn: number;
  packetsOut: number;
  packets: Packet[];
  servoTest: boolean;
  /** Servo test targets, degrees, protocol order. */
  servoTargets: number[];
}

export class TwinRuntime {
  readonly engine: TwinEngine;
  private transport: Transport;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private tickListeners = new Set<(state: RobotState) => void>();
  private snapshot: RuntimeSnapshot;
  private brainBridge: BrainBridge | null = null;
  private unbind: (() => void)[] = [];
  /**
   * Our own commands come back from the broker (and loopback); skip each echo once. Entries
   * expire after ECHO_TTL_MS and are dropped on every (re)connect, so a lost echo can never
   * swallow a later identical command from another controller (e.g. a phone's stop).
   */
  private pendingEcho = new Map<string, number[]>();
  private wasConnected = false;
  private packets: Packet[] = [];
  private packetId = 0;
  private packetsIn = 0;
  private packetsOut = 0;
  private logTelemetry = false;
  private lastUi = 0;
  private tickCount = 0;
  private tickWindowStart = 0;
  private tickHz = 0;
  private servoTest = false;

  constructor(
    kind: TransportKind = TRANSPORT_KIND.LOOPBACK,
    brokerUrl = "ws://localhost:9001/mqtt",
    auth?: TransportAuth,
  ) {
    this.engine = createEngine();
    this.transport = createTransport(kind, brokerUrl, auth);
    this.snapshot = this.buildSnapshot(false);
    this.bindTransport();
  }

  /** Wire the current transport: status, operator commands, brain state. */
  private bindTransport(): void {
    this.unbind.push(
      this.transport.onStatus((status) => {
        if (status.connected !== this.wasConnected) this.pendingEcho.clear();
        this.wasConnected = status.connected;
        this.update({ transport: status }, true);
      }),
    );
    // Commands arriving from outside (MQTT) feed the engine.
    this.unbind.push(
      this.transport.subscribe(TOPIC.CMD, (payload) => {
        this.record("in", TOPIC.CMD, payload);
        if (this.consumeEcho(payload)) return;
        this.command(payload as Command, false);
      }),
    );
    this.unbind.push(
      this.transport.subscribe(TOPIC.BRAIN_STATE, (payload) => {
        this.record("in", TOPIC.BRAIN_STATE, payload);
        this.handleBrainState(payload);
      }),
    );
    this.transport.connect();
  }

  setBrainBridge(bridge: BrainBridge | null): void {
    this.brainBridge = bridge;
  }

  /** Brain state is honored only in `auto`; in `manual` the operator owns the body. */
  handleBrainState(payload: unknown): void {
    if (this.engine.getState().mode !== CONTROL_MODE.AUTO) return;
    this.brainBridge?.(payload);
  }

  start(): void {
    if (this.timer) return;
    this.tickWindowStart = Date.now();
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
    this.update({ running: true }, true);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.update({ running: false }, true);
  }

  /** One sim step; public so headless tools (screenshots, tests) can drive time. */
  tick(): void {
    this.engine.step(DT);
    const now = Date.now();
    this.tickCount++;
    if (now - this.tickWindowStart >= 1000) {
      this.tickHz = (this.tickCount * 1000) / (now - this.tickWindowStart);
      this.tickCount = 0;
      this.tickWindowStart = now;
    }
    const state = this.engine.getState();
    for (const cb of this.tickListeners) cb(state);
    // Publish telemetry so external consumers (and the real ESP later) see it.
    this.publish(TOPIC.TELEMETRY, this.engine.telemetry());
    if (now - this.lastUi >= 1000 / UI_HZ) {
      this.lastUi = now;
      this.update({}, true);
    }
  }

  /** Apply a command locally and optionally re-broadcast it. */
  command(cmd: Command, broadcast = true): void {
    this.engine.apply(cmd);
    if (broadcast) this.publish(TOPIC.CMD, cmd);
    this.update({}, true);
  }

  move(forward: number, turn: number): void {
    this.command({ kind: CMD_KIND.MOVE, forward, turn });
  }

  stopBody(): void {
    this.command({ kind: CMD_KIND.STOP });
  }

  setGait(gait: Gait): void {
    this.command({ kind: CMD_KIND.GAIT, gait });
  }

  setMode(mode: ControlMode): void {
    this.command({ kind: CMD_KIND.MODE, mode });
  }

  pose(pose: PoseName): void {
    this.command({ kind: CMD_KIND.POSE, pose });
  }

  /** Servo test is local to the twin: it never publishes joint targets. */
  setServoTest(enabled: boolean): void {
    this.servoTest = enabled;
    this.engine.setServoTest(enabled);
    this.update({}, true);
  }

  /** Degrees, protocol order. Clamped to the joint limits by the engine. */
  setServoTargets(degrees: number[]): void {
    this.engine.setServoTargets(degrees.map(toRadians));
    this.update({}, true);
  }

  resetPose(): void {
    this.engine.resetPose();
    this.update({}, true);
  }

  setLogTelemetry(enabled: boolean): void {
    this.logTelemetry = enabled;
  }

  clearPackets(): void {
    this.packets = [];
    this.update({}, true);
  }

  reconnect(kind: TransportKind, brokerUrl: string, auth?: TransportAuth): void {
    for (const off of this.unbind.splice(0)) off();
    this.transport.disconnect();
    this.pendingEcho.clear();
    this.transport = createTransport(kind, brokerUrl, auth);
    this.bindTransport();
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** Every sim tick, with the live engine state (do not keep references to it). */
  onTick(cb: (state: RobotState) => void): () => void {
    this.tickListeners.add(cb);
    return () => this.tickListeners.delete(cb);
  }

  getSnapshot = (): RuntimeSnapshot => this.snapshot;

  private publish(topic: Topic, payload: unknown): void {
    const connected = this.transport.status().connected;
    if (connected && topic === TOPIC.CMD) {
      const key = JSON.stringify(payload);
      this.pendingEcho.set(key, [...(this.pendingEcho.get(key) ?? []), Date.now()]);
    }
    // Log before sending: loopback delivers synchronously and the echo must come after.
    if (connected) {
      this.packetsOut++;
      if (topic !== TOPIC.TELEMETRY || this.logTelemetry) this.record("out", topic, payload, false);
    }
    this.transport.publish(topic, payload);
  }

  private consumeEcho(payload: unknown): boolean {
    const key = JSON.stringify(payload);
    const now = Date.now();
    const fresh = (this.pendingEcho.get(key) ?? []).filter((t) => now - t <= ECHO_TTL_MS);
    if (fresh.length === 0) {
      this.pendingEcho.delete(key);
      return false;
    }
    fresh.shift();
    if (fresh.length) this.pendingEcho.set(key, fresh);
    else this.pendingEcho.delete(key);
    return true;
  }

  private record(dir: "in" | "out", topic: string, payload: unknown, count = true): void {
    if (dir === "in" && count) this.packetsIn++;
    this.packets.push({ id: ++this.packetId, t: Date.now(), dir, topic, payload: JSON.stringify(payload) });
    if (this.packets.length > PACKET_LOG_SIZE) this.packets.splice(0, this.packets.length - PACKET_LOG_SIZE);
  }

  private buildSnapshot(running: boolean): RuntimeSnapshot {
    return {
      state: { ...this.engine.getState() },
      joints: this.engine.joints(),
      telemetry: this.engine.telemetry(),
      transport: this.transport.status(),
      running,
      tickHz: this.tickHz,
      packetsIn: this.packetsIn,
      packetsOut: this.packetsOut,
      packets: [...this.packets],
      servoTest: this.servoTest,
      servoTargets: this.engine.getServoTargets().map(toDegrees),
    };
  }

  private update(patch: Partial<RuntimeSnapshot>, refresh = false): void {
    const base = refresh ? this.buildSnapshot(this.snapshot.running) : this.snapshot;
    this.snapshot = { ...base, ...patch };
    for (const cb of this.listeners) cb();
  }
}

/** Convenience for the default gait when starting to move. */
export const DEFAULT_GAIT: Gait = GAIT.TETRAPOD;
