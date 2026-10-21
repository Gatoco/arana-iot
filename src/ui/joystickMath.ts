/**
 * Screen-space knob offset (x right, y down, unit circle) to a protocol move.
 * Protocol: forward positive = ahead, turn positive = left.
 */
export function joystickToMove(dx: number, dy: number): { forward: number; turn: number } {
  return { forward: -dy || 0, turn: -dx || 0 };
}
