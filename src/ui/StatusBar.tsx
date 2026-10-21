import type { RuntimeSnapshot } from "../runtime/TwinRuntime";
import { TRANSPORT_KIND } from "../net/transport";
import { LinkDot } from "./LinkDot";
import { LINK_LABEL, linkState } from "./format";

/** 24 px status bar: link, broker, tick rate, fps, mode, body controller. */
export function StatusBar({ snap, fps }: { snap: RuntimeSnapshot; fps: number | null }) {
  const link = linkState(snap.transport);
  const item = "flex items-center gap-1.5 whitespace-nowrap";
  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 overflow-hidden border-t border-bar-edge bg-bar px-3 font-mono text-[10px] text-muted">
      <span className={item} role="status">
        <LinkDot transport={snap.transport} />
        {snap.transport.kind} · {LINK_LABEL[link]}
      </span>
      <span className={`${item} min-w-0 truncate`}>{snap.transport.kind === TRANSPORT_KIND.MQTT ? snap.transport.broker : "no broker"}</span>
      <span className="flex-1" />
      <span className={item}>tick {snap.tickHz ? snap.tickHz.toFixed(1) : "—"} Hz</span>
      <span className={item}>{fps == null ? "—" : fps.toFixed(0)} fps</span>
      <span className={item}>{snap.telemetry.mode}</span>
      <span className={item}>{snap.state.controller}</span>
    </footer>
  );
}
