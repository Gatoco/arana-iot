/**
 * Embedded MQTT broker for local development (S9).
 *
 *   TCP       1883  ESP8266 firmware, Android (Paho)
 *   WebSocket 9001  the twin in the browser / Electron (mqtt.js)
 *
 * Run: npm run broker
 * Override ports with BROKER_TCP_PORT / BROKER_WS_PORT.
 * No authentication: clients may send credentials, they are accepted as-is.
 */

import { createServer as createTcpServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { Aedes } from "aedes";
import { WebSocketServer } from "ws";

export const DEFAULT_TCP_PORT = 1883;
export const DEFAULT_WS_PORT = 9001;

/**
 * Wrap a WebSocket as a byte stream for aedes, pushing at most one chunk per tick.
 *
 * mqtt.js sends each piece of a packet as its own WS frame, so several frames can
 * arrive in one tick. On Node 26 a `read()` after several synchronous `push()`es
 * returns only the first chunk and no further 'readable' fires, which stalls
 * aedes (it reads once per 'readable'). Coalescing frames per tick avoids it.
 */
function wsToStream(socket) {
  let pending = [];
  const stream = new Duplex({
    read() {},
    write(chunk, _encoding, cb) {
      socket.send(chunk, cb);
    },
    final(cb) {
      socket.close();
      cb();
    },
  });
  socket.on("message", (data) => {
    pending.push(data);
    if (pending.length > 1) return;
    setImmediate(() => {
      const chunk = Buffer.concat(pending);
      pending = [];
      stream.push(chunk);
    });
  });
  socket.on("close", () => setImmediate(() => stream.push(null)));
  socket.on("error", (err) => stream.destroy(err));
  return stream;
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Start the broker. Port 0 picks a free port (used by tests).
 * Resolves with the bound ports and a `close()` that tears everything down.
 */
export async function startBroker({
  tcpPort = DEFAULT_TCP_PORT,
  wsPort = DEFAULT_WS_PORT,
  host = "0.0.0.0",
  log = console.log,
} = {}) {
  const aedes = await Aedes.createBroker();

  const tcpServer = createTcpServer(aedes.handle);
  const httpServer = createHttpServer();
  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (socket, req) => aedes.handle(wsToStream(socket), req));

  aedes.on("client", (client) => log(`[broker] client connected: ${client.id}`));
  aedes.on("clientDisconnect", (client) => log(`[broker] client disconnected: ${client.id}`));
  aedes.on("clientError", (client, err) => log(`[broker] client ${client.id} error: ${err.message}`));

  const boundTcp = await listen(tcpServer, tcpPort, host);
  const boundWs = await listen(httpServer, wsPort, host);

  async function close() {
    for (const socket of wss.clients) socket.terminate();
    await new Promise((resolve) => wss.close(() => resolve()));
    await Promise.all([closeServer(tcpServer), closeServer(httpServer)]);
    await new Promise((resolve) => aedes.close(() => resolve()));
  }

  return { tcpPort: boundTcp, wsPort: boundWs, close };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const broker = await startBroker({
    tcpPort: Number(process.env.BROKER_TCP_PORT ?? DEFAULT_TCP_PORT),
    wsPort: Number(process.env.BROKER_WS_PORT ?? DEFAULT_WS_PORT),
  });
  console.log(`[broker] MQTT tcp://0.0.0.0:${broker.tcpPort}  ws://0.0.0.0:${broker.wsPort}`);
  const shutdown = async () => {
    await broker.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
