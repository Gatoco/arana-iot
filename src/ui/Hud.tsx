import { cn } from "../lib/cn";
import { CONTROL_MODE, type Telemetry } from "../protocol";
import { formatDistance } from "./format";

/** Compact heads-up readout over the 3D view: mode, gait, position, sonar distance. */
export function Hud({ telemetry }: { telemetry: Telemetry }) {
  const auto = telemetry.mode === CONTROL_MODE.AUTO;
  const cell = "flex flex-col px-2 py-1";
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-edge/70 overflow-hidden rounded-md border border-edge/80 bg-bg/80 font-mono text-[11px]">
      <div className={cell}>
        <span className="text-[9px] uppercase tracking-[0.08em] text-muted">Mode</span>
        <span data-testid="hud-mode" className={cn("font-semibold uppercase", auto ? "text-accent" : "text-warn")}>
          {telemetry.mode}
        </span>
      </div>
      <div className={cell}>
        <span className="text-[9px] uppercase tracking-[0.08em] text-muted">Gait</span>
        <span className="uppercase text-ink">{telemetry.gait}</span>
      </div>
      <div className={cell}>
        <span className="text-[9px] uppercase tracking-[0.08em] text-muted">X / Z</span>
        <span className="text-ink">
          {telemetry.x.toFixed(2)} / {telemetry.z.toFixed(2)}
        </span>
      </div>
      <div className={cell}>
        <span className="text-[9px] uppercase tracking-[0.08em] text-muted">Dist</span>
        <span className="text-ink">{formatDistance(telemetry.distance)}</span>
      </div>
    </div>
  );
}
