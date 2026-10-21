import { useRef, useState } from "react";
import { joystickToMove } from "./joystickMath";

interface JoystickProps {
  onChange: (forward: number, turn: number) => void;
  onRelease: () => void;
}

/** Touch/mouse joystick. Y axis = forward, X axis = turn. */
export function Joystick({ onChange, onRelease }: JoystickProps) {
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);

  function handle(e: PointerEvent | React.PointerEvent): void {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    let dx = (e.clientX - cx) / radius;
    let dy = (e.clientY - cy) / radius;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    setKnob({ x: dx, y: dy });
    const move = joystickToMove(dx, dy);
    onChange(move.forward, move.turn);
  }

  function end(): void {
    active.current = false;
    setKnob({ x: 0, y: 0 });
    onRelease();
  }

  return (
    <div
      ref={padRef}
      className="relative h-40 w-40 rounded-full border-2 border-edge bg-panel/70 select-none touch-none"
      onPointerDown={(e) => {
        active.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        handle(e);
      }}
      onPointerMove={(e) => active.current && handle(e)}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="pointer-events-none absolute h-14 w-14 rounded-full bg-accent/80 shadow-lg"
        style={{
          left: `calc(50% + ${knob.x * 40}%)`,
          top: `calc(50% + ${knob.y * 40}%)`,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}
