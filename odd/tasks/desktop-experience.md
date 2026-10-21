# Desktop experience — LAFVIN LA072 digital twin and test bench

Branch: `feat/base-system`. Builds on `odd/tasks/base-system.md` (S1–S12, completed; not reopened
except where noted below).

Full commissioned prompt: `docs/claude-desktop-prompt.md` (written on the T420, copied verbatim).

## Specs

L1 (user request, verbatim, Spanish original — Appendix A of the prompt):

> oye necesito que investigues sobre en lo que íbamos del proyecto ed iot de la araña, necestio que
> aparte de aquello, me crees un prompt para claude, para que el entorno de electron, quede perfecto,
> y no "aislop", entonces necesito:
>
> - que la araña sea idéntica a como se ve en imagen y se describe
>
> -que el entorno sea perfecto para poder probar la araña
>
> - que tenga sus mandos para poder manipularlo desde la pag
>
> eso hasta ahora, luego se hará la app android para poder controlar la araña desde el celular y
> esperando, que se pueda controlar desde el celular, si hay que usar servidor, que se use el t420
> que tiene todo conectado gracias a cloudflare, crea el prompt para claude, necesito que sea
> extremadamente detallado el prompt para que haga una buena pega

L2 (this session): "si, comienza con la fase 1, pero mejor haz todo de corrido, será mejor"

L3 (this session): "recuerda que todo lo que es potencia y ram, debe ejecutarse preferiblemente en el t420"

Protocol approval: the user commissioned the prompt, which allows exactly one additive protocol
change (`PoseCmd` wired into `Command`) plus the joint-semantics comment; L2 approves running it.

### Verified hardware facts (source → fact)

- Firmware `0.SpiderBot/actionarray.h` (official resource package linked from the manual):
  servo order `G14 G12 G13 G15 G16 G5 G4 G2`; mapping from the `Servo_Prg_9` comment:
  `0 RF knee, 1 RF hip, 2 RR hip, 3 RR knee, 4 LF knee, 5 LF hip, 6 LR hip, 7 LR knee`.
  Zero pose `{135,45,135,45,45,135,45,135}`; standby `{60,90,90,120,120,90,90,60}`.
  Keyframes for all nine preset actions; linear interpolation per keyframe over its `ms`.
- Manual p.49 + CAD p.36: at the zero pose all legs point straight sideways (parallel to each
  other) and the tibias are horizontal.
- Forward table cross-check: diagonal pairs (RF+LR, RR+LF) alternate; lift = knee toward 90.
- App screenshot (LA072_4) ↔ marketing names (LA072_3): Dance 1 = Relax (note icon),
  Dance 2 = Swing (waveform icon), Dance 3 = Leg raise (sparkle icon).
- Photos: femur is a horizontal acrylic arm (no fixed downward pitch); hip servos sit at the
  chassis corners with vertical shafts; knee servo rides on the tibia; NodeMCU PCB is black
  with a silver ESP-12F shield (kit photo), the blue PCB is the HC-SR04.
- Scale from the HC-SR04 (transducer pitch 26 mm) and the 18650 holder (21 mm wide): the robot
  is ≈ 85 mm tall in the photographed pose. The prompt's 178 × 137 × 58 mm envelope has no
  source (not in the manual, docs, or product page) and contradicts the photos; not used.

### Specs

- S13. Electron window: frameless 1280×800 (min 960×640), custom draggable 32 px titlebar with
  working minimize / maximize-restore / close via a sandboxed preload; browser build hides them.
- S14. One 2-DOF leg solver (hip yaw + knee pitch, passive horizontal femur) used by both the
  engine and the renderer; FK/IK round-trip, clamping, no NaN.
- S15. Joint semantics on the wire (order and length unchanged): per leg `[hip, knee]` degrees.
  hip 0 = leg perpendicular to the body (firmware zero), positive = foot toward the nose;
  knee 0 = tibia in line with the femur (horizontal), positive = foot down.
