/**
 * Screen-space knob offset (x right, y down, unit circle) to a protocol move.
 * Protocol: forward positive = ahead, turn positive = left. A radial deadzone kills drift
 * around the center; the rest of the travel is rescaled so full deflection still reaches 1.
 */
export const DEADZONE = 0.08;

export function joystickToMove(dx: number, dy: number, deadzone = 0): { forward: number; turn: number } {
  const mag = Math.hypot(dx, dy);
  if (!Number.isFinite(mag) || mag <= deadzone) return { forward: 0, turn: 0 };
  const scale = mag > 1 ? 1 / mag : 1;
  const k = deadzone > 0 ? (Math.min(1, mag) - deadzone) / (1 - deadzone) / Math.min(1, mag) : 1;
  return { forward: -dy * scale * k || 0, turn: -dx * scale * k || 0 };
}

/** Throttle (0..1) scales the operator command. */
export function applyThrottle(move: { forward: number; turn: number }, throttle: number): { forward: number; turn: number } {
  const t = Math.min(1, Math.max(0, Number.isFinite(throttle) ? throttle : 0));
  return { forward: move.forward * t || 0, turn: move.turn * t || 0 };
}

export const DRIVE_KEYS = ["w", "a", "s", "d"] as const;

/** WASD -> move. A/D turn left/right (left = positive turn). Opposite keys cancel. */
export function keysToMove(pressed: ReadonlySet<string>): { forward: number; turn: number } {
  const f = (pressed.has("w") ? 1 : 0) - (pressed.has("s") ? 1 : 0);
  const t = (pressed.has("a") ? 1 : 0) - (pressed.has("d") ? 1 : 0);
  return { forward: f, turn: t };
}
