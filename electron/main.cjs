/**
 * Electron shell for the twin. The web build stays the source of truth:
 *   - dev:   loads ELECTRON_START_URL (the Vite dev server, see scripts/desktop.mjs)
 *   - build: loads dist-desktop/index.html (npm run desktop:build)
 */

const path = require("node:path");
const { app, BrowserWindow, Menu, shell } = require("electron");
const { WINDOW_OPTIONS } = require("./window.cjs");

function createWindow() {
  const win = new BrowserWindow(WINDOW_OPTIONS);
  win.once("ready-to-show", () => win.show());

  // Links that try to open new windows go to the system browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, "..", "dist-desktop", "index.html"));
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
