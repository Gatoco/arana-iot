/**
 * The nine LA072 preset actions, transcribed from the official firmware tables
 * (`0.SpiderBot/actionarray.h`, raw servo degrees, firmware channel order) and converted to
 * twin joints with servoMap.ts. Nothing here is invented: every keyframe and duration is the
 * firmware's.
 *
 * Playback matches `SpiderBotMotion::Servo_PROGRAM_Run`: each keyframe is reached by linear
 * interpolation from the previous pose over that keyframe's milliseconds. The firmware holds
 * the last keyframe when the action ends; so does the twin.
 *
 * Names are the firmware's web API names (`/api/v1/action`), so a future ESP bridge can map
 * them 1:1. Labels are the product names (docs/reference/LA072_3.jpg); the app maps
 * Dance 1/2/3 to Relax / Swing / Leg raise (icons in LA072_4.jpg).
 */

import { POSE, type PoseName } from "../protocol";
import { firmwareToJoints } from "./servoMap";

export const ACTION = POSE;
export type ActionName = PoseName;

/** Grid order of docs/reference/LA072_3.jpg. */
export const ACTION_ORDER: ActionName[] = [
  ACTION.FIGHTING,
  ACTION.STANDBY,
  ACTION.PUSHUP,
  ACTION.SLEEP,
  ACTION.LIE,
  ACTION.HELLO,
  ACTION.DANCE3,
  ACTION.DANCE2,
  ACTION.DANCE1,
];

export const ACTION_LABEL: Record<ActionName, string> = {
  [ACTION.FIGHTING]: "Fighting",
  [ACTION.STANDBY]: "Standby",
  [ACTION.PUSHUP]: "Push-Up",
  [ACTION.SLEEP]: "Sleep",
  [ACTION.LIE]: "Lie Down",
  [ACTION.HELLO]: "Greet",
  [ACTION.DANCE3]: "Leg Raise",
  [ACTION.DANCE2]: "Swing",
  [ACTION.DANCE1]: "Relax",
};

export interface ActionFrame {
  /** 8 joint angles, radians, protocol order (FL hip, FL knee, FR..., RL..., RR...). */
  joints: number[];
  /** Interpolation time from the previous pose, seconds. */
  duration: number;
}

export interface ActionSpec {
  name: ActionName;
  /** Total duration, seconds. */
  duration: number;
  /** Firmware actions run once and hold the final keyframe. */
  loop: false;
  frames: ActionFrame[];
}

/** Firmware rows: 8 raw servo degrees (G14 G12 G13 G15 G16 G5 G4 G2) + milliseconds. */
type Row = [number, number, number, number, number, number, number, number, number];

const PRG_1_STANDBY: Row[] = [
  [90, 90, 90, 90, 90, 90, 90, 90, 500],
  [60, 90, 90, 120, 120, 90, 90, 60, 500],
];

const PRG_8_LIE: Row[] = [[110, 90, 90, 70, 70, 90, 90, 110, 500]];

const PRG_9_HELLO: Row[] = [
  [60, 90, 125, 80, 120, 82, 90, 50, 280],
  [60, 90, 125, 80, 92, 74, 90, 50, 220],
  [60, 90, 125, 80, 38, 62, 90, 50, 240],
  [60, 90, 125, 80, 34, 118, 90, 50, 260],
  [60, 90, 125, 80, 46, 58, 90, 50, 260],
  [60, 90, 125, 80, 34, 118, 90, 50, 260],
  [60, 90, 125, 80, 46, 58, 90, 50, 260],
  [60, 90, 125, 80, 44, 88, 90, 50, 220],
  [60, 90, 125, 80, 92, 78, 90, 50, 220],
  [60, 90, 125, 80, 120, 82, 90, 50, 280],
];

const PRG_10_FIGHTING: Row[] = [
  [120, 90, 90, 110, 60, 90, 90, 70, 500],
  [120, 70, 70, 110, 60, 70, 70, 70, 500],
  [120, 110, 110, 110, 60, 110, 110, 70, 500],
  [120, 70, 70, 110, 60, 70, 70, 70, 500],
  [120, 110, 110, 110, 60, 110, 110, 70, 500],
  [70, 90, 90, 70, 110, 90, 90, 110, 500],
  [70, 70, 70, 70, 110, 70, 70, 110, 500],
  [70, 110, 110, 70, 110, 110, 110, 110, 500],
  [70, 70, 70, 70, 110, 70, 70, 110, 500],
  [70, 110, 110, 70, 110, 110, 110, 110, 500],
  [70, 90, 90, 70, 110, 90, 90, 110, 500],
  [60, 90, 90, 120, 120, 90, 90, 60, 500],
];

const PRG_11_PUSHUP: Row[] = [
  [70, 90, 90, 120, 120, 90, 90, 70, 500],
  [100, 90, 90, 80, 80, 90, 90, 100, 600],
  [60, 90, 90, 120, 120, 90, 90, 60, 700],
  [100, 90, 90, 80, 80, 90, 90, 100, 800],
  [60, 90, 90, 120, 120, 90, 90, 60, 900],
  [100, 90, 90, 80, 80, 90, 90, 100, 1000],
  [60, 90, 90, 120, 120, 90, 90, 60, 1100],
  [100, 90, 90, 80, 80, 90, 90, 100, 2000],
  [60, 90, 90, 120, 120, 90, 90, 60, 2500],
  [135, 90, 90, 45, 45, 90, 90, 135, 200],
  [70, 90, 90, 45, 60, 90, 90, 135, 800],
  [70, 90, 90, 45, 110, 90, 90, 135, 800],
  [70, 90, 90, 110, 110, 90, 90, 70, 800],
];

