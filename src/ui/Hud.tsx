import { cn } from "../lib/cn";
import { CONTROL_MODE, type Telemetry } from "../protocol";

/** Heads-up readout over the 3D view: mode, gait, position and sonar distance. */
export function Hud({ telemetry }: { telemetry: Telemetry }) {
  const distance = telemetry.distance == null ? "no echo" : `${(telemetry.distance * 100).toFixed(1)} cm`;
  const auto = telemetry.mode === CONTROL_MODE.AUTO;

  return (
    <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 rounded-md border border-edge/60 bg-black/60 px-3 py-2 font-mono text-xs backdrop-blur">
      <span className="text-slate-500">MODE</span>
      <span
        data-testid="hud-mode"
        className={cn("font-semibold uppercase", auto ? "text-accent" : "text-warn")}
      >
        {telemetry.mode}
      </span>
      <span className="text-slate-500">GAIT</span>
      <span className="uppercase text-slate-200">{telemetry.gait}</span>
      <span className="text-slate-500">X / Z</span>
      <span className="text-slate-200">
        {telemetry.x.toFixed(2)} / {telemetry.z.toFixed(2)} m
      </span>
      <span className="text-slate-500">DIST</span>
      <span className="text-slate-200">{distance}</span>
    </div>
  );
}
