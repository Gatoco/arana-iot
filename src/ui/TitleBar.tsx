import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import type { TransportStatus } from "../net/transport";
import { desktop } from "./desktop";
import { IconClose, IconMark, IconMaximize, IconMinimize, IconRestore } from "./icons";
import { LinkDot } from "./LinkDot";

/**
 * 32 px custom titlebar for the frameless Electron window. The bar drags the window; every
 * control opts out of the drag region. In a browser there is no bridge: controls are hidden.
 */
export function TitleBar({ transport }: { transport: TransportStatus }) {
  const bridge = desktop();
  const [maximized, setMaximized] = useState(false);
  const mac = bridge?.platform === "darwin";

  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    bridge.isMaximized().then((m) => alive && setMaximized(m));
    const off = bridge.onMaximizedChange(setMaximized);
    return () => {
      alive = false;
      off();
    };
  }, [bridge]);

  return (
    <header
      className={cn(
        "drag-region flex h-8 shrink-0 select-none items-center border-b border-bar-edge bg-bar",
        mac ? "pl-20" : "pl-3",
      )}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) bridge?.toggleMaximize();
      }}
    >
      <IconMark className="text-accent" />
      <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">Arana</span>
      <span className="ml-2 text-[11px] text-muted">IoT digital twin · LAFVIN LA072</span>
      <div className="flex-1 self-stretch" onDoubleClick={() => bridge?.toggleMaximize()} />
      <div className="no-drag mr-2 flex items-center gap-1.5 text-[11px] text-muted" role="status" aria-live="polite">
        <LinkDot transport={transport} />
        <span className="uppercase tracking-wider">{transport.kind}</span>
      </div>
      {bridge && !mac && (
        <div className="no-drag flex h-full">
          <WinButton label="Minimize" onClick={() => bridge.minimize()}>
            <IconMinimize />
          </WinButton>
          <WinButton label={maximized ? "Restore" : "Maximize"} onClick={() => bridge.toggleMaximize()}>
            {maximized ? <IconRestore /> : <IconMaximize />}
          </WinButton>
          <WinButton label="Close" danger onClick={() => bridge.close()}>
            <IconClose />
          </WinButton>
        </div>
      )}
    </header>
  );
}

function WinButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-full w-11 items-center justify-center text-muted outline-offset-[-2px]",
        danger ? "hover:bg-[#7f1d1d] hover:text-white" : "hover:bg-raised hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
