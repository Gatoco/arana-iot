/**
 * Runtime: binds the headless engine to a transport at a fixed tick rate.
 *
 * The engine is the twin's firmware; transport is how commands/telemetry
 * travel. React subscribes for rendering; it never drives the sim directly.
 */

import { CMD_KIND, GAIT, TOPIC, type Command, type Gait, type Telemetry } from "../protocol";
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
    this.transport.onStatus((status) => this.update({ transport: status }));
    this.transport.connect();

    // Commands arriving from outside (MQTT) feed the engine.
    this.transport.subscribe(TOPIC.CMD, (payload) => {
      this.command(payload as Command, false);
    });
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

  setWorld(wall: number | null): void {
    this.engine.setWorld({ wall });
  }

  reconnect(kind: TransportKind, brokerUrl: string, auth?: TransportAuth): void {
    this.unsubTelemetry?.();
    this.transport.disconnect();
    this.transport = createTransport(kind, brokerUrl, auth);
    this.transport.onStatus((status) => this.update({ transport: status }));
    this.transport.subscribe(TOPIC.CMD, (payload) => this.command(payload as Command, false));
    this.transport.connect();
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
