/**
 * Protocol contract shared by the digital twin (this app), the fly-brain
 * service and the future physical ESP kit.
 *
 * The twin and the real robot MUST speak the same messages. Swapping the
 * "body" (twin -> ESP) should not change this file.
 */

export const TOPIC = {
  /** Commands sent to the body (twin now, ESP later). */
  CMD: "arana/cmd",
  /** Body telemetry: pose, distance sensor, joint angles. */
  TELEMETRY: "arana/telemetry",
  /** Brain state published by the fly-brain service. */
  BRAIN_STATE: "arana/brain/state",
  /** Stimulus pushed into the brain. */
  BRAIN_STIMULUS: "arana/brain/stimulus",
} as const;

export type Topic = (typeof TOPIC)[keyof typeof TOPIC];

/** Commands the body understands. */
export const CMD_KIND = {
  MOVE: "move",
  STOP: "stop",
  GAIT: "gait",
  POSE: "pose",
  MODE: "mode",
} as const;

export type CmdKind = (typeof CMD_KIND)[keyof typeof CMD_KIND];

export interface MoveCmd {
  kind: typeof CMD_KIND.MOVE;
  /** Forward velocity, -1..1. */
  forward: number;
  /** Turn rate, -1..1 (positive = left). */
  turn: number;
}

export interface StopCmd {
  kind: typeof CMD_KIND.STOP;
}

export const GAIT = {
  /** Diagonal pairs move together: stable, slow. */
  TETRAPOD: "tetrapod",
  /** One leg at a time: very stable, slower. */
  WAVE: "wave",
  /** Body held still, legs planted: idle. */
  REST: "rest",
} as const;

export type Gait = (typeof GAIT)[keyof typeof GAIT];

export interface GaitCmd {
  kind: typeof CMD_KIND.GAIT;
  gait: Gait;
}

/**
 * Who drives the body. `auto`: the brain (via `arana/brain/state`).
 * `manual`: the operator; brain state is ignored.
 */
export const CONTROL_MODE = {
  AUTO: "auto",
  MANUAL: "manual",
} as const;

export type ControlMode = (typeof CONTROL_MODE)[keyof typeof CONTROL_MODE];

export interface ModeCmd {
  kind: typeof CMD_KIND.MODE;
  mode: ControlMode;
}

/**
 * Preset actions of the LAFVIN LA072, named exactly as the official firmware's
 * `/api/v1/action` endpoint. Product labels: fighting = Fighting, standby = Standby,
 * pushup = Push-Up, sleep = Sleep, lie = Lie Down, hello = Greet, dance3 = Leg Raise,
 * dance2 = Swing, dance1 = Relax.
 */
export const POSE = {
  FIGHTING: "fighting",
  STANDBY: "standby",
  PUSHUP: "pushup",
  SLEEP: "sleep",
  LIE: "lie",
  HELLO: "hello",
  DANCE3: "dance3",
  DANCE2: "dance2",
  DANCE1: "dance1",
} as const;

export type PoseName = (typeof POSE)[keyof typeof POSE];

/**
 * Run one preset action (additive extension, S20). Bodies that do not know `pose` must
 * ignore it; any move / stop / gait command cancels a running action.
 */
export interface PoseCmd {
  kind: typeof CMD_KIND.POSE;
  pose: PoseName;
}

export type Command = MoveCmd | StopCmd | GaitCmd | ModeCmd | PoseCmd;

/** Telemetry snapshot published by the body. */
export interface Telemetry {
  /** Timestamp in milliseconds (epoch). */
  t: number;
  /** Body position in meters, world frame. */
  x: number;
  y: number;
  z: number;
  /** Heading in radians. */
  yaw: number;
  /** Ultrasonic distance in meters, null when no echo. */
  distance: number | null;
  /** Current gait. */
  gait: Gait;
  /** Current control mode. */
  mode: ControlMode;
  /**
   * 8 servo angles in degrees, order: FL_hip, FL_knee, FR_hip, FR_knee, RL_hip, RL_knee,
   * RR_hip, RR_knee. hip 0 = leg perpendicular to the body (firmware zero pose), positive =
   * foot toward the nose. knee 0 = tibia in line with the horizontal femur, positive = foot
   * down. See docs/protocol.md for the mapping to firmware servo degrees.
   */
  joints: number[];
}

export const LEG = {
  FL: "FL",
  FR: "FR",
  RL: "RL",
  RR: "RR",
} as const;

export type LegId = (typeof LEG)[keyof typeof LEG];

export const LEGS: LegId[] = [LEG.FL, LEG.FR, LEG.RL, LEG.RR];

/** 8 servos: 2 joints per leg, 4 legs. Matches the 8x MG90 kit. */
export const JOINTS_PER_LEG = 2;
export const SERVO_COUNT = LEGS.length * JOINTS_PER_LEG;

/** Topic for a specific leg's servo bank, useful for low-level tuning. */
export function legTopic(leg: LegId): string {
  return `arana/servo/${leg}`;
}
