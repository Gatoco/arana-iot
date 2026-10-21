import { CONTROL_MODE } from "../protocol";
import type { RuntimeSnapshot } from "../runtime/TwinRuntime";
import { SENSOR, toDegrees } from "../sim/spiderModel";
import { Readout } from "./controls";
import { formatDistance, LINK_LABEL, linkState } from "./format";

/** Every value comes from the engine, the transport or the renderer; missing = "—". */
export function TelemetryPanel({ snap, fps }: { snap: RuntimeSnapshot; fps: number | null }) {
  const { telemetry: t, state: s, transport } = snap;
  const heading = ((toDegrees(t.yaw) % 360) + 360) % 360;
  const link = linkState(transport);
  const distFrac = t.distance == null ? 1 : Math.min(1, t.distance / SENSOR.maxRange);
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        <Readout label="X" value={`${t.x.toFixed(3)} m`} />
        <Readout label="Z" value={`${t.z.toFixed(3)} m`} />
        <Readout label="Heading" value={`${heading.toFixed(1)}°`} />
        <Readout label="Speed" value={`${s.speed.toFixed(3)} m/s`} />
        <Readout label="Height" value={`${(s.h * 1000).toFixed(1)} mm`} />
        <Readout label="Pitch/Roll" value={`${toDegrees(s.pitch).toFixed(1)}/${toDegrees(s.roll).toFixed(1)}°`} />
        <Readout label="Gait" value={t.gait} />
        <Readout label="Mode" value={t.mode.toUpperCase()} tone={t.mode === CONTROL_MODE.AUTO ? "accent" : "warn"} />
        <Readout label="Body" value={s.collided ? "blocked" : s.controller} tone={s.collided ? "warn" : undefined} />
      </div>
      <div className="rounded-md border border-edge bg-bg px-2 py-1">
        <div className="flex justify-between text-[10px] uppercase tracking-[0.08em] text-muted">
          <span>HC-SR04</span>
          <span className="font-mono normal-case tracking-normal text-ink">{formatDistance(t.distance)}</span>
        </div>
        <div className="relative mt-1 h-1.5 rounded-sm bg-edge/70" aria-hidden>
          <span
            className={`absolute left-0 top-0 h-full rounded-sm ${t.distance == null ? "bg-muted/30" : t.distance < 0.4 ? "bg-warn/80" : "bg-accent/70"}`}
            style={{ width: `${distFrac * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted/80">
          <span>2 cm</span>
          <span>4 m</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Readout
          label="Link"
          value={LINK_LABEL[link]}
          tone={link === "connected" ? "ok" : link === "connecting" ? "warn" : link === "error" ? "danger" : "muted"}
        />
        <Readout label="Tick" value={snap.tickHz ? `${snap.tickHz.toFixed(1)} Hz` : "—"} />
        <Readout label="FPS" value={fps == null ? "—" : fps.toFixed(0)} />
        <Readout label="Packets in" value={String(snap.packetsIn)} />
        <Readout label="Packets out" value={String(snap.packetsOut)} />
        <Readout label="Contact" value={s.contact.map((c) => (c ? "■" : "□")).join("")} />
      </div>
    </>
  );
}
