/**
 * S1 / S13: the desktop shell opens a frameless 1280x800 window with a locked-down renderer,
 * restores its bounds onto visible displays, and exposes only window controls.
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { WINDOW_OPTIONS, windowOptions, clampWindowBounds, isExternalHttp, CSP } = require("./window.cjs");

test("S1/S13: frameless 1280x800 (min 960x640) window with a locked-down renderer", () => {
  expect(WINDOW_OPTIONS.width).toBe(1280);
  expect(WINDOW_OPTIONS.height).toBe(800);
  expect(WINDOW_OPTIONS.minWidth).toBe(960);
  expect(WINDOW_OPTIONS.minHeight).toBe(640);
  expect(WINDOW_OPTIONS.frame).toBe(false);
  expect(WINDOW_OPTIONS.backgroundColor).toBe("#05070a");
  expect(WINDOW_OPTIONS.webPreferences).toMatchObject({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    webviewTag: false,
    allowRunningInsecureContent: false,
  });
  expect(windowOptions("/abs/preload.cjs").webPreferences.preload).toBe("/abs/preload.cjs");
});

const DISPLAYS = [
  { x: 0, y: 0, width: 1920, height: 1050 },
  { x: 1920, y: 0, width: 1280, height: 1000 },
];

test("saved bounds on a visible display are kept", () => {
  const b = { x: 100, y: 80, width: 1280, height: 800 };
  expect(clampWindowBounds(b, DISPLAYS)).toEqual(b);
  expect(clampWindowBounds({ x: 2000, y: 50, width: 1000, height: 700 }, DISPLAYS)).toEqual({ x: 2000, y: 50, width: 1000, height: 700 });
});

test("bounds of an unplugged monitor are pulled back on screen", () => {
  const b = clampWindowBounds({ x: 5000, y: 3000, width: 1280, height: 800 }, DISPLAYS);
  expect(b.x).toBeUndefined();
  expect(b.width).toBe(1280);
  const partly = clampWindowBounds({ x: 1500, y: 900, width: 1280, height: 800 }, DISPLAYS);
  expect(partly.x + partly.width).toBeLessThanOrEqual(1920 + 1280);
  expect(partly.y + partly.height).toBeLessThanOrEqual(1050);
});

test("garbage state falls back to defaults and never shrinks below the minimum", () => {
  expect(clampWindowBounds(null, DISPLAYS)).toEqual({ width: 1280, height: 800 });
  expect(clampWindowBounds({ x: 0, y: 0, width: 10, height: "x" }, DISPLAYS)).toMatchObject({ width: 960, height: 800 });
  expect(clampWindowBounds({ width: 1280, height: 800 }, [])).toEqual({ width: 1280, height: 800 });
});

test("only http(s) links leave the app", () => {
  expect(isExternalHttp("https://lafvin-quadruped-spider-robot.readthedocs.io")).toBe(true);
  expect(isExternalHttp("file:///etc/passwd")).toBe(false);
  expect(isExternalHttp("javascript:alert(1)")).toBe(false);
});

test("CSP forbids eval and foreign scripts but allows broker websockets", () => {
  expect(CSP).toContain("script-src 'self'");
  expect(CSP).not.toContain("unsafe-eval");
  expect(CSP).toContain("connect-src 'self' ws: wss:");
  expect(CSP).toContain("object-src 'none'");
});

test("preload exposes only the window-control API, never ipcRenderer", () => {
  const src = readFileSync(new URL("./preload.cjs", import.meta.url), "utf8");
  expect(src).toContain('exposeInMainWorld("desktop"');
  for (const key of ["platform", "minimize", "toggleMaximize", "close", "isMaximized", "onMaximizedChange"]) {
    expect(src).toContain(`${key}:`);
  }
  expect(src).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/);
  expect(src).not.toMatch(/ipcRenderer:\s*ipcRenderer/);
  expect(src.match(/ipcRenderer\.invoke\("([^"]+)"/g)).toHaveLength(4);
});
