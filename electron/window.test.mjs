/**
 * S1: the desktop shell opens a frameless, black, 1280x800 window.
 */

import { test, expect } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { WINDOW_OPTIONS } = require("./window.cjs");

test("S1: frameless black 1280x800 window with a locked-down renderer", () => {
  expect(WINDOW_OPTIONS.width).toBe(1280);
  expect(WINDOW_OPTIONS.height).toBe(800);
  expect(WINDOW_OPTIONS.frame).toBe(false);
  expect(WINDOW_OPTIONS.backgroundColor).toBe("#000000");
  expect(WINDOW_OPTIONS.webPreferences).toMatchObject({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  });
});
