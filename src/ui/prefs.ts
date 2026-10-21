/**
 * Per-viewer UI preferences in localStorage under a versioned key. Every access is guarded:
 * storage can be missing or throw (private windows, blocked site data), and the app must
 * render the same without it. Passwords are never stored.
 */

import { CAMERA_MODE, DEFAULT_VIEW_OPTIONS, type CameraMode, type ViewOptions } from "../scene/SpiderView";

export const PREFS_KEY = "arana.prefs.v1";

export interface Prefs {
  camera: CameraMode;
  /** The operator picked a camera at least once: never auto-switch to follow again. */
  cameraChosen: boolean;
  panelWidth: number;
  view: ViewOptions;
  showStats: boolean;
  keyHint: boolean;
  brokerUrl: string;
  username: string;
  throttle: number;
}

export const DEFAULT_PREFS: Prefs = {
  camera: CAMERA_MODE.HERO,
  cameraChosen: false,
  panelWidth: 320,
  view: DEFAULT_VIEW_OPTIONS,
  showStats: false,
  keyHint: true,
  brokerUrl: "ws://localhost:9001/mqtt",
  username: "",
  throttle: 0.7,
};

export const PANEL_MIN = 300;
export const PANEL_MAX = 380;

export function parsePrefs(raw: string | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const p = JSON.parse(raw) as Partial<Prefs>;
    const cameras = Object.values(CAMERA_MODE) as string[];
    return {
      ...DEFAULT_PREFS,
      ...p,
      camera: cameras.includes(p.camera as string) ? (p.camera as CameraMode) : DEFAULT_PREFS.camera,
      panelWidth: Math.min(PANEL_MAX, Math.max(PANEL_MIN, Number(p.panelWidth) || DEFAULT_PREFS.panelWidth)),
      view: { ...DEFAULT_VIEW_OPTIONS, ...(p.view ?? {}) },
      throttle: Math.min(1, Math.max(0, Number(p.throttle ?? DEFAULT_PREFS.throttle))),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function loadPrefs(): Prefs {
  try {
    return parsePrefs(window.localStorage.getItem(PREFS_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: preferences stay in memory */
  }
}
