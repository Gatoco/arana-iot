/**
 * npm run desktop:shots: render the production desktop build (dist-desktop/) at 1280x800 and
 * write docs/screenshots/{hero,front,top,side}.png. Prints renderer stats per shot.
 *
 * Needs a display; on a headless host it re-runs itself under `xvfb-run -a`.
 * Build first: npm run desktop:build.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.resolve(root, process.env.ARANA_SHOTS ?? "docs/screenshots");

if (!existsSync(path.join(root, "dist-desktop", "index.html"))) {
  console.error("dist-desktop/ is missing: run `npm run desktop:build` first.");
  process.exit(1);
}

const headless = process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
const hasXvfb = spawnSync("sh", ["-c", "command -v xvfb-run"]).status === 0;
if (headless && !hasXvfb) {
  console.error("No display and no xvfb-run: install xvfb or run from a desktop session.");
  process.exit(1);
}

const electron = createRequire(import.meta.url)("electron");
const args = [electron, root, "--force-device-scale-factor=1"];
// Xvfb has no GPU/GLX: render WebGL with Chromium's bundled SwiftShader (software).
if (headless) args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist");
const cmd = headless ? "xvfb-run" : args.shift();
const cmdArgs = headless ? ["-a", "-s", "-screen 0 1920x1080x24", ...args] : args;

const child = spawn(cmd, cmdArgs, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ARANA_SHOTS: outDir, ELECTRON_START_URL: "" },
});
child.on("error", (err) => {
  console.error(`could not start ${cmd}: ${err.message}`);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
