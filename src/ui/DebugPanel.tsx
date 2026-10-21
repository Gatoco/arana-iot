import { useState } from "react";
import type { Packet } from "../runtime/TwinRuntime";
import type { ViewOptions } from "../scene/SpiderView";
import { Button, Toggle } from "./controls";

export function DebugPanel({
  view,
  showStats,
  packets,
  onView,
  onStats,
  onResetCamera,
  onLogTelemetry,
  onClear,
  onDescribe,
}: {
  view: ViewOptions;
  showStats: boolean;
  packets: Packet[];
  onView: (patch: Partial<ViewOptions>) => void;
  onStats: (v: boolean) => void;
  onResetCamera: () => void;
  onLogTelemetry: (v: boolean) => void;
  onClear: () => void;
  onDescribe: () => string[];
}) {
  const [paused, setPaused] = useState<Packet[] | null>(null);
  const [withTelemetry, setWithTelemetry] = useState(false);
  const [tree, setTree] = useState<string[] | null>(null);
  const list = paused ?? packets;

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <Toggle label="Grid" checked={view.grid} onChange={(grid) => onView({ grid })} />
        <Toggle label="Axes" checked={view.axes} onChange={(axes) => onView({ axes })} />
        <Toggle label="Sonar cone" checked={view.sonar} onChange={(sonar) => onView({ sonar })} />
        <Toggle label="Contact shadow" checked={view.contactShadow} onChange={(contactShadow) => onView({ contactShadow })} />
        <Toggle label="Render stats" checked={showStats} onChange={onStats} />
        <Toggle label="Wireframe" checked={view.wireframe} onChange={(wireframe) => onView({ wireframe })} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button onClick={onResetCamera}>Reset camera</Button>
        <Button onClick={() => setTree(tree ? null : onDescribe())} pressed={tree != null}>
          Hierarchy
        </Button>
      </div>
      {tree && (
        <pre className="max-h-40 overflow-auto rounded-md border border-edge bg-bg p-2 font-mono text-[10px] leading-snug text-muted">
          {tree.join("\n")}
        </pre>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted">Packet log · last {list.length}</span>
        <div className="flex gap-1">
          <Button
            pressed={withTelemetry}
            title="Include arana/telemetry (30 Hz) in the log"
            onClick={() => {
              setWithTelemetry(!withTelemetry);
              onLogTelemetry(!withTelemetry);
            }}
          >
            Telemetry
          </Button>
          <Button pressed={paused != null} onClick={() => setPaused(paused ? null : [...packets])}>
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            onClick={() => {
              setPaused(null);
              onClear();
            }}
          >
            Clear
          </Button>
        </div>
      </div>
      <ol className="max-h-56 overflow-auto rounded-md border border-edge bg-bg font-mono text-[10px]" aria-label="Packet log">
        {list.length === 0 && <li className="px-2 py-1.5 text-muted">No packets yet.</li>}
        {[...list].reverse().map((p) => (
          <li key={p.id} className="border-b border-edge/60 px-2 py-1 last:border-0">
            <div className="flex gap-2 text-muted">
              <span className={p.dir === "in" ? "text-accent" : "text-warn"}>{p.dir.toUpperCase()}</span>
              <span className="text-ink">{p.topic}</span>
              <span className="ml-auto">{new Date(p.t).toLocaleTimeString(undefined, { hour12: false })}</span>
            </div>
            <div className="break-all text-muted">{p.payload}</div>
          </li>
        ))}
      </ol>
    </>
  );
}
