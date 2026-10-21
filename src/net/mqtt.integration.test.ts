/**
 * End-to-end check against a real broker. Skipped unless ARANA_BROKER_URL is set:
 *
 *   ARANA_BROKER_URL=ws://localhost:9001/mqtt ARANA_BROKER_USER=... ARANA_BROKER_PASS=... \
 *     npx vitest run src/net/mqtt.integration.test.ts
 *
 * Credentials come from the environment only; nothing is stored in the repository.
 */

import { test, expect, afterEach } from "vitest";
import mqtt from "mqtt";
import { TwinRuntime } from "../runtime/TwinRuntime";
import { TRANSPORT_KIND } from "./transport";
import { CMD_KIND, CONTROL_MODE, GAIT, POSE, TOPIC, type Telemetry } from "../protocol";

const URL = process.env.ARANA_BROKER_URL;
const USER = process.env.ARANA_BROKER_USER ?? "";
const PASS = process.env.ARANA_BROKER_PASS ?? "";
const run = URL ? test : test.skip;

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));

function until(cond: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const id = setInterval(() => {
      if (cond()) {
        clearInterval(id);
        resolve();
      } else if (Date.now() - start > ms) {
        clearInterval(id);
        reject(new Error("timed out"));
      }
    }, 25);
  });
}

run("twin over MQTT: telemetry out, operator commands in, pose runs, echo is not double-applied", async () => {
  const twin = new TwinRuntime(TRANSPORT_KIND.MQTT, URL!, { username: USER, password: PASS });
  cleanup.push(() => {
    twin.stop();
    twin.reconnect(TRANSPORT_KIND.LOOPBACK, "");
  });
  twin.start();
  await until(() => twin.getSnapshot().transport.connected);

  const client = mqtt.connect(URL!, { username: USER, password: PASS, reconnectPeriod: 0 });
  cleanup.push(() => client.end(true));
  await new Promise<void>((resolve, reject) => {
    client.on("connect", () => resolve());
    client.on("error", reject);
  });
  const telemetry: Telemetry[] = [];
  client.subscribe(TOPIC.TELEMETRY);
  client.on("message", (topic, payload) => {
    if (topic === TOPIC.TELEMETRY) telemetry.push(JSON.parse(payload.toString()));
  });
  await until(() => telemetry.length > 5);
  expect(telemetry.at(-1)!.joints).toHaveLength(8);

  client.publish(TOPIC.CMD, JSON.stringify({ kind: CMD_KIND.MOVE, forward: 1, turn: 0 }));
  await until(() => twin.engine.getState().mode === CONTROL_MODE.MANUAL);
  expect(twin.engine.getState().gait).toBe(GAIT.TETRAPOD);
  await until(() => telemetry.at(-1)!.mode === CONTROL_MODE.MANUAL);

  client.publish(TOPIC.CMD, JSON.stringify({ kind: CMD_KIND.POSE, pose: POSE.HELLO }));
  await until(() => twin.engine.getState().action === POSE.HELLO);

  // A command issued by the twin itself comes back from the broker and must be skipped once.
  twin.stopBody();
  const echoes = () => twin.getSnapshot().packets.filter((p) => p.dir === "in" && p.topic === TOPIC.CMD && p.payload === '{"kind":"stop"}').length;
  await until(() => echoes() >= 1);
  expect(twin.engine.getState().action).toBeNull();
}, 30000);

run("wrong password is reported, not swallowed", async () => {
  const twin = new TwinRuntime(TRANSPORT_KIND.MQTT, URL!, { username: USER || "nobody", password: "definitely-wrong" });
  cleanup.push(() => twin.reconnect(TRANSPORT_KIND.LOOPBACK, ""));
  await until(() => Boolean(twin.getSnapshot().transport.error));
  expect(twin.getSnapshot().transport.connected).toBe(false);
  expect(twin.getSnapshot().transport.error).toMatch(/authori|refused/i);
}, 15000);
