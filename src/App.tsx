import { useEffect, useRef, useState } from "react";
import { Viewport } from "./scene/Viewport";
import { Joystick } from "./ui/Joystick";
import { GaitButtons, ServoBar, TelemetryPanel } from "./ui/TelemetryPanel";
import { TwinRuntime } from "./runtime/TwinRuntime";
import { useTwin } from "./runtime/useTwin";
import { TOPIC, type Gait } from "./protocol";
import { TRANSPORT_KIND, type TransportKind } from "./net/transport";

const BROKER_DEFAULT = "ws://localhost:9001";

export default function App() {
  const runtimeRef = useRef<TwinRuntime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = new TwinRuntime();
  const runtime = runtimeRef.current;

  const snap = useTwin(runtime);
  const [link, setLink] = useState<{ kind: TransportKind; url: string }>({
    kind: TRANSPORT_KIND.LOOPBACK,
    url: BROKER_DEFAULT,
  });

  useEffect(() => {
    runtime.start();
    return () => runtime.stop();
  }, [runtime]);

  function applyLink(next: { kind: TransportKind; url: string }): void {
    setLink(next);
    runtime.reconnect(next.kind, next.url);
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <main className="relative flex-1 min-h-[45vh]">
        <Viewport runtime={runtime} />
        <div className="absolute left-3 top-3 rounded bg-panel/80 px-3 py-2 backdrop-blur">
          <div className="text-xs uppercase tracking-widest text-accent">Arana IoT</div>
          <div className="text-[11px] text-slate-400">digital twin · {TOPIC.CMD.split("/")[0]}</div>
        </div>
      </main>

      <aside className="w-full lg:w-80 shrink-0 overflow-y-auto border-l border-edge bg-body/95 p-4 flex flex-col gap-4">
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Link
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => applyLink({ kind: TRANSPORT_KIND.LOOPBACK, url: link.url })}
              className={
                "flex-1 rounded px-2 py-1 text-xs " +
                (link.kind === TRANSPORT_KIND.LOOPBACK ? "bg-accent text-slate-900" : "bg-panel")
              }
            >
              Loopback
            </button>
            <button
              onClick={() => applyLink({ kind: TRANSPORT_KIND.MQTT, url: link.url })}
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
