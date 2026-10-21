import { useEffect, useRef, useState } from "react";
import { Viewport } from "./scene/Viewport";
import { CAMERA_MODE, type CameraMode } from "./scene/SpiderView";
import { Hud } from "./ui/Hud";
import { cn } from "./lib/cn";
import { Joystick } from "./ui/Joystick";
import { GaitButtons, ServoBar, TelemetryPanel } from "./ui/TelemetryPanel";
import { TwinRuntime } from "./runtime/TwinRuntime";
import { useTwin } from "./runtime/useTwin";
import { TOPIC, type Gait } from "./protocol";
import { TRANSPORT_KIND, type TransportAuth, type TransportKind } from "./net/transport";

const BROKER_DEFAULT = "ws://localhost:9001";

interface LinkConfig {
  kind: TransportKind;
  url: string;
  username: string;
  password: string;
}

export default function App() {
  const runtimeRef = useRef<TwinRuntime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = new TwinRuntime();
  const runtime = runtimeRef.current;

  const snap = useTwin(runtime);
  const [cameraMode, setCameraMode] = useState<CameraMode>(CAMERA_MODE.FOLLOW);
  const [link, setLink] = useState<LinkConfig>({
    kind: TRANSPORT_KIND.LOOPBACK,
    url: BROKER_DEFAULT,
    username: "arana",
    password: "",
  });

  useEffect(() => {
    runtime.start();
    return () => runtime.stop();
  }, [runtime]);

  function applyLink(next: LinkConfig): void {
    setLink(next);
    const auth: TransportAuth | undefined =
      next.username || next.password
        ? { username: next.username, password: next.password }
        : undefined;
    runtime.reconnect(next.kind, next.url, auth);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <main className="relative flex-1 min-h-[45vh]">
        <Viewport runtime={runtime} cameraMode={cameraMode} />
        {/* Drag strip for the frameless desktop window; inert in the browser. */}
        <div className="absolute inset-x-0 top-0 h-8 [-webkit-app-region:drag]" />
        <div className="absolute left-3 top-3 flex flex-col gap-2">
          <div className="rounded bg-black/60 px-3 py-2 backdrop-blur">
            <div className="text-xs uppercase tracking-widest text-accent">Arana IoT</div>
            <div className="text-[11px] text-slate-400">digital twin · {TOPIC.CMD.split("/")[0]}</div>
          </div>
          <Hud telemetry={snap.telemetry} />
        </div>
        <div className="absolute right-3 top-3 flex gap-1 rounded bg-black/60 p-1 backdrop-blur [-webkit-app-region:no-drag]">
          {[CAMERA_MODE.FOLLOW, CAMERA_MODE.ORBIT].map((mode) => (
            <button
              key={mode}
              onClick={() => setCameraMode(mode)}
              className={cn(
                "min-h-11 min-w-16 rounded px-3 text-xs uppercase tracking-wider",
                cameraMode === mode ? "bg-accent text-slate-900" : "text-slate-300",
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </main>

      <aside className="w-full lg:w-80 shrink-0 overflow-y-auto border-l border-edge bg-body/95 p-4 flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Link
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => applyLink({ ...link, kind: TRANSPORT_KIND.LOOPBACK })}
              className={
                "flex-1 rounded px-2 py-1 text-xs " +
                (link.kind === TRANSPORT_KIND.LOOPBACK ? "bg-accent text-slate-900" : "bg-panel")
              }
            >
              Loopback
            </button>
            <button
              onClick={() => applyLink({ ...link, kind: TRANSPORT_KIND.MQTT })}
              className={
                "flex-1 rounded px-2 py-1 text-xs " +
                (link.kind === TRANSPORT_KIND.MQTT ? "bg-accent text-slate-900" : "bg-panel")
              }
            >
              MQTT
            </button>
          </div>
          <input
            value={link.url}
            onChange={(e) => setLink({ ...link, url: e.target.value })}
            spellCheck={false}
            className="rounded bg-panel px-2 py-1 text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-accent"
          />
          <div className="flex gap-2">
            <input
              value={link.username}
              onChange={(e) => setLink({ ...link, username: e.target.value })}
              spellCheck={false}
              placeholder="user"
              autoComplete="off"
              className="w-1/3 rounded bg-panel px-2 py-1 text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-accent"
            />
            <input
              value={link.password}
              onChange={(e) => setLink({ ...link, password: e.target.value })}
              spellCheck={false}
              placeholder="password"
              type="password"
              autoComplete="off"
              className="flex-1 rounded bg-panel px-2 py-1 text-xs font-mono text-slate-200 outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="text-[10px] text-slate-500">
            {snap.transport.kind} ·{" "}
            <span className={snap.transport.connected ? "text-ok" : "text-danger"}>
              {snap.transport.connected ? "connected" : "offline"}
            </span>
            {snap.transport.error ? ` · ${snap.transport.error}` : ""}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Drive
          </h2>
          <div className="flex items-center justify-center py-2">
            <Joystick
              onChange={(f, t) => runtime.move(f, t)}
              onRelease={() => runtime.stopBody()}
            />
          </div>
          <GaitButtons
            current={snap.state.gait}
            onPick={(g) => runtime.setGait(g as Gait)}
          />
          <button
            onClick={() => runtime.stopBody()}
            className="rounded bg-danger/80 px-3 py-2 text-sm font-semibold text-white hover:bg-danger"
          >
            STOP
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Servos
          </h2>
          <ServoBar joints={snap.joints} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Telemetry
          </h2>
          <TelemetryPanel snap={snap} />
        </section>
      </aside>
    </div>
  );
}
