import type { RuntimeSnapshot } from "../runtime/TwinRuntime";

const GAITS = ["rest", "wave", "tetrapod"] as const;

export function TelemetryPanel({ snap }: { snap: RuntimeSnapshot }) {
  const { telemetry: t, transport } = snap;
  const dist = t.distance == null ? "—" : `${(t.distance * 100).toFixed(1)} cm`;

  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <Stat label="Pose" value={`${t.x.toFixed(2)}, ${t.z.toFixed(2)}`} />
      <Stat label="Heading" value={`${((t.yaw * 180) / Math.PI).toFixed(0)}°`} />
      <Stat label="Distance" value={dist} />
      <Stat label="Gait" value={t.gait} />
      <Stat
        label="Transport"
        value={transport.connected ? `${transport.kind} · up` : `${transport.kind} · down`}
        tone={transport.connected ? "ok" : "danger"}
      />
      <Stat label="Servos" value={`${snap.joints.length}`} />
    </div>
  );
}

export function ServoBar({ joints }: { joints: number[] }) {
  return (
    <div className="flex gap-1">
      {joints.map((deg, i) => (
        <div key={i} className="flex-1">
          <div className="h-16 w-full rounded bg-panel relative overflow-hidden">
            <div
              className="absolute bottom-0 w-full bg-accent/70"
              style={{ height: `${((deg + 30) / 60) * 100}%` }}
            />
          </div>
          <div className="mt-1 text-center text-[10px] text-slate-500">{i}</div>
        </div>
      ))}
    </div>
  );
}

export function GaitButtons({
  current,
  onPick,
}: {
  current: string;
  onPick: (g: (typeof GAITS)[number]) => void;
}) {
  return (
    <div className="flex gap-2">
      {GAITS.map((g) => (
        <button
          key={g}
          onClick={() => onPick(g)}
          className={
            "flex-1 rounded px-2 py-1 text-xs capitalize transition " +
            (current === g
              ? "bg-accent text-slate-900 font-semibold"
              : "bg-panel text-slate-300 hover:bg-edge")
          }
        >
          {g}
        </button>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "ok" | "danger";
}) {
  const color =
    tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-slate-100";
  return (
    <div className="rounded bg-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={"font-mono " + color}>{value}</div>
    </div>
  );
}
