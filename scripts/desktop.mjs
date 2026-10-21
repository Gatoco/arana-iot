/**
 * npm run desktop: start the Vite dev server, then open it in Electron.
 * Closing the window, Ctrl+C or a child crash stops both (no orphan processes).
 */

import { spawn } from "node:child_process";

const PORT = Number(process.env.DESKTOP_PORT ?? 5173);
const URL = `http://localhost:${PORT}`;
const children = new Set();
let exiting = false;

function run(cmd, args, options) {
  const child = spawn(cmd, args, { stdio: "inherit", ...options });
  children.add(child);
  child.on("exit", () => children.delete(child));
  child.on("error", (err) => {
    console.error(`${cmd} failed to start: ${err.message}`);
    shutdown(1);
  });
  return child;
}

function shutdown(code) {
  if (exiting) return;
  exiting = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => {
    for (const c of children) c.kill("SIGKILL");
    process.exit(code);
  }, 1500).unref();
  if (children.size === 0) process.exit(code);
  for (const c of children) c.on("exit", () => children.size === 0 && process.exit(code));
}

const vite = run("npx", ["vite", "--port", String(PORT), "--strictPort"]);
vite.on("exit", (code) => !exiting && shutdown(code ?? 1));

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
  shutdown(1);
}

if (!exiting) {
  const electron = run("npx", ["electron", "."], { env: { ...process.env, ELECTRON_START_URL: URL } });
  electron.on("exit", (code) => shutdown(code ?? 0));
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => shutdown(0));
