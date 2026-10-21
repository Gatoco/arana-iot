/**
 * Runtime: binds the headless engine to a transport at a fixed tick rate.
 *
 * The engine is the twin's firmware; transport is how commands/telemetry
 * travel. React subscribes for rendering; it never drives the sim directly.
 */

import {
  CMD_KIND,
  CONTROL_MODE,
  GAIT,
  TOPIC,
  type Command,
  type ControlMode,
  type Gait,
  type Telemetry,
} from "../protocol";
import { createEngine, TwinEngine, type RobotState } from "../sim/engine";
import {
  createTransport,
  TRANSPORT_KIND,
  type Transport,
  type TransportAuth,
  type TransportKind,
  type TransportStatus,
} from "../net/transport";

const TICK_HZ = 30;
const DT = 1 / TICK_HZ;

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

export interface RuntimeSnapshot {
  state: RobotState;
  joints: number[];
  telemetry: Telemetry;
  transport: TransportStatus;
  running: boolean;
}

export class TwinRuntime {
  readonly engine: TwinEngine;
  private transport: Transport;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: RuntimeSnapshot;
  private unsubTelemetry: (() => void) | null = null;
  private brainBridge: BrainBridge | null = null;

  constructor(
    kind: TransportKind = TRANSPORT_KIND.LOOPBACK,
    brokerUrl = "ws://localhost:9001",
    auth?: TransportAuth,
  ) {
    this.engine = createEngine();
    this.transport = createTransport(kind, brokerUrl, auth);
    this.snapshot = {
      state: this.engine.getState(),
      joints: this.engine.joints(),
      telemetry: this.engine.telemetry(),
      transport: this.transport.status(),
      running: false,
    };
    this.bindTransport();
  }

  /** Wire the current transport: status, operator commands, brain state. */
  private bindTransport(): void {
    this.transport.onStatus((status) => this.update({ transport: status }));
    // Commands arriving from outside (MQTT) feed the engine.
    this.transport.subscribe(TOPIC.CMD, (payload) => this.command(payload as Command, false));
    this.transport.subscribe(TOPIC.BRAIN_STATE, (payload) => this.handleBrainState(payload));
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
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ);
    this.update({ running: true });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.update({ running: false });
  }

  private tick(): void {
    this.engine.step(DT);
    this.update({
      state: { ...this.engine.getState() },
      joints: this.engine.joints(),
      telemetry: this.engine.telemetry(),
    });
    // Publish telemetry so external consumers (and the real ESP later) see it.
    this.transport.publish(TOPIC.TELEMETRY, this.snapshot.telemetry);
  }

  /** Apply a command locally and optionally re-broadcast it. */
  command(cmd: Command, broadcast = true): void {
    this.engine.apply(cmd);
    if (broadcast) this.transport.publish(TOPIC.CMD, cmd);
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

  reconnect(kind: TransportKind, brokerUrl: string, auth?: TransportAuth): void {
    this.unsubTelemetry?.();
    this.transport.disconnect();
    this.transport = createTransport(kind, brokerUrl, auth);
    this.bindTransport();
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): RuntimeSnapshot => this.snapshot;

  private update(patch: Partial<RuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const cb of this.listeners) cb();
  }
}

/** Convenience for the default gait when starting to move. */
export const DEFAULT_GAIT: Gait = GAIT.TETRAPOD;