- S16. Spider model recognizable as the LA072 from `docs/reference/`: stacked black acrylic,
  four brass standoffs, black NodeMCU, expansion board, 18650 holder, cat-ear face with the
  HC-SR04, 8 MG90S, forked tibias, rubber feet, wires, ties, screws.
- S17. Walking: stance feet planted in world space (< 1 mm horizontal drift), swing feet clear
  the floor, limits respected, body motion emerges from the planted feet.
- S18. 2D collision with the arena colliders; the sonar ray uses the same colliders.
- S19. Test-bench arena: 10 cm / 1 m grid, calibration mat, distance markers to 4 m, box,
  cylinder, low wall, boundary markers, sonar cone + hit marker, procedural env map.
- S20. Nine preset actions played from the firmware keyframes; `PoseCmd` added to `Command`
  (additive); stop / move cancel an action.
- S21. Instrument UI: link (connect/disconnect, timeout, copy topics), drive (joystick, throttle,
  gait, STOP, keyboard), actions, servo test 4×2 matrix with calibration sliders, telemetry,
  packet log, environment toggles, camera presets; usable at 960×640.
- S22. Production desktop build loads offline with a CSP; deterministic screenshot command
  writes `docs/screenshots/{hero,front,top,side}.png`.
- S23. Docs: README, `docs/protocol.md`, `docs/remote-control.md`.

### Interpretations and deviations (recorded, not new requirements)

- REST keeps its protocol meaning ("legs planted: idle"); it settles the feet to the
  photographed neutral stance instead of folding the body. Folding is the Lie Down / Sleep actions.
- No body sway: the firmware gait has none; adding it would invent behavior.
- Actions hold their last keyframe (as the firmware does) until the next command; leaving an
  action blends back to the neutral stance over 0.5 s.
- CSP `connect-src` allows `ws:` / `wss:` because the operator types the broker URL (LAN,
  Tailscale or tunnel); a fixed host list would block the T420 at `ws://192.168.1.79:9001`.
- The sim keeps its own 30 Hz timer (it is the body and must publish telemetry while the window
  is hidden); the renderer interpolates between ticks.
- Front/rear brackets sit at different heights on the real kit; the twin uses one femur plane.

## Tasks

- [ ] T1 — S14, S15: `src/sim/legKinematics.ts`, servo mapping, tests. Route: inline, test-first.
- [ ] T2 — S17, S18: engine rewrite (gait planner, contact pose solver, collision, sonar). Route: inline.
- [ ] T3 — S20: actions from firmware tables + `PoseCmd`. Route: inline, test-first. High risk (contract).
- [ ] T4 — S16, S19: spider model, materials, arena, cameras. Route: inline, screenshot-verified.
- [ ] T5 — S21: UI. Route: inline.
- [ ] T6 — S13, S22: Electron preload/IPC/titlebar/window state/CSP/shots. Route: inline.
- [ ] T7 — S23: docs. Route: inline.
- [ ] T8 — independent verifier for the protocol change. Route: delegated reviewer.

## Log

- 2026-10-21: baseline on Garuda `3a2db8a`: `npm test` 28/28, lint 0 errors + 2 pre-existing
  `react(refs)` warnings in `src/App.tsx`, `npm run build` OK.
- 2026-10-21: T420 Mosquitto (runit, 1883 + 9001, `allow_anonymous false`): added broker user
  `conectoma` at the user's request; backup `/etc/mosquitto/passwd.bak-20261021-184329`.
  Verified from Garuda: WS LAN, WS Tailscale and TCP round trips OK, bad password rejected.
- 2026-10-21: reference images copied from the T420 (`docs/reference/`); manual and the official
  firmware package (Dropbox link in the manual) read in the scratchpad, not committed.
- 2026-10-21: heavy commands run on the T420 in a dedicated mirror `~/arana-iot-build`
  (Garuda has ~1 GiB free RAM); the user's `~/arana-iot` checkout there is not touched.
