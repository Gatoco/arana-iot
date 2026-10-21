/**
 * Transport abstraction. The twin needs to talk to a body over MQTT, but it
 * must also run standalone (no broker) with in-memory loopback.
 *
 * The future ESP kit plugs into the MQTT side; nothing else changes.
 * QoS: every publish and subscribe uses the mqtt.js default, QoS 0 (see docs/protocol.md).
 */

import mqtt, { type MqttClient } from "mqtt";
import { type Command, type Telemetry, type Topic } from "../protocol";

export interface Transport {
  publish<T>(topic: Topic, payload: T): void;
  subscribe(topic: Topic, handler: (payload: unknown) => void): () => void;
  status(): TransportStatus;
  connect(): void;
  disconnect(): void;
  onStatus(cb: (status: TransportStatus) => void): () => void;
}

export const TRANSPORT_KIND = {
  LOOPBACK: "loopback",
  MQTT: "mqtt",
} as const;

export type TransportKind = (typeof TRANSPORT_KIND)[keyof typeof TRANSPORT_KIND];

export interface TransportStatus {
  kind: TransportKind;
  connected: boolean;
  /** A connection attempt (or automatic reconnect) is in progress. */
  connecting?: boolean;
  broker?: string;
  error?: string;
}

/** Credentials for a broker that requires authentication. */
export interface TransportAuth {
  username: string;
  password: string;
}

/** Seconds before a silent broker is reported as unreachable (reconnects keep going). */
export const CONNECT_TIMEOUT_S = 10;

/** In-memory bus: same semantics as MQTT, zero infrastructure. */
export class LoopbackTransport implements Transport {
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  private statusCbs = new Set<(status: TransportStatus) => void>();
  private current: TransportStatus = { kind: TRANSPORT_KIND.LOOPBACK, connected: true };

  publish<T>(topic: Topic, payload: T): void {
    const set = this.handlers.get(topic);
    if (!set) return;
    const copy = JSON.parse(JSON.stringify(payload));
    for (const h of set) h(copy);
  }

  subscribe(topic: Topic, handler: (payload: unknown) => void): () => void {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  status(): TransportStatus {
    return this.current;
  }

  connect(): void {
    /* always connected */
  }

  disconnect(): void {
    /* no-op */
  }

  onStatus(cb: (status: TransportStatus) => void): () => void {
    this.statusCbs.add(cb);
    cb(this.current);
    return () => this.statusCbs.delete(cb);
  }
}

/** Accept `host:port`, `ws://…`, `wss://…`, `mqtt://…`; default scheme ws:// and path /mqtt. */
export function normalizeBrokerUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return raw;
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `ws://${raw}`;
  try {
    const url = new URL(withScheme);
    if ((url.protocol === "ws:" || url.protocol === "wss:") && (url.pathname === "" || url.pathname === "/")) {
      url.pathname = "/mqtt";
    }
    return url.toString();
  } catch {
    return withScheme;
  }
}

export class MqttTransport implements Transport {
  private client: MqttClient | null = null;
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  private statusCbs = new Set<(status: TransportStatus) => void>();
  private current: TransportStatus;
  private brokerUrl: string;
  private auth?: TransportAuth;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  constructor(brokerUrl: string, auth?: TransportAuth) {
    this.brokerUrl = normalizeBrokerUrl(brokerUrl);
    this.auth = auth;
    this.current = { kind: TRANSPORT_KIND.MQTT, connected: false, broker: this.brokerUrl };
  }

  connect(): void {
    if (this.client) return;
    this.update({ connecting: true, error: undefined });
    this.armTimeout();
    try {
      this.client = mqtt.connect(this.brokerUrl, {
        reconnectPeriod: 3000,
        connectTimeout: CONNECT_TIMEOUT_S * 1000,
        username: this.auth?.username || undefined,
        password: this.auth?.password || undefined,
      });
      this.client.on("connect", () => {
        this.clearTimeout();
        this.update({ connected: true, connecting: false, error: undefined });
        for (const topic of this.handlers.keys()) this.client?.subscribe(topic);
      });
      this.client.on("reconnect", () => {
        this.update({ connecting: true });
        this.armTimeout();
      });
      this.client.on("close", () => this.update({ connected: false }));
      this.client.on("error", (err) => this.update({ connected: false, error: err.message }));
      this.client.on("message", (topic, payload) => {
        const set = this.handlers.get(topic);
        if (!set) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload.toString());
        } catch {
          return;
        }
        for (const h of set) h(parsed);
      });
    } catch (err) {
      this.clearTimeout();
      this.update({ connected: false, connecting: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  publish<T>(topic: Topic, payload: T): void {
    if (!this.client?.connected) return;
    this.client.publish(topic, JSON.stringify(payload));
  }

  subscribe(topic: Topic, handler: (payload: unknown) => void): () => void {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
    }
    set.add(handler);
    this.client?.subscribe(topic);
    return () => set?.delete(handler);
  }

  status(): TransportStatus {
    return this.current;
  }

  disconnect(): void {
    this.clearTimeout();
    this.client?.end(true);
    this.client = null;
    this.update({ connected: false, connecting: false });
  }

  onStatus(cb: (status: TransportStatus) => void): () => void {
    this.statusCbs.add(cb);
    cb(this.current);
    return () => this.statusCbs.delete(cb);
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.timeout = setTimeout(() => {
      if (!this.current.connected) {
        this.update({ error: `No answer from ${this.brokerUrl} after ${CONNECT_TIMEOUT_S} s; retrying` });
      }
    }, CONNECT_TIMEOUT_S * 1000);
  }

  private clearTimeout(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private update(patch: Partial<TransportStatus>): void {
    this.current = { ...this.current, ...patch };
    for (const cb of this.statusCbs) cb(this.current);
  }
}

export function createTransport(
  kind: TransportKind,
  brokerUrl: string,
  auth?: TransportAuth,
): Transport {
  return kind === TRANSPORT_KIND.MQTT
    ? new MqttTransport(brokerUrl, auth)
    : new LoopbackTransport();
}

export type { Command, Telemetry };
