/**
 * npm run desktop: start the Vite dev server, then open it in Electron.
 * Closing the window stops both.
 */

import { spawn } from "node:child_process";

const PORT = Number(process.env.DESKTOP_PORT ?? 5173);
const URL = `http://localhost:${PORT}`;

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { stdio: "inherit" });

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Vite did not start on ${URL}`);
}

try {
  await waitForServer();
} catch (err) {
  console.error(err.message);
  vite.kill();
  process.exit(1);
}

const electron = spawn("npx", ["electron", "."], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_START_URL: URL },
});

electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    electron.kill();
    vite.kill();
  });
}
