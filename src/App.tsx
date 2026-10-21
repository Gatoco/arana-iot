import { useCallback, useEffect, useRef, useState } from "react";
import { Viewport } from "./scene/Viewport";
import { CAMERA_MODE, type CameraMode, type SpiderView, type ViewOptions } from "./scene/SpiderView";
import { cn } from "./lib/cn";
import { TwinRuntime } from "./runtime/TwinRuntime";
import { useTwin } from "./runtime/useTwin";
import { GAIT, type Command, type Gait, type PoseName } from "./protocol";
import { TRANSPORT_KIND, type TransportAuth } from "./net/transport";
import { TitleBar } from "./ui/TitleBar";
import { StatusBar } from "./ui/StatusBar";
import { Hud } from "./ui/Hud";
import { Section } from "./ui/controls";
import { LinkPanel, type LinkConfig } from "./ui/LinkPanel";
import { DrivePanel } from "./ui/DrivePanel";
import { ActionsPanel } from "./ui/ActionsPanel";
import { ServoPanel } from "./ui/ServoPanel";
import { TelemetryPanel } from "./ui/TelemetryPanel";
import { DebugPanel } from "./ui/DebugPanel";
import { IconClose, IconPanel } from "./ui/icons";
import { applyThrottle, DRIVE_KEYS, keysToMove } from "./ui/joystickMath";
import { DEFAULT_PREFS, loadPrefs, savePrefs, PANEL_MAX, PANEL_MIN, type Prefs } from "./ui/prefs";

const CAMERAS: { mode: CameraMode; label: string; key?: string }[] = [
  { mode: CAMERA_MODE.HERO, label: "Hero" },
  { mode: CAMERA_MODE.ORBIT, label: "Orbit", key: "O" },
  { mode: CAMERA_MODE.FOLLOW, label: "Follow", key: "F" },
  { mode: CAMERA_MODE.FRONT, label: "Front" },
  { mode: CAMERA_MODE.TOP, label: "Top" },
  { mode: CAMERA_MODE.SIDE, label: "Side" },
];

const KEYS_HELP: [string, string][] = [
  ["W / S", "forward / back"],
  ["A / D", "turn left / right"],
  ["Shift", "hold for 100 % throttle"],
  ["Space", "stop (cancels actions)"],
  ["1 / 2 / 3", "tetrapod / wave / rest"],
  ["F / O", "follow / orbit camera"],
  ["R", "reset pose and position"],
  ["?", "this help"],
];

const SHOTS = typeof location !== "undefined" && new URLSearchParams(location.search).has("shots");
/** Below this window width the control panel becomes an overlay drawer. */
const DRAWER_BREAKPOINT = 1100;

