import { GAIT, type Gait } from "../protocol";
import { Button, Segmented } from "./controls";
import { Joystick } from "./Joystick";

export function DrivePanel({
  gait,
  throttle,
  disabled,
  onMove,
  onRelease,
  onGait,
  onStop,
  onThrottle,
}: {
  gait: Gait;
  throttle: number;
  disabled: boolean;
  onMove: (forward: number, turn: number) => void;
  onRelease: () => void;
  onGait: (g: Gait) => void;
  onStop: () => void;
  onThrottle: (t: number) => void;
}) {
  const pct = Math.round(throttle * 100);
  return (
    <>
      <div className="flex items-center gap-3">
        <Joystick onChange={onMove} onRelease={onRelease} disabled={disabled} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="flex justify-between text-[11px] text-muted">
              Throttle <span className="font-mono text-ink">{pct}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              aria-label="Throttle percent"
              onChange={(e) => onThrottle(Number(e.target.value) / 100)}
            />
          </label>
          {/* Accessible alternative to the joystick: hold-free step buttons. */}
          <div className="grid grid-cols-3 gap-1" aria-label="Drive buttons">
            <span />
            <Button disabled={disabled} title="Forward (W)" onClick={() => onMove(1, 0)}>
              Fwd
            </Button>
            <span />
            <Button disabled={disabled} title="Turn left (A)" onClick={() => onMove(0, 1)}>
              Left
            </Button>
            <Button disabled={disabled} title="Back (S)" onClick={() => onMove(-1, 0)}>
              Back
            </Button>
            <Button disabled={disabled} title="Turn right (D)" onClick={() => onMove(0, -1)}>
              Right
            </Button>
          </div>
        </div>
      </div>
      <Segmented
        label="Gait"
        value={gait}
        disabled={disabled}
        onChange={onGait}
        options={[
          { value: GAIT.TETRAPOD, label: "Tetrapod", title: "Diagonal pairs, 1.2 s cycle (key 1)" },
          { value: GAIT.WAVE, label: "Wave", title: "One leg at a time, 2.4 s cycle (key 2)" },
          { value: GAIT.REST, label: "Rest", title: "Neutral stance (key 3)" },
        ]}
      />
      <button
        type="button"
        onClick={onStop}
        title="Stop and cancel any action (Space)"
        className="h-8 rounded-md border border-danger/70 bg-danger/20 text-[12px] font-semibold tracking-[0.12em] text-danger hover:bg-danger/30"
      >
        STOP
      </button>
    </>
  );
}
