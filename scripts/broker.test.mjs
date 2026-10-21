/**
 * S9: the embedded broker bridges MQTT over TCP and over WebSocket.
 */

import { test, expect } from "vitest";
import mqtt from "mqtt";
import { startBroker } from "./broker.mjs";

function connected(url) {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(url, { reconnectPeriod: 0 });
    client.once("connect", () => resolve(client));
    client.once("error", reject);
  });
}

test("S9: a TCP publisher reaches a WebSocket subscriber", async () => {
  const broker = await startBroker({ tcpPort: 0, wsPort: 0, log: () => {} });
  const tcp = await connected(`mqtt://127.0.0.1:${broker.tcpPort}`);
  const ws = await connected(`ws://127.0.0.1:${broker.wsPort}`);
  try {
    const received = new Promise((resolve) => {
      ws.on("message", (topic, payload) => resolve({ topic, payload: payload.toString() }));
    });
    await ws.subscribeAsync("arana/cmd");
    await tcp.publishAsync("arana/cmd", JSON.stringify({ kind: "stop" }));
    expect(await received).toEqual({ topic: "arana/cmd", payload: '{"kind":"stop"}' });
  } finally {
    await tcp.endAsync();
    await ws.endAsync();
    await broker.close();
  }
});
