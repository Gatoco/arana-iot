/**
 * Desktop window options (S1, S13) and window-state helpers. Kept free of Electron imports
 * so tests can read them.
 */

const MIN_WIDTH = 960;
const MIN_HEIGHT = 640;
const DEFAULT_BOUNDS = { width: 1280, height: 800 };

/** BrowserWindow options. `preload` is an absolute path, `bounds` an optional saved state. */
function windowOptions(preload, bounds) {
  return {
    width: bounds?.width ?? DEFAULT_BOUNDS.width,
    height: bounds?.height ?? DEFAULT_BOUNDS.height,
    ...(bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y) ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    resizable: true,
    frame: false,
    backgroundColor: "#05070a",
    autoHideMenuBar: true,
    show: false,
    title: "Arana IoT",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  };
}

/** Kept for the S1 test and callers that only need the static shape. */
const WINDOW_OPTIONS = windowOptions(undefined, undefined);

/**
 * Fit saved bounds onto the current displays. `displays` are workArea rectangles. Returns
 * size-only bounds (centered by Electron) when the saved window would be mostly off-screen,
 * e.g. after a monitor was unplugged.
 */
function clampWindowBounds(bounds, displays) {
  if (!bounds || !Array.isArray(displays) || displays.length === 0) return { ...DEFAULT_BOUNDS };
  const width = clampNum(bounds.width, MIN_WIDTH, Infinity, DEFAULT_BOUNDS.width);
  const height = clampNum(bounds.height, MIN_HEIGHT, Infinity, DEFAULT_BOUNDS.height);
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
    return fitSize({ width, height }, largest(displays));
  }
  // Pick the display that holds the window's center, else the one with the most overlap.
  const cx = bounds.x + width / 2;
  const cy = bounds.y + height / 2;
  let target = displays.find((d) => cx >= d.x && cx < d.x + d.width && cy >= d.y && cy < d.y + d.height);
  if (!target) {
    let best = 0;
    for (const d of displays) {
      const ox = Math.max(0, Math.min(bounds.x + width, d.x + d.width) - Math.max(bounds.x, d.x));
      const oy = Math.max(0, Math.min(bounds.y + height, d.y + d.height) - Math.max(bounds.y, d.y));
      if (ox * oy > best) {
        best = ox * oy;
        target = d;
      }
    }
  }
  if (!target) return fitSize({ width, height }, largest(displays));
  const fitted = fitSize({ width, height }, target);
  return {
    width: fitted.width,
    height: fitted.height,
    x: Math.round(Math.min(Math.max(bounds.x, target.x), target.x + target.width - fitted.width)),
    y: Math.round(Math.min(Math.max(bounds.y, target.y), target.y + target.height - fitted.height)),
  };
}

function fitSize(size, display) {
  return {
    width: Math.round(Math.min(size.width, Math.max(MIN_WIDTH, display.width))),
    height: Math.round(Math.min(size.height, Math.max(MIN_HEIGHT, display.height))),
  };
}

function largest(displays) {
  return displays.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Content-Security-Policy for the packaged app. connect-src allows ws:/wss: because the
 * operator types the broker address (LAN, Tailscale or tunnel); a fixed host list would
 * block the T420 broker. No 'unsafe-eval'; inline styles only (React style props).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** The same policy for a <meta> tag: frame-ancestors is only honored as a header. */
const CSP_META = CSP.split("; ")
  .filter((d) => !d.startsWith("frame-ancestors"))
  .join("; ");

/** Only http(s) leaves the app, and only to the system browser. */
function isExternalHttp(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = {
  WINDOW_OPTIONS,
  windowOptions,
  clampWindowBounds,
  isExternalHttp,
  CSP,
  CSP_META,
  MIN_WIDTH,
  MIN_HEIGHT,
};
