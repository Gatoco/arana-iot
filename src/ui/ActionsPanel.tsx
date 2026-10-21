import { cn } from "../lib/cn";
import type { PoseName } from "../protocol";
import { ACTION_LABEL, ACTION_ORDER, ACTIONS } from "../sim/actions";

/** The nine LA072 preset actions, in the product grid order (docs/reference/LA072_3.jpg). */
export function ActionsPanel({
  running,
  progress,
  holding,
  disabled,
  onPick,
}: {
  running: PoseName | null;
  progress: number;
  holding: boolean;
  disabled: boolean;
  onPick: (pose: PoseName) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {ACTION_ORDER.map((name) => {
          const active = running === name;
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              title={`${ACTION_LABEL[name]} · firmware "${name}", ${ACTIONS[name].duration.toFixed(1)} s`}
              onClick={() => onPick(name)}
              className={cn(
                "relative h-8 overflow-hidden rounded-md border text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40",
                active ? "border-accent/60 bg-accent/10 text-accent" : "border-edge bg-raised text-ink hover:border-muted/60",
              )}
            >
              {ACTION_LABEL[name]}
              {active && (
                <span className="absolute bottom-0 left-0 h-0.5 bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted">
        {disabled
          ? "Actions are paused during the servo test."
          : holding
            ? "Holding the last keyframe, as the firmware does. Drive or STOP to stand back up."
            : "Keyframes from the official firmware tables. Drive or STOP cancels."}
      </p>
    </>
  );
}
