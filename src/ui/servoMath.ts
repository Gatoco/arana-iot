/**
 * Servo matrix helpers: bar geometry for a joint inside its limits.
 */

/** Fraction 0..1 of `value` inside [min, max]; 0.5 when the range is degenerate. */
export function normalize(value: number, min: number, max: number): number {
  const span = max - min;
  if (!Number.isFinite(value) || !(span > 0)) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / span));
}

/**
 * Bar from the zero tick to the value, as left/width fractions of the track. Used for hips
 * (centered on 0) and knees (0 = tibia flat).
 */
export function barFromZero(value: number, min: number, max: number): { left: number; width: number; zero: number } {
  const zero = normalize(0, min, max);
  const v = normalize(value, min, max);
  return { left: Math.min(zero, v), width: Math.abs(v - zero), zero };
}

export function clampDeg(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}