const PRG_12_SLEEP: Row[] = [
  [30, 90, 90, 150, 150, 90, 90, 30, 500],
  [30, 45, 135, 150, 150, 135, 45, 30, 500],
];

const PRG_13_DANCE1: Row[] = [
  [90, 90, 90, 90, 90, 90, 90, 90, 400],
  [50, 90, 90, 90, 90, 90, 90, 90, 400],
  [90, 90, 90, 130, 90, 90, 90, 90, 400],
  [90, 90, 90, 90, 90, 90, 90, 50, 400],
  [90, 90, 90, 90, 130, 90, 90, 90, 400],
  [50, 90, 90, 90, 90, 90, 90, 90, 400],
  [90, 90, 90, 130, 90, 90, 90, 90, 400],
  [90, 90, 90, 90, 90, 90, 90, 50, 400],
  [90, 90, 90, 90, 130, 90, 90, 90, 400],
  [90, 90, 90, 90, 90, 90, 90, 90, 400],
];

const PRG_14_DANCE2: Row[] = [
  [70, 45, 135, 110, 110, 135, 45, 70, 320],
  [95, 45, 135, 85, 110, 135, 45, 70, 260],
  [70, 45, 135, 110, 85, 135, 45, 95, 260],
  [95, 45, 135, 85, 110, 135, 45, 70, 260],
  [70, 45, 135, 110, 85, 135, 45, 95, 260],
  [95, 45, 135, 85, 110, 135, 45, 70, 260],
  [70, 45, 135, 110, 85, 135, 45, 95, 260],
  [95, 45, 135, 85, 110, 135, 45, 70, 260],
  [70, 45, 135, 110, 85, 135, 45, 95, 260],
  [70, 45, 135, 110, 110, 135, 45, 70, 320],
];

const PRG_15_DANCE3: Row[] = [
  [70, 45, 45, 110, 110, 135, 135, 70, 400],
  [110, 45, 45, 60, 70, 135, 135, 70, 400],
  [70, 45, 45, 110, 110, 135, 135, 70, 400],
  [110, 45, 45, 110, 70, 135, 135, 120, 400],
  [70, 45, 45, 110, 110, 135, 135, 70, 400],
  [110, 45, 45, 60, 70, 135, 135, 70, 400],
  [70, 45, 45, 110, 110, 135, 135, 70, 400],
  [110, 45, 45, 110, 70, 135, 135, 120, 400],
  [70, 45, 45, 110, 110, 135, 135, 70, 400],
  [70, 90, 90, 110, 110, 90, 90, 70, 400],
];

/** `hello()` runs Prg_9 then Prg_1, returning to standby; the others run one table. */
const TABLES: Record<ActionName, Row[]> = {
  [ACTION.STANDBY]: PRG_1_STANDBY,
  [ACTION.LIE]: PRG_8_LIE,
  [ACTION.HELLO]: [...PRG_9_HELLO, ...PRG_1_STANDBY],
  [ACTION.FIGHTING]: PRG_10_FIGHTING,
  [ACTION.PUSHUP]: PRG_11_PUSHUP,
  [ACTION.SLEEP]: PRG_12_SLEEP,
  [ACTION.DANCE1]: PRG_13_DANCE1,
  [ACTION.DANCE2]: PRG_14_DANCE2,
  [ACTION.DANCE3]: PRG_15_DANCE3,
};

function toSpec(name: ActionName, rows: Row[]): ActionSpec {
  const frames = rows.map((row) => ({
    joints: firmwareToJoints(row.slice(0, 8)),
    duration: row[8] / 1000,
  }));
  return {
    name,
    duration: frames.reduce((s, f) => s + f.duration, 0),
    loop: false,
    frames,
  };
}

export const ACTIONS: Record<ActionName, ActionSpec> = Object.fromEntries(
  (Object.keys(TABLES) as ActionName[]).map((name) => [name, toSpec(name, TABLES[name])]),
) as Record<ActionName, ActionSpec>;

export function isActionName(value: unknown): value is ActionName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TABLES, value);
}

/** Plays one action from an arbitrary start pose, like the firmware's keyframe runner. */
export class ActionPlayer {
  readonly spec: ActionSpec;
  private readonly start: number[];
  private elapsed = 0;

  constructor(spec: ActionSpec, startJoints: readonly number[]) {
    this.spec = spec;
    this.start = [...startJoints];
  }

  get done(): boolean {
    return this.elapsed >= this.spec.duration;
  }

  /** 0..1 */
  get progress(): number {
    return Math.min(1, this.elapsed / this.spec.duration);
  }

  step(dt: number): number[] {
    this.elapsed = Math.min(this.spec.duration, this.elapsed + Math.max(0, dt));
    return this.sample(this.elapsed);
  }

  sample(t: number): number[] {
    let from = this.start;
    let acc = 0;
    for (const frame of this.spec.frames) {
      if (t <= acc + frame.duration) {
        const s = frame.duration > 0 ? (t - acc) / frame.duration : 1;
        return from.map((a, i) => a + (frame.joints[i] - a) * s);
      }
      acc += frame.duration;
      from = frame.joints;
    }
    return [...from];
  }
}
