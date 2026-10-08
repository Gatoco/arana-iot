/**
 * Gait engine: turns a (forward, turn) command into foot targets over time.
 *
 * Two gaits implemented, both statically stable:
 *   - wave:    one leg lifted at a time (slow, safest)
 *   - tetrapod: diagonal pairs alternate (faster)
 *
 * Pure functions over `t` seconds + a phase accumulator, so the twin and the
 * future ESP firmware can share the exact same math.
 */

import { GAIT, LEG, LEGS, type Gait, type LegId } from "../protocol";
import { clamp, type FootTarget } from "./spiderModel";

/** Seconds for one full gait cycle (all legs take one step). */
export const GAIT_PERIOD: Record<Exclude<Gait, "rest">, number> = {
  [GAIT.WAVE]: 2.4,
  [GAIT.TETRAPOD]: 1.2,
};

/** Fraction of the cycle a leg spends in the air (lifting + swinging). */
const DUTY = 0.25;
/** Peak stride length at full speed, meters. */
const STRIDE = 0.05;

/** Phase offset per leg, 0..1, so legs don't all lift together. */
const PHASE: Record<Gait, Record<LegId, number>> = {
  [GAIT.WAVE]: {
    [LEG.FL]: 0.0,
    [LEG.RR]: 0.25,
    [LEG.FR]: 0.5,
    [LEG.RL]: 0.75,
  },
  [GAIT.TETRAPOD]: {
    [LEG.FL]: 0.0,
    [LEG.RR]: 0.0,
    [LEG.FR]: 0.5,
    [LEG.RL]: 0.5,
  },
  [GAIT.REST]: {
    [LEG.FL]: 0,
    [LEG.FR]: 0,
    [LEG.RL]: 0,
    [LEG.RR]: 0,
  },
};

export interface GaitInput {
  forward: number;
  turn: number;
  gait: Gait;
  /** Accumulated cycle phase in turns (0..1). */
  phase: number;
}

export interface GaitOutput {
  targets: Record<LegId, FootTarget>;
  /** Advance phase by dt for the next frame. */
  advance: (dt: number) => number;
  /** Meters per second the body actually moves (forward). */
  speed: number;
  /** Radians per second the body actually turns. */
  yawRate: number;
}

/** Phase increment per frame for the current gait. */
export function phaseStep(gait: Gait, dt: number): number {
  if (gait === GAIT.REST) return 0;
  return dt / GAIT_PERIOD[gait];
}

export function computeGait(input: GaitInput): GaitOutput {
  const { forward, turn, gait, phase } = input;
  const moving = gait !== GAIT.REST;
  const period = gait === GAIT.REST ? GAIT_PERIOD[GAIT.WAVE] : GAIT_PERIOD[gait];
  const speed = moving ? clamp(forward, -1, 1) * (STRIDE / period) * 4 : 0;
  const yawRate = moving ? clamp(turn, -1, 1) * 1.2 : 0;

  const targets = {} as Record<LegId, FootTarget>;
  for (const leg of LEGS) {
    targets[leg] = gait === GAIT.REST ? restTarget(leg) : stepTarget(leg, gait, phase, forward, turn);
  }

  return { targets, advance: (dt) => nextPhase(phase, gait, dt), speed, yawRate };
}

function restTarget(_leg: LegId): FootTarget {
  return { forward: 0, height: 0 };
}

function stepTarget(
  leg: LegId,
  gait: Exclude<Gait, "rest">,
  phase: number,
  forward: number,
  turn: number,
): FootTarget {
  const offset = PHASE[gait][leg];
  // Local phase in [0,1): 0..DUTY = swing (in air), DUTY..1 = stance (planted).
  let local = (phase + offset) % 1;
  if (local < 0) local += 1;

  // Turn contribution: outer legs on the turn side swing farther.
  const yawBias = turn * (leg === LEG.FL || leg === LEG.RL ? 1 : -1) * 0.5;

  if (local < DUTY) {
    // Swing: lift and move forward.
    const s = local / DUTY;
    const height = Math.sin(s * Math.PI) * 0.03;
    const forwardOffset = (-STRIDE / 2 + STRIDE * s) * clamp(forward, -1, 1);
    return { forward: forwardOffset + yawBias * 0.01, height };
  }

  // Stance: foot planted, body slides over it, so foot moves backward.
  const s = (local - DUTY) / (1 - DUTY);
  const forwardOffset = (STRIDE / 2 - STRIDE * s) * clamp(forward, -1, 1);
  return { forward: forwardOffset + yawBias * 0.01, height: 0 };
}

function nextPhase(phase: number, gait: Gait, dt: number): number {
  const p = phase + phaseStep(gait, dt);
  return p % 1;
}
