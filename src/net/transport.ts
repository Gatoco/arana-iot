/**
 * Transport abstraction. The twin needs to talk to a body over MQTT, but it
 * must also run standalone (no broker) with in-memory loopback.
 *
 * The future ESP kit plugs into the MQTT side; nothing else changes.
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
  broker?: string;
  error?: string;
}

/** Credentials for a broker that requires authentication. */
export interface TransportAuth {
  username: string;
  password: string;
}

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

export class MqttTransport implements Transport {
  private client: MqttClient | null = null;
  private handlers = new Map<string, Set<(payload: unknown) => void>>();
  private statusCbs = new Set<(status: TransportStatus) => void>();
  private current: TransportStatus;
  private brokerUrl: string;
  private auth?: TransportAuth;

  constructor(brokerUrl: string, auth?: TransportAuth) {
    this.brokerUrl = brokerUrl;
    this.auth = auth;
    this.current = { kind: TRANSPORT_KIND.MQTT, connected: false, broker: brokerUrl };
  }

  connect(): void {
    if (this.client) return;
    try {
      this.client = mqtt.connect(this.brokerUrl, {
        reconnectPeriod: 3000,
        username: this.auth?.username,
        password: this.auth?.password,
      });
      this.client.on("connect", () => {
        this.update({ connected: true, error: undefined });
        for (const topic of this.handlers.keys()) this.client?.subscribe(topic);
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
      this.update({ connected: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  publish<T>(topic: Topic, payload: T): void {
    this.client?.publish(topic, JSON.stringify(payload));
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
    this.client?.end(true);
    this.client = null;
    this.update({ connected: false });
  }

  onStatus(cb: (status: TransportStatus) => void): () => void {
    this.statusCbs.add(cb);
    cb(this.current);
    return () => this.statusCbs.delete(cb);
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
