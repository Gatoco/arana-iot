# Protocol — arana-iot

Source of truth: `src/protocol.ts`. The twin, the ESP firmware (later), the fly-brain service
and the Android controller speak these messages. Changing them needs a spec (`S#`) and the
owner's approval.

## Transport

- MQTT 3.1.1 over WebSocket (twin, browser) or TCP (devices). Default broker paths:
  `ws://<host>:9001/mqtt`, `mqtt://<host>:1883`.
- Payloads are UTF-8 JSON objects.
- **QoS 0** for every publish and subscribe (mqtt.js default; no retained messages). Held
  drive input repeats `move` at 5 Hz, so a lost `move` self-corrects; single-shot commands
  (`stop`, `gait`, `mode`, `pose`) are **not** repeated and can be lost on a bad link. Operators
  should re-send `stop` if telemetry does not show it. Moving `arana/cmd` to QoS 1 would be a
  contract change: propose it first, the firmware must match.
- A client sees its own publications on topics it subscribes to. The twin skips the echo of
  each command it sent, once, within 2 s; pending echoes are dropped on every reconnect, so an
  identical command from another controller is never mistaken for an echo after a link loss.

## Topics

| Topic | Direction | Payload |
| --- | --- | --- |
| `arana/cmd` | controller → body | `Command` |
| `arana/telemetry` | body → everyone | `Telemetry`, 30 Hz from the twin |
| `arana/brain/state` | brain → body | brain state (shape not defined yet; honored only in `auto`) |
| `arana/brain/stimulus` | anyone → brain | stimulus (reserved) |

## Commands (`arana/cmd`)

```json
{"kind":"move","forward":0.5,"turn":-0.2}
{"kind":"stop"}
{"kind":"gait","gait":"tetrapod"}
{"kind":"mode","mode":"manual"}
{"kind":"pose","pose":"hello"}
```

- `move`: `forward` and `turn` in −1..1. **turn positive = left**; a joystick pushed right
  sends a negative turn. Any `move` switches the body to `manual`; from `rest` it starts
  `tetrapod`. Bodies scale it to what the legs can do (twin: up to 0.029 m/s tetrapod,
  0.014 m/s wave).
- `stop`: forward = turn = 0, gait `rest`, cancels a running action.
- `gait`: `tetrapod` (diagonal pairs, 1.2 s cycle) · `wave` (one leg at a time, 2.4 s) ·
  `rest` (neutral stance).
- `mode`: `auto` (brain drives) · `manual` (operator drives). Default `auto`; 5 s without
  operator commands returns to `auto`.
- `pose` (**additive extension, S20**): runs one preset action. Names are the official firmware
  `/api/v1/action` names:

  | `pose` | Product label | Firmware table |
  | --- | --- | --- |
  | `fighting` | Fighting | `Servo_Prg_10` |
  | `standby` | Standby | `Servo_Prg_1` |
  | `pushup` | Push-Up | `Servo_Prg_11` |
  | `sleep` | Sleep | `Servo_Prg_12` |
  | `lie` | Lie Down | `Servo_Prg_8` |
  | `hello` | Greet | `Servo_Prg_9` + `Servo_Prg_1` |
  | `dance3` | Leg Raise | `Servo_Prg_15` |
  | `dance2` | Swing | `Servo_Prg_14` |
  | `dance1` | Relax | `Servo_Prg_13` |

  An action holds its last keyframe when it ends (firmware behavior). `move`, `stop` and `gait`
  cancel it and the body blends back to the neutral stance.

**Compatibility rules.** Bodies must ignore unknown `kind`s and invalid values (unknown gait,
mode or pose, non-numeric `move` fields); they must never throw or change state on them, and
such messages do not count as operator activity (they do not keep `manual` alive). A
body that does not implement `pose` simply ignores it. Unknown extra fields are ignored.

## Telemetry (`arana/telemetry`)

```json
{
  "t": 1760000000000,
  "x": 0.0, "y": 0.0, "z": 0.0, "yaw": 0.0,
  "distance": 1.24,
  "gait": "tetrapod",
  "mode": "manual",
  "joints": [45, 65, 45, 65, -45, 65, -45, 65]
}
```

- `t` epoch ms; `x`, `z` meters on the floor (world frame, +Z = forward at yaw 0); `y` is 0
  (reserved); `yaw` radians, heading vector `(sin yaw, cos yaw)`, positive = turned left.
- `distance`: HC-SR04 reading in meters (0.02–4.0), `null` = no echo.
- `joints`: 8 angles in **degrees**, order
  `FL_hip, FL_knee, FR_hip, FR_knee, RL_hip, RL_knee, RR_hip, RR_knee`.
  - hip: 0 = leg perpendicular to the body (firmware zero pose), positive = foot toward the nose.
  - knee: 0 = tibia in line with the horizontal femur, positive = foot down.
  - neutral stance (photographed pose, firmware walking standby): hips ±45, knees 65.

## Joint ↔ firmware servo mapping

From the official firmware (`0.SpiderBot/actionarray.h`): channels in order
`G14 G12 G13 G15 G16 G5 G4 G2`, zero pose `{135,45,135,45,45,135,45,135}`.
`raw = zero + sign · angle` (degrees):

| Channel | Joint | Zero | Sign |
| --- | --- | --- | --- |
| G14 | FR knee | 135 | − |
| G12 | FR hip | 45 | + |
| G13 | RR hip | 135 | + |
| G15 | RR knee | 45 | + |
| G16 | FL knee | 45 | + |
| G5 | FL hip | 135 | − |
| G4 | RL hip | 45 | − |
| G2 | RL knee | 135 | − |

Implemented and tested in `src/sim/servoMap.ts`. Per-robot trim (`Servo_Offset`, EEPROM) is
calibration and is applied by the firmware, not on the wire. The servo test panel shows the
raw degree of each channel next to the joint angle.

## Joint limits (twin)

Hip: front legs −40..90°, rear legs −90..40°. Knee: −30..110°. These stay inside the MG90S
0–180° travel around the firmware zero and contain every firmware keyframe.
