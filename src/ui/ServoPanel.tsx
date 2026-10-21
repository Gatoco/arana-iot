import { useState } from "react";
import { LEGS } from "../protocol";
import { LEG_CONFIG, NEUTRAL_POSE, toDegrees, toRadians } from "../sim/spiderModel";
import { FIRMWARE_CHANNELS, jointsToFirmware } from "../sim/servoMap";
import { Button, Toggle, inputClass } from "./controls";
import { barFromZero, clampDeg } from "./servoMath";

const JOINT_NAMES = ["Hip", "Knee"] as const;

function limitsDeg(index: number): [number, number] {
  const cfg = LEG_CONFIG[LEGS[Math.floor(index / 2)]];
  const lim = index % 2 === 0 ? cfg.hipYawLimits : cfg.kneeLimits;
  return [Math.round(toDegrees(lim[0])), Math.round(toDegrees(lim[1]))];
}

/** Firmware channel (GPIO) driving a protocol joint, for calibrating the physical kit. */
function gpioFor(index: number): number {
  const leg = LEGS[Math.floor(index / 2)];
  const joint = index % 2 === 0 ? "hip" : "knee";
  return FIRMWARE_CHANNELS.find((c) => c.leg === leg && c.joint === joint)?.gpio ?? 0;
}

/**
 * 4x2 joint matrix. Live angles always; in servo test mode, sliders and numeric inputs drive
 * the twin's joints directly (local only, nothing is sent to hardware). The raw firmware
 * servo degree is shown next to each joint for calibrating the real kit.
 */
export function ServoPanel({
  joints,
  testing,
  targets,
  onTest,
  onApply,
}: {
  joints: number[];
  testing: boolean;
  targets: number[];
  onTest: (on: boolean) => void;
  onApply: (deg: number[]) => void;
}) {
  const [draft, setDraft] = useState<number[] | null>(null);
  const values = testing ? (draft ?? targets) : joints;
  const raw = jointsToFirmware(values.map(toRadians));
  const rawByJoint = (i: number) => {
    const ch = FIRMWARE_CHANNELS.findIndex((c) => c.gpio === gpioFor(i));
    return Math.round(raw[ch]);
  };

  function edit(i: number, deg: number) {
    const [min, max] = limitsDeg(i);
    const next = [...values];
    next[i] = clampDeg(deg, min, max);
    setDraft(next);
  }

  return (
    <>
      <Toggle
        label="Servo test (pauses gait and actions)"
        checked={testing}
        onChange={(on) => {
          setDraft(null);
          onTest(on);
        }}
      />
      <table className="w-full table-fixed border-separate border-spacing-y-1 text-[11px]">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-muted">
            <th className="w-8 font-medium">Leg</th>
            {JOINT_NAMES.map((n) => (
              <th key={n} className="font-medium">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LEGS.map((leg, l) => (
            <tr key={leg}>
              <td className="font-mono text-muted">{leg}</td>
              {[0, 1].map((j) => {
                const i = 2 * l + j;
                const [min, max] = limitsDeg(i);
                const v = values[i] ?? 0;
                const bar = barFromZero(v, min, max);
                return (
                  <td key={j} className="pr-1 align-top">
                    <div className="flex items-baseline justify-between font-mono">
                      <span className="text-ink">{v.toFixed(1)}°</span>
                      <span className="text-[10px] text-muted" title={`Firmware channel G${gpioFor(i)} raw servo degrees`}>
                        G{gpioFor(i)} {rawByJoint(i)}
                      </span>
                    </div>
                    <div className="relative mt-0.5 h-1.5 rounded-sm bg-edge/70" aria-hidden>
                      <span className="absolute top-0 h-full bg-accent/70" style={{ left: `${bar.left * 100}%`, width: `${bar.width * 100}%` }} />
                      <span className="absolute -top-0.5 h-2.5 w-px bg-muted" style={{ left: `${bar.zero * 100}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-muted/80">
                      <span>{min}</span>
                      <span>{max}</span>
                    </div>
                    {testing && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <input
                          type="range"
                          className="min-w-0 flex-1"
                          min={min}
                          max={max}
                          step={1}
                          value={Math.round(v)}
                          aria-label={`${leg} ${JOINT_NAMES[j]} degrees`}
                          onChange={(e) => edit(i, Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className={`${inputClass} h-6 w-12 px-1`}
                          min={min}
                          max={max}
                          value={Math.round(v)}
                          aria-label={`${leg} ${JOINT_NAMES[j]} degrees value`}
                          onChange={(e) => edit(i, Number(e.target.value))}
                        />
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {testing && (
        <div className="flex flex-wrap gap-1.5">
          <Button tone="accent" onClick={() => draft && onApply(draft)} disabled={!draft}>
            Apply
          </Button>
          <Button
            onClick={() => {
              const neutral = NEUTRAL_POSE.map(toDegrees);
              setDraft(neutral);
              onApply(neutral);
            }}
            title="Neutral stance: hips ±45°, knees 65°"
          >
            Center all
          </Button>
          <Button onClick={() => setDraft([...joints])} title="Copy the live joint angles into the sliders">
            Read pose
          </Button>
        </div>
      )}
      <p className="text-[10px] text-muted">
        Hip 0° = leg sideways, + toward the nose. Knee 0° = tibia flat, + foot down. Limits follow the MG90S travel around the
        firmware zero.
      </p>
    </>
  );
}
