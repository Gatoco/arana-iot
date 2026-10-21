import { cn } from "../lib/cn";
import type { TransportStatus } from "../net/transport";
import { linkState } from "./format";

/** Status dot; color is paired with text wherever it is shown. */
export function LinkDot({ transport }: { transport: TransportStatus }) {
  const s = linkState(transport);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full",
        s === "connected" && "bg-ok link-pulse",
        s === "connecting" && "bg-warn",
        s === "error" && "bg-danger",
        s === "offline" && "bg-muted/50",
      )}
    />
  );
}
