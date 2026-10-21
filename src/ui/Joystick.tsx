import { useRef, useState } from "react";
import { DEADZONE, joystickToMove } from "./joystickMath";

interface JoystickProps {
  onChange: (forward: number, turn: number) => void;
  onRelease: () => void;
  disabled?: boolean;
}

/** Touch/mouse joystick, 120 px. Y axis = forward, X axis = turn (right = negative turn). */
export function Joystick({ onChange, onRelease, disabled }: JoystickProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);

  function handle(e: React.PointerEvent): void {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (e.clientX - (rect.left + radius)) / radius;
    let dy = (e.clientY - (rect.top + radius)) / radius;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    setKnob({ x: dx, y: dy });
    const move = joystickToMove(dx, dy, DEADZONE);
    onChange(move.forward, move.turn);
  }

  function end(): void {
    if (!active.current) return;
    active.current = false;
    setKnob({ x: 0, y: 0 });
    onRelease();
  }

  return (
    <div
      ref={padRef}
      role="application"
      aria-label="Drive joystick: up forward, right turns right"
      aria-disabled={disabled}
      className="relative h-[120px] w-[120px] shrink-0 touch-none select-none rounded-full border border-edge bg-bg aria-disabled:opacity-40"
      onPointerDown={(e) => {
        if (disabled) return;
        active.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        handle(e);
      }}
      onPointerMove={(e) => active.current && handle(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div className="pointer-events-none absolute inset-[12%] rounded-full border border-edge/70" />
      <div className="pointer-events-none absolute left-1/2 top-2 h-[calc(100%-16px)] w-px -translate-x-1/2 bg-edge/60" />
      <div className="pointer-events-none absolute left-2 top-1/2 h-px w-[calc(100%-16px)] -translate-y-1/2 bg-edge/60" />
      <div
        className="pointer-events-none absolute h-9 w-9 rounded-full border border-accent/60 bg-raised"
        style={{
          left: `calc(50% + ${knob.x * 42}%)`,
          top: `calc(50% + ${knob.y * 42}%)`,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
