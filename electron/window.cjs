/**
 * Desktop window options (S1). Kept free of Electron imports so tests can read them.
 */

const WINDOW_OPTIONS = {
  width: 1280,
  height: 800,
  frame: false,
  backgroundColor: "#000000",
  autoHideMenuBar: true,
  show: false,
  title: "Arana IoT",
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  },
};

module.exports = { WINDOW_OPTIONS };
