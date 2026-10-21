/**
 * Electron shell for the twin. The web build stays the source of truth:
 *   - dev:   loads ELECTRON_START_URL (the Vite dev server, see scripts/desktop.mjs)
 *   - build: loads dist-desktop/index.html (npm run desktop:build), fully offline
 *   - shots: ARANA_SHOTS=<dir> renders the production build and writes the four PNGs
 *            (scripts/shots.mjs), then quits
 */

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, Menu, ipcMain, screen, session, shell } = require("electron");
const { windowOptions, clampWindowBounds, isExternalHttp, CSP } = require("./window.cjs");

const DEV_URL = process.env.ELECTRON_START_URL;
const SHOTS_DIR = process.env.ARANA_SHOTS;
const INDEX = path.join(__dirname, "..", "dist-desktop", "index.html");
const PRELOAD = path.join(__dirname, "preload.cjs");

/** @type {BrowserWindow | null} */
let mainWindow = null;

app.setName("Arana IoT");
app.setAboutPanelOptions?.({
  applicationName: "Arana IoT",
  applicationVersion: app.getVersion(),
  credits: "Digital twin and test bench for the LAFVIN LA072 quadruped.",
});
Menu.setApplicationMenu(null);

// A second launch focuses the running window instead of opening another twin.
if (!SHOTS_DIR && !app.requestSingleInstanceLock()) {
  app.quit();
}

function stateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

/** Window size for screenshot runs: 1280x800 unless ARANA_SHOTS_SIZE=WxH (layout checks). */
function shotSize() {
  const m = /^(\d+)x(\d+)$/.exec(process.env.ARANA_SHOTS_SIZE ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1280, height: 800 };
}

function loadBounds() {
  if (SHOTS_DIR) return shotSize();
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    const displays = screen.getAllDisplays().map((d) => d.workArea);
    return { ...clampWindowBounds(saved, displays), maximized: Boolean(saved.maximized) };
  } catch {
    return { width: 1280, height: 800 };
  }
}

function saveBounds(win) {
  if (SHOTS_DIR || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch (err) {
    console.warn("[arana] could not save window state:", err.message);
  }
}

function appUrl() {
  if (DEV_URL) return DEV_URL;
  const url = pathToFileURL(INDEX);
  if (SHOTS_DIR) url.search = "?shots=1";
  return url.toString();
}

/** Only the main window may drive window controls. */
function fromMainWindow(event) {
  return mainWindow !== null && event.sender === mainWindow.webContents;
}

function registerIpc() {
  ipcMain.handle("window:minimize", (e) => {
    if (fromMainWindow(e)) mainWindow.minimize();
  });
  ipcMain.handle("window:toggle-maximize", (e) => {
    if (!fromMainWindow(e)) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("window:close", (e) => {
    if (fromMainWindow(e)) mainWindow.close();
  });
  ipcMain.handle("window:is-maximized", (e) => (fromMainWindow(e) ? mainWindow.isMaximized() : false));
}

function createWindow() {
  const bounds = loadBounds();
  const win = new BrowserWindow(windowOptions(PRELOAD, bounds));
  mainWindow = win;
  if (bounds.maximized) win.maximize();
  win.once("ready-to-show", () => {
    if (!SHOTS_DIR || !process.env.ARANA_SHOTS_HIDDEN) win.show();
  });

  const notify = () => win.webContents.send("window:maximized-changed", win.isMaximized());
  win.on("maximize", notify);
  win.on("unmaximize", notify);
  win.on("close", () => saveBounds(win));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.on("unresponsive", () => console.warn("[arana] window unresponsive"));
  win.webContents.on("render-process-gone", (_e, details) => {
    console.error("[arana] renderer gone:", details.reason, details.exitCode);
  });
  win.webContents.on("console-message", (event) => {
    if (event.level === "error" || event.level === "warning") console.error(`[renderer:${event.level}]`, event.message);
  });

  // Links never open new windows; http(s) goes to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttp(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url === win.webContents.getURL()) return;
    event.preventDefault();
    if (isExternalHttp(url) && !(DEV_URL && url.startsWith(DEV_URL))) shell.openExternal(url);
  });

  // Keys: F11 fullscreen always; devtools only in dev.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (DEV_URL && (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i"))) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.loadURL(appUrl());
  if (SHOTS_DIR) win.webContents.once("did-finish-load", () => captureShots(win).catch(fail));
  return win;
}

const SHOTS = [
  ["hero", "hero"],
  ["front", "front"],
  ["top", "top"],
  ["side", "side"],
];

async function captureShots(win) {
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const started = Date.now();
  while (!(await js("Boolean(window.__arana)"))) {
    if (Date.now() - started > 20000) throw new Error("renderer never exposed window.__arana");
    await new Promise((r) => setTimeout(r, 100));
  }
  await js("window.__arana.ready()");
  // Let the sim settle into its neutral stance and the fps meter fill.
  await new Promise((r) => setTimeout(r, 1500));
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  for (const [name, mode] of SHOTS) {
    await js(`window.__arana.setCamera(${JSON.stringify(mode)})`);
    await new Promise((r) => setTimeout(r, 400));
    const image = await win.webContents.capturePage();
    const file = path.join(SHOTS_DIR, `${name}.png`);
    fs.writeFileSync(file, image.toPNG());
    const size = image.getSize();
    const stats = await js("window.__arana.stats()");
    console.log(
      `[shots] ${file} ${size.width}x${size.height} fps=${stats.fps.toFixed(1)} calls=${stats.calls} triangles=${stats.triangles}`,
    );
  }
  if (process.env.ARANA_SHOTS_EXTRA === "1") await captureMotion(win, js);
  app.exit(0);
}

/** Optional motion evidence: walking (follow camera), then two firmware actions. */
async function captureMotion(win, js) {
  const shot = async (name) => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS_DIR, `${name}.png`), image.toPNG());
    console.log(`[shots] ${path.join(SHOTS_DIR, `${name}.png`)}`);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await js('window.__arana.setCamera("follow")');
  await js('window.__arana.command({ kind: "move", forward: 1, turn: 0.3 })');
  await wait(4000);
  await shot("walk");
  await js('window.__arana.setCamera("hero")');
  await js('window.__arana.command({ kind: "pose", pose: "hello" })');
  await wait(1900);
  await shot("greet");
  await js('window.__arana.command({ kind: "pose", pose: "lie" })');
  await wait(1200);
  await shot("lie");
}

function fail(err) {
  console.error("[shots] failed:", err.message);
  app.exit(1);
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  // file:// pages carry the CSP as a <meta> tag (vite.config.ts, desktop build); this header
  // covers any http(s) response the packaged app might load.
  if (!DEV_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
    });
  }
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