export default function App() {
  const [runtime] = useState(() => new TwinRuntime());
  const snap = useTwin(runtime);
  // Screenshot runs are deterministic: defaults only, nothing read from or written to storage.
  const [prefs, setPrefs] = useState<Prefs>(() => (SHOTS ? { ...DEFAULT_PREFS, keyHint: false } : loadPrefs()));
  const [link, setLink] = useState<LinkConfig>(() => ({
    kind: TRANSPORT_KIND.LOOPBACK,
    url: prefs.brokerUrl,
    username: prefs.username,
    password: "",
  }));
  const [view, setView] = useState<SpiderView | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [stats, setStats] = useState({ calls: 0, triangles: 0 });
  const [help, setHelp] = useState(false);
  const [narrow, setNarrow] = useState(() => window.innerWidth < DRAWER_BREAKPOINT);
  const [drawer, setDrawer] = useState(false);
  const pressed = useRef(new Set<string>());
  const boost = useRef(false);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      if (!SHOTS) savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    runtime.start();
    return () => runtime.stop();
  }, [runtime]);

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < DRAWER_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Render stats come from the renderer, polled at 2 Hz (not per frame).
  useEffect(() => {
    if (!view) return;
    const id = setInterval(() => {
      const s = view.getStats();
      setFps(s.fps || null);
      setStats({ calls: s.calls, triangles: s.triangles });
    }, 500);
    return () => clearInterval(id);
  }, [view]);

  // Screenshot hooks for scripts/shots.mjs (only with ?shots).
  useEffect(() => {
    if (!SHOTS || !view) return;
    const api = {
      async setCamera(mode: CameraMode) {
        // Same path as a click: React state drives the view.
        update({ camera: mode, cameraChosen: true });
        await new Promise((r) => setTimeout(r, 50));
        view.snapCameraNow();
        await view.framesRendered(4);
      },
      /** Apply a protocol command, exactly as the UI or the broker would. */
      command: (cmd: Command) => runtime.command(cmd),
      stats: () => view.getStats(),
      describe: () => view.describe(),
      ready: () => view.framesRendered(30),
    };
    (window as unknown as { __arana?: typeof api }).__arana = api;
  }, [view, update, runtime]);

  const chooseCamera = useCallback(
    (mode: CameraMode) => update({ camera: mode, cameraChosen: true }),
    [update],
  );

  const drive = useCallback(
    (forward: number, turn: number) => {
      const t = applyThrottle({ forward, turn }, boost.current ? 1 : prefs.throttle);
      runtime.move(t.forward, t.turn);
      if (!prefs.cameraChosen && (forward !== 0 || turn !== 0) && prefs.camera !== CAMERA_MODE.FOLLOW) {
        // First drive without a camera choice: follow once, then never fight the user.
        update({ camera: CAMERA_MODE.FOLLOW, cameraChosen: true });
      }
    },
    [runtime, prefs.throttle, prefs.cameraChosen, prefs.camera, update],
  );

  const stop = useCallback(() => runtime.stopBody(), [runtime]);

  // Keyboard: never while typing in a field.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    };
    const sendKeys = () => {
      const m = keysToMove(pressed.current);
      if (m.forward === 0 && m.turn === 0) stop();
      else drive(m.forward, m.turn);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "shift") {
        boost.current = true;
        if (pressed.current.size) sendKeys();
        return;
      }
      if ((DRIVE_KEYS as readonly string[]).includes(k)) {
        if (snap.servoTest) return;
        e.preventDefault();
        if (!pressed.current.has(k)) {
          pressed.current.add(k);
          sendKeys();
        }
        return;
      }
      if (e.repeat) return;
      if (k === " ") {
        e.preventDefault();
        pressed.current.clear();
        stop();
      } else if (k === "1") runtime.setGait(GAIT.TETRAPOD);
      else if (k === "2") runtime.setGait(GAIT.WAVE);
      else if (k === "3") runtime.setGait(GAIT.REST);
      else if (k === "f") chooseCamera(CAMERA_MODE.FOLLOW);
      else if (k === "o") chooseCamera(CAMERA_MODE.ORBIT);
      else if (k === "r") runtime.resetPose();
      else if (k === "?") setHelp((h) => !h);
      else if (k === "escape") setHelp(false);
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "shift") {
        boost.current = false;
        if (pressed.current.size) sendKeys();
        return;
      }
      if (pressed.current.delete(k)) sendKeys();
    };
    const blur = () => {
      if (pressed.current.size) {
        pressed.current.clear();
        stop();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    // Held keys repeat the move at 5 Hz so the 5 s manual timeout never trips mid-drive.
    const repeat = setInterval(() => pressed.current.size && sendKeys(), 200);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      clearInterval(repeat);
    };
  }, [runtime, drive, stop, chooseCamera, snap.servoTest]);

  function applyLink(next: LinkConfig): void {
    setLink(next);
    update({ brokerUrl: next.url, username: next.username });
    const auth: TransportAuth | undefined =
      next.username || next.password ? { username: next.username, password: next.password } : undefined;
    runtime.reconnect(next.kind, next.url, auth);
  }

  const setViewOptions = (patch: Partial<ViewOptions>) => update({ view: { ...prefs.view, ...patch } });
  const testing = snap.servoTest;
  const showPanel = !narrow || drawer;

  const panel = (
    <aside
      aria-label="Controls"
      className={cn(
        "flex min-h-0 shrink-0 flex-col overflow-y-auto border-l border-edge bg-panel",
        narrow && "absolute inset-y-0 right-0 z-20 shadow-[-8px_0_24px_rgba(0,0,0,0.5)]",
      )}
      style={{ width: prefs.panelWidth }}
    >
      {narrow && (
        <div className="flex h-8 items-center justify-between border-b border-edge px-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Controls</span>
          <button type="button" aria-label="Close controls" title="Close controls" className="text-muted hover:text-ink" onClick={() => setDrawer(false)}>
            <IconClose />
          </button>
        </div>
      )}
      <Section title="Link">
        <LinkPanel link={link} transport={snap.transport} onChange={setLink} onApply={applyLink} />
      </Section>
      <Section title="Drive">
        <DrivePanel
          gait={snap.state.gait as Gait}
          throttle={prefs.throttle}
          disabled={testing}
          onMove={drive}
          onRelease={stop}
          onGait={(g) => runtime.setGait(g)}
          onStop={stop}
          onThrottle={(throttle) => update({ throttle })}
        />
      </Section>
      <Section title="Gait & actions">
        <ActionsPanel
          running={snap.state.action}
          progress={snap.state.actionProgress}
          holding={snap.state.controller === "hold"}
          disabled={testing}
          onPick={(p: PoseName) => runtime.pose(p)}
        />
      </Section>
      <Section title="Servo test">
        <ServoPanel
          joints={snap.joints}
          testing={testing}
          targets={snap.servoTargets}
          onTest={(on) => runtime.setServoTest(on)}
          onApply={(deg) => runtime.setServoTargets(deg)}
        />
      </Section>
      <Section title="Telemetry">
        <TelemetryPanel snap={snap} fps={fps} />
      </Section>
      <Section title="Debug" defaultOpen={false}>
        <DebugPanel
          view={prefs.view}
          showStats={prefs.showStats}
          packets={snap.packets}
          onView={setViewOptions}
          onStats={(showStats) => update({ showStats })}
          onResetCamera={() => {
            update({ camera: CAMERA_MODE.HERO });
            view?.snapCameraNow();
          }}
          onLogTelemetry={(v) => runtime.setLogTelemetry(v)}
          onClear={() => runtime.clearPackets()}
          onDescribe={() => view?.describe() ?? []}
        />
      </Section>
    </aside>
  );

  return (
    <div className="flex h-full flex-col bg-bg">
      <TitleBar transport={snap.transport} />
      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          <Viewport runtime={runtime} cameraMode={prefs.camera} options={prefs.view} onView={setView} />
          <div className="pointer-events-none absolute inset-0 p-3">
            <div className="pointer-events-auto absolute left-3 top-3 w-56">
              <Hud telemetry={snap.telemetry} />
            </div>
            <div className="pointer-events-auto absolute right-3 top-3 flex gap-1">
              <div role="radiogroup" aria-label="Camera" className="flex rounded-md border border-edge bg-bg/85 p-0.5">
                {CAMERAS.map((c) => (
                  <button
                    key={c.mode}
                    type="button"
                    role="radio"
                    aria-checked={prefs.camera === c.mode}
                    title={c.key ? `${c.label} camera (${c.key})` : `${c.label} camera`}
                    onClick={() => chooseCamera(c.mode)}
                    className={cn(
                      "h-6 rounded-[4px] px-2 text-[11px]",
                      prefs.camera === c.mode ? "bg-raised text-accent" : "text-muted hover:text-ink",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {narrow && !drawer && (
                <button
                  type="button"
                  aria-label="Open controls"
                  title="Open controls"
                  onClick={() => setDrawer(true)}
                  className="flex h-7 w-8 items-center justify-center rounded-md border border-edge bg-bg/85 text-muted hover:text-ink"
                >
                  <IconPanel />
                </button>
              )}
            </div>
            {prefs.keyHint && (
              <div className="pointer-events-auto absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-edge/80 bg-bg/80 px-2 py-1 text-[11px] text-muted">
                <span>
                  <kbd className="font-mono text-ink">WASD</kbd> drive · <kbd className="font-mono text-ink">Space</kbd> stop ·{" "}
                  <kbd className="font-mono text-ink">F</kbd> follow · <kbd className="font-mono text-ink">R</kbd> reset ·{" "}
                  <button type="button" className="text-ink underline-offset-2 hover:underline" onClick={() => setHelp(true)}>
                    ? keys
                  </button>
                </span>
                <button type="button" aria-label="Dismiss keyboard hint" title="Dismiss" className="hover:text-ink" onClick={() => update({ keyHint: false })}>
                  <IconClose />
                </button>
              </div>
            )}
            {prefs.showStats && (
              <div className="absolute bottom-3 right-3 rounded-md border border-edge/80 bg-bg/80 px-2 py-1 font-mono text-[10px] text-muted">
                {fps == null ? "—" : fps.toFixed(0)} fps · {stats.calls} calls · {(stats.triangles / 1000).toFixed(1)}k tris
              </div>
            )}
            {help && (
              <div
                role="dialog"
                aria-label="Keyboard shortcuts"
                className="pointer-events-auto absolute left-1/2 top-1/2 w-72 -translate-x-1/2 -translate-y-1/2 rounded-md border border-edge bg-panel p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Keyboard</span>
                  <button type="button" aria-label="Close help" className="text-muted hover:text-ink" onClick={() => setHelp(false)}>
                    <IconClose />
                  </button>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                  {KEYS_HELP.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="font-mono text-ink">{k}</dt>
                      <dd className="text-muted">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </main>
        {!narrow && <PanelResizer width={prefs.panelWidth} onWidth={(panelWidth) => update({ panelWidth })} />}
        {showPanel && panel}
      </div>
      <StatusBar snap={snap} fps={fps} />
    </div>
  );
}

/** 4 px drag handle (also keyboard: arrows) to resize the panel between 300 and 380 px. */
function PanelResizer({ width, onWidth }: { width: number; onWidth: (w: number) => void }) {
  const clampW = (w: number) => Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, w)));
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize control panel"
      aria-valuemin={PANEL_MIN}
      aria-valuemax={PANEL_MAX}
      aria-valuenow={width}
      tabIndex={0}
      className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-accent/30 focus-visible:bg-accent/40"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onWidth(clampW(width + 10));
        if (e.key === "ArrowRight") onWidth(clampW(width - 10));
      }}
      onPointerDown={(e) => {
        const startX = e.clientX;
        const startW = width;
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => onWidth(clampW(startW + (startX - ev.clientX)));
        const up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
      }}
    />
  );
}
