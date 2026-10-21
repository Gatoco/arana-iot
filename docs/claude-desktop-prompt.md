# Claude Code prompt — Arana IoT desktop experience

> Copy this entire file into Claude Code from the repository root.
> Target repository: `/home/iwakura/arana-iot`
> Current branch: `feat/base-system`
> Artifact language: English. User-facing conversation: Spanish (Rioplatense) only if the user writes in Spanish.

---

## 0. Role and mission

You are Claude Code, a senior creative engineer working directly in this repository. Your job is to turn the current Arana IoT desktop app into a precise, hardware-faithful digital twin and a professional test bench for the LAFVIN LA072 quadruped spider robot.

This is not a landing page, not a sci-fi dashboard, and not a generic Three.js demo. It is an engineering instrument: a dark, quiet, precise environment where the spider is the hero, every part corresponds to real hardware, every control does something real, and every number comes from the simulation or the broker.

The user's standard is explicit: **no AI slop**. A render that looks like a generic chrome spider, a UI full of neon cards, fake telemetry, invented parts, meaningless gradients, or decorative HUD rings is a failure, even if it compiles.

Implement the work. Do not stop at a proposal. Read the repository, inspect the reference images, make the changes, run the checks, compare screenshots, and report evidence.

---

## 1. Non-negotiable constraints

1. **Hardware truth over invention.** The spider must match the LAFVIN LA072 kit shown in `docs/reference/` and described in this prompt. Do not invent joints, sensors, boards, legs, or decorative parts that the kit does not have.
2. **Exactly 4 legs and 8 servos.** Each leg has two MG90S servos: one hip servo with a vertical output shaft (leg yaw) and one knee servo with a horizontal output shaft (tibia pitch). The femur is a passive acrylic link. There is **no third servo** and **no active femur pitch at the hip**. The current model's coxa-yaw + femur-pitch + passive-tibia chain is physically wrong for this kit and must be replaced.
3. **One source of truth for kinematics.** The simulation and the renderer must use the same leg solver and the same joint angles. Do not let the visual model "look right" with a separate IK that diverges from telemetry.
4. **Protocol compatibility.** Do not change existing MQTT topics, payload field names, joint count, joint order, gait values, or mode values. You may add a backward-compatible `pose` command because `CMD_KIND.POSE` already exists but is not wired into the `Command` union. Document any extension.
5. **No new runtime dependencies** unless there is no reasonable alternative. The app already has React, Three.js, Tailwind, mqtt.js, Electron, Vitest, and oxlint. Do not add React Three Fiber, a state library, an icon library, a UI kit, an animation library, an external model loader, or a physics engine.
6. **Offline-first.** No runtime downloads of 3D models, HDRIs, fonts, textures, or icons. All visual assets are procedural or local. The production Electron build must work without a network connection.
7. **Do not touch `android/`.** The Android controller is a later task. Keep the protocol stable for it and document the handoff.
8. **Do not add a backend.** The broker is external (T420). The existing `scripts/broker.mjs` is a local development convenience only.
9. **No destructive git operations.** Do not commit, push, open a PR, rewrite history, or change the branch unless the user explicitly asks. Leave the working tree with the changes and a clear summary.
10. **Preserve completed work.** `odd/tasks/base-system.md` records completed specs S1–S12. Do not rewrite or reopen completed tasks unless your change invalidates them; if it does, say so explicitly and update only the affected entries.

---

## 2. Source of truth

### 2.1 Reference images (local, read these first)

Open these files before writing any code. They are the visual contract:

| File | What it shows |
|---|---|
| `docs/reference/LA072a.png` | Primary hero shot, 3/4 front. Overall silhouette, stance, face, leg layout. |
| `docs/reference/LA072_7.jpg` | Front view in motion. Leg splay, knee servos, forked tibias, face height. |
| `docs/reference/LA072_1.jpg` | Full kit and bill of materials: 8 MG90S, acrylic plates, ESP8266, expansion board, HC-SR04, screws, standoffs, rubber feet, cable ties, IR remote. |
| `docs/reference/LA072_2.jpg` | Hardware features: flexible tibia, circuit protection, charging, indicators, Wi-Fi, IR, ultrasound, MG90S. |
| `docs/reference/LA072_3.jpg` | The nine preset actions: Fighting, Standby, Push-Up, Sleep, Lie Down, Greet, Leg Raise, Swing, Relax. |
| `docs/reference/LA072_4.jpg` | App control layout and IR remote layout. Useful for control naming, not for copying the app UI. |
| `docs/reference/LA072_5.jpg` | Obstacle-avoidance scene with the HC-SR04. |
| `docs/reference/LA072_6.jpg` | Assembly steps and code screenshot. Confirms the leg/servo layout. |
| `docs/reference/LA072_8.jpg` | Open-source programming scene. |

If the user provides a different reference image, that image wins. If `docs/reference/` is missing, download the nine images from the product page before starting; do not proceed without a visual reference. If you cannot open the images with your tools, stop and ask the user to attach them; do not claim visual fidelity without comparing.

### 2.2 Manual and official pages

- Local manual: `/home/iwakura/manual_lafvin_spider_esp8266.pdf` (119 pages, 32 MB). Read the assembly and components sections if your tools can access the absolute path.
- Official docs: <https://lafvin-quadruped-spider-robot.readthedocs.io/en/latest/Introduction.html>
- Components: <https://lafvin-quadruped-spider-robot.readthedocs.io/en/latest/Components.html>
- Product page: <https://lafvintech.com/products/lafvin-quadruped-bionic-spider-robot-kit>

Do not fetch these pages at runtime in the app. They are research sources only.

### 2.3 Extracted hardware facts

Use these facts even if the PDF is unavailable:

- **Robot:** LAFVIN LA072 quadruped bionic spider robot kit, ESP8266-based, 8 × MG90S servos, HC-SR04 ultrasonic sensor, IR receiver, Wi-Fi, acrylic body.
- **Overall envelope:** approximately **178 mm wide × 137 mm long × 58 mm tall** in the neutral stance. Treat these as the target bounding box; tune link lengths and joint angles so the rendered silhouette matches the photos.
- **Mass:** approximately 0.5 kg with electronics, without the 18650 cell.
- **Body:** two black acrylic plates separated by four brass M3×25 standoffs; a top cover plate with a laser-etched LAFVIN mark; a bottom plate with cutouts for the servo bodies and the battery holder. Silver M3/M2 screws and nuts throughout.
- **Electronics:** blue ESP8266 NodeMCU board with a silver ESP-12F shield and micro-USB; black expansion board underneath with charging circuit, reverse-polarity protection, fuse, large capacitor, CHRG/STDBY/PWR LEDs, pin headers, and an 18650 battery holder. The kit does **not** include the 18650 cell.
- **Face:** a black acrylic "spider eye" face plate with two cat-ear tabs, two large circular eye holes, and a small rectangular mouth slot. The HC-SR04 sits behind it; its two silver cylindrical transducers protrude through the eye holes and read as eyes. The face plate is mounted at the front of the body, roughly at body height, and projects forward.
- **Legs (each):** one hip MG90S under the body at the corner, output shaft vertical; a passive black acrylic femur bolted to the servo horn; one knee MG90S at the distal end of the femur, output shaft horizontal and perpendicular to the femur; a black acrylic forked tibia driven by the knee servo; a black anti-slip rubber sleeve on the foot; visible brown/red/orange servo wires and black cable ties.
- **Servo:** MG90S, approximately 22.8 × 12.2 × 22.7 mm case, mounting tabs extend the width to about 32 mm, metal gears, 50 Hz PWM, 1.0 ms = 0°, 1.5 ms = 90°, 2.0 ms = 180°. Translucent brown case with a pink "MG90S" label.
- **Sensor:** HC-SR04, 5 V, 2–400 cm range, ±3 mm accuracy, 1 mm resolution, 10 µs trigger, 40 kHz, two transducers, blue PCB, 4-pin header.
- **IR:** IRM-3638T receiver, 38 kHz, up to 10 m, ±45°, active low. The kit includes a 21-key IR remote.
- **Power:** 18650 cell (not included), expansion board charging and protection.

The product description claims "six postures and nine preset actions." The nine named actions are the ones in `LA072_3.jpg`: Fighting, Standby, Push-Up, Sleep, Lie Down, Greet, Leg Raise, Swing, Relax. The "six postures" are not separately named in the source; treat the nine actions as the authoritative preset list and derive any posture poses from them. Do not invent extra named actions.

---

## 3. Current repository baseline

Read these before changing anything:

- `README.md` — current stack and architecture.
- `package.json` — scripts and dependencies.
- `src/protocol.ts` — MQTT contract and joint order.
- `src/sim/spiderModel.ts` — current placeholder model and `solveLeg`.
- `src/sim/engine.ts` — state machine and telemetry.
- `src/sim/gait.ts` — gait targets.
- `src/sim/world.ts` — arena and sonar raycast.
- `src/scene/SpiderView.ts` — current imperative Three.js view.
- `src/scene/legRig.ts` — current visual IK.
- `src/scene/heading.ts` — body rotation convention.
- `src/App.tsx` — layout and controls.
- `src/ui/Joystick.tsx`, `src/ui/Hud.tsx`, `src/ui/TelemetryPanel.tsx` — current UI.
- `src/runtime/TwinRuntime.ts`, `src/runtime/useTwin.ts` — engine/transport bridge.
- `src/net/transport.ts` — loopback and MQTT transports.
- `electron/main.cjs`, `electron/window.cjs`, `electron/window.test.mjs` — Electron shell.
- `scripts/desktop.mjs`, `scripts/broker.mjs` — dev scripts.
- `odd/tasks/base-system.md` — completed specs and tasks.

Known baseline facts:

- `npm test` currently passes 28 tests.
- `tsc -b` is clean.
- `npm run lint` has 0 errors and 2 pre-existing `react(refs)` warnings in `App.tsx`.
- `npm run desktop:build` produces `dist-desktop/`; `npm run desktop:start` runs `electron .`.
- The Electron window is frameless 1280×800 but has **no custom titlebar and no preload**, so the user cannot move, minimize, maximize, or close it with on-screen controls. Fix this.
- The current spider model is a stylized box-and-cylinder approximation. Replace it; do not preserve its proportions.
- The current leg chain is hip yaw + hip pitch + passive tibia. Replace it with hip yaw + knee pitch and a passive femur.
- The current `Command` union does not include `PoseCmd` even though `CMD_KIND.POSE` exists. Wire it.

---

## 4. Definition of done

The task is done only when all of the following are true:

1. The app opens in Electron as a frameless 1280×800 window with a custom, draggable titlebar and working minimize/maximize/close controls.
2. The 3D spider is immediately recognizable as the LAFVIN LA072 kit from `LA072a.png`: stacked black acrylic body, four brass standoffs, blue ESP8266 board, expansion board, 18650 holder, cat-ear face plate with two HC-SR04 eyes, four legs with passive acrylic femurs, four knee servos, four forked acrylic tibias, rubber feet, visible servo wires, cable ties, and silver screws.
3. The spider has exactly 4 legs and 8 visible MG90S servos. The kinematics are hip yaw + knee pitch, with a passive femur. No third servo, no hip pitch, no floating parts.
4. The spider stands at approximately 58 mm tall with a 178 × 137 mm footprint, and the neutral pose matches the reference photos.
5. Walking looks physical: stance feet stay planted in world space, swing feet lift and return, the body does not slide, and legs do not clip through the body or floor.
6. The arena is a usable test bench: calibrated 10 cm grid, 1 m major grid, distance markers up to 4 m, sonar cone and hit point, one box obstacle, one cylinder obstacle, boundary markers, and a collision response that prevents walking through obstacles.
7. The control panel drives the twin end to end: joystick, throttle, gait, nine actions, eight-servo calibration, camera modes, environment toggles, MQTT link, telemetry, and packet log.
8. The Electron app runs in production mode from `dist-desktop/` with no network, no console errors, and no missing assets.
9. `npm test`, `npm run lint`, `npm run build`, `npm run desktop:build` pass, and the new screenshot command produces the four required PNGs.
10. The screenshots at 1280×800 are visually compared against the reference images, and you report the comparison honestly. "It looks good" is not evidence; show the files and describe the differences.

---

## 5. Phase 0 — audit and baseline

Do this before editing:

```bash
cd /home/iwakura/arana-iot
git status --short
git log --oneline -5
node --version
npm --version
npm test
npm run lint
npm run build
```

Record the current commit, test count, and any pre-existing warnings. Do not fix unrelated warnings unless your change caused them.

Open the reference images. Then inspect the current scene in the browser:

```bash
npm run dev
```

If a dev server is already running, use it; do not kill another process without checking. Take a mental baseline of what is wrong: proportions, leg topology, materials, camera, UI density, Electron chrome.

Write a short implementation plan in your working notes (not a user-facing essay) with the files you will touch and the order. Then start.

---

## 6. Phase 1 — hardware-faithful spider model

### 6.1 Coordinate and unit contract

- Units are **meters**.
- Robot-local frame: **+X = robot right, +Y = up, −Z = robot forward (nose)**. This matches the current `SpiderView` and `bodyRotationY(yaw) = yaw + Math.PI`.
- World frame: **+X right, +Z forward at yaw 0**, matching `headingVector(yaw) = [sin(yaw), cos(yaw)]`.
- The body mesh's nose is local −Z; `bodyRotationY` rotates it so the nose leads in world space. Keep this convention and add a test that proves the face/HC-SR04 points along the direction of travel. Do not silently change the convention; if you refactor to +Z-forward, update every hip position, camera offset, test, and comment in the same change.
- Ground plane at `y = 0`. The root object sits at `(x, 0, z)`. All body parts are children of the body group, positioned in meters.
- Neutral stance target: overall envelope 0.178 m wide (X), 0.137 m long (Z), 0.058 m tall (Y). The top plate top is at about `y = 0.058`; the feet are at `y = 0`.
- Use a single `SPIDER` config object for all dimensions. Do not scatter magic numbers across the scene. Export it so tests can assert the envelope.

### 6.2 Leg topology (the most important correction)

The real kit has **two servos per leg**:

1. **Hip servo (yaw):** MG90S mounted under the body at the corner, output shaft vertical. It rotates the entire leg around the vertical axis. The femur is bolted to the servo horn.
2. **Knee servo (pitch):** MG90S mounted at the distal end of the femur, output shaft horizontal and perpendicular to the femur. It rotates the tibia in the leg's vertical plane.

There is **no servo that pitches the femur at the hip**. The femur's angle relative to the horizontal is fixed by the acrylic bracket, approximately 15–25° downward. The tibia is the only actively pitched link. This means the foot is not arbitrarily placeable in 3D: the leg has 2 DOF (yaw + knee), and the foot lies on a reachable arc. The gait and IK must respect that.

Implement a single solver in a new file, for example `src/sim/legKinematics.ts`:

```ts
export interface LegConfig {
  hip: { x: number; y: number; z: number };
  femurLength: number;      // hip pivot -> knee pivot
  tibiaLength: number;      // knee pivot -> foot
  femurPitch: number;       // fixed downward angle, radians
  hipYawLimits: [number, number];
  kneeLimits: [number, number];
}

export interface LegSolution {
  hipYaw: number;           // radians, relative to neutral
  kneePitch: number;        // radians, relative to femur
  foot: { x: number; y: number; z: number }; // robot-local
  reachable: boolean;
}

export function solveLegToFoot(
  config: LegConfig,
  target: { x: number; y: number; z: number },
): LegSolution;

export function footFromJoints(
  config: LegConfig,
  hipYaw: number,
  kneePitch: number,
): { x: number; y: number; z: number };
```

Requirements:

- Given a foot target, compute the hip yaw from the target's horizontal direction and solve the knee angle in the leg's vertical plane. If the target is unreachable, clamp the horizontal distance to the reachable interval, return `reachable: false`, and use the clamped solution. Never return `NaN`.
- `footFromJoints` must be the exact forward kinematics; a round-trip test `footFromJoints(solveLegToFoot(target)) ≈ target` must pass for reachable targets.
- Use the same solver in `TwinEngine.joints()` and in `SpiderView`. The renderer must not call a separate "visual IK".
- The telemetry order stays `FL, FR, RL, RR`, two values per leg: **hip yaw first, knee pitch second**. Keep the existing field order for wire compatibility. Update the comment in `src/protocol.ts` and the UI labels to "Hip / Knee". Do not change the array length or order.
- Servo limits: hip yaw approximately ±45° (tune to the photos), knee pitch approximately 0–120° relative to the femur. Clamp all commands and tests. The real MG90S can physically reach 0–180°, but the acrylic linkage limits the useful range; use conservative limits and document them.
- The neutral pose should reproduce the reference stance: front legs splayed forward-out, rear legs splayed backward-out, femurs slightly down, tibias steeply down, feet at the 0.178 × 0.137 m envelope corners. Start with hip pivots at `x = ±0.036`, `z = ∓0.027` (front negative Z, rear positive Z), femur length `0.036`, tibia length `0.058`, femur pitch `−18°`, and tune by overlaying your render on the reference. If your tuned values differ, update the config and the tests; do not leave stale numbers in comments.

### 6.3 Body geometry

Build the body from layered parts, not a single box. Use `RoundedBoxGeometry` or an extruded rounded rectangle for the plates; bevel edges by ~0.5–1 mm so they catch light like acrylic.

| Part | Approximate size (m) | Placement | Notes |
|---|---|---|---|
| Bottom plate | 0.096 × 0.004 × 0.072 | center `y ≈ 0.031` | Black acrylic. Cutouts for the four hip servo bodies and the battery holder. Four standoff holes. |
| Top plate | 0.096 × 0.004 × 0.072 | center `y ≈ 0.056` | Black acrylic. Rounded corners. Laser-etched LAFVIN mark, low contrast. Four screw holes. Slight overhang over the electronics. |
| Standoffs | Ø 0.006 × 0.023 | four corners, `x ≈ ±0.042`, `z ≈ ±0.030` | Brass, M3×25. Hexagonal or cylindrical; a subtle hex look is enough. |
| Face plate | 0.080 × 0.038 × 0.003 | front `z ≈ −0.050`, center `y ≈ 0.039` | Black acrylic, cat-ear silhouette, two 0.021 m eye holes centered around `y ≈ 0.046`, mouth slot ~0.010 × 0.004, mounting holes. Vertical, maybe tilted back 3–5°. |
| HC-SR04 PCB | 0.045 × 0.0016 × 0.020 | behind face, `z ≈ −0.044` | Blue PCB, 4-pin header, "HC-SR04" silkscreen. Two silver transducers Ø 0.016 × 0.012 protruding through the eye holes to `z ≈ −0.058`. Black mesh faces. |
| ESP8266 NodeMCU | 0.049 × 0.0016 × 0.026 | on top of bottom plate, centered, under top plate | Blue PCB, silver ESP-12F shield with "ESP-12F" text, micro-USB port accessible from the rear, black pin headers, reset button, tiny red/blue LEDs. |
| Expansion board | 0.070 × 0.0016 × 0.045 | under bottom plate, `y ≈ 0.028` | Black PCB, micro-USB, 2-pin power connector, fuse, capacitor, pin headers, CHRG/STDBY/PWR LEDs. Keep component count moderate. |
| 18650 holder | 0.075 × 0.020 × 0.040 | under bottom plate, centered | Black plastic box with an open slot and two spring contacts. No cell installed; the kit does not include one. |
| Hip servos | MG90S 0.0228 × 0.0122 × 0.0227 + tabs | under bottom plate at four corners | Output shaft vertical. Translucent brown case, black mid-band, pink "MG90S" label, silver horn. Servo body hangs below the plate. |
| Femurs | 0.036 long × 0.014 wide × 0.004 thick | from hip horn to knee | Passive black acrylic, tapered flat link, round boss at hip, clevis at knee, silver screws. Fixed downward pitch. |
| Knee servos | MG90S | distal end of each femur | Output shaft horizontal, pointing outward. Same materials/label. Body hangs along/below the femur. |
| Tibias | 0.058 long | knee to foot | Black acrylic **fork**: two slim struts diverging at the knee and converging at the foot, each ~0.004 thick × 0.008 wide. Rubber sleeve at the foot. Silver knee screw. |
| Feet | Ø 0.008 × 0.012 | tibia tip | Black anti-slip rubber, slightly bulbous. |
| Wires | 3-wire ribbon per servo | servo to body | Brown/red/orange, gentle catenary curves, routed along the femur, 1–2 black cable ties per leg. No clipping through acrylic. |
| Screws | M2/M3 button-head | plate corners, femur ends, face, knee | Silver metal, hex socket. Use instancing or shared geometry; ~25–30 screws. |
| LEDs | tiny emissive dots | ESP8266, expansion board | Red CHRG, green STDBY, blue PWR; low intensity, no bloom soup. |

Do not add a battery, a camera, extra sensors, a second ultrasonic sensor, RGB LED strips, or any part not in the kit.

### 6.4 Materials and color

Use a restrained, physically plausible palette derived from the photos, not a neon palette:

- Black acrylic: `#0a0c10` to `#11151b`, roughness ~0.42, metalness 0, clearcoat ~0.6, clearcoat roughness ~0.35. Edges should catch a cool rim light.
- Silver screws/nuts: `#c9ced6`, metalness 0.95, roughness 0.28.
- Brass standoffs: `#b08d57`, metalness 1.0, roughness 0.32.
- Blue PCB: `#123f8a` / `#0e2f6b`, roughness 0.55, metalness 0.1; white silkscreen, gold pads.
- Servo case: translucent brown `#5a3a2a`, opacity ~0.85, roughness 0.35, clearcoat; black mid-band; pink label `#d81b8c` with black "MG90S" text.
- HC-SR04 transducers: silver `#d7dde6`, metalness 0.9, roughness 0.25; black mesh face `#0a0a0a`, roughness 0.9.
- Rubber: `#0a0a0a`, roughness 0.95.
- Wires: brown `#6b3f1d`, red `#c0392b`, orange `#e67e22`, roughness 0.6.
- Avoid saturated cyan/purple on the robot itself. The robot is black, silver, brass, blue PCB, pink labels, and warm wires. The teal accent belongs to the UI and the test grid, not to the hardware.

Use `MeshPhysicalMaterial` for acrylic and `MeshStandardMaterial` for the rest. Reuse materials; do not create one material per mesh. Generate labels with `CanvasTexture` at 256×256 or 512×256, `SRGBColorSpace`, and anisotropy. No external fonts; use a system sans-serif. Text must be subtle and legible only up close; do not plaster labels everywhere.

### 6.5 Assembly hierarchy

Use a clean hierarchy so animation is simple and debuggable:

```
root (position = world x, 0, z; rotation.y = bodyRotationY(yaw))
  body
    bottomPlate
    topPlate
    standoffs
    electronics
    batteryHolder
    face
      hcSr04
    hipServo_FL / FR / RL / RR
      femur_FL
        kneeServo_FL
          tibia_FL
            foot_FL
      wires
```

Each leg root is at its hip pivot. The hip group rotates around Y. The femur is fixed within the hip group (with its fixed downward pitch). The knee group rotates around the local horizontal axis. The tibia and foot are children of the knee group. The wires can be children of the hip/femur, but they must not stretch incorrectly when the knee bends; route them from the body to the femur with a slack loop, and from the femur to the knee with a short loop. If full wire animation is too complex, use two segments: body-to-knee along the femur, and a short knee loop. Do not let wires float.

Use `Object3D.name` for every meaningful node. Add a debug mode that prints the hierarchy and dimensions; tests can assert names and counts.

### 6.6 Visual fidelity checks

After the model is built:

- Render a front view and a 3/4 view at 1280×800.
- Place the render next to `LA072a.png` and `LA072_7.jpg`. Compare:
  - Overall silhouette and stance.
  - Body width vs. leg span.
  - Face height and eye size.
  - Femur/tibia proportions and knee servo placement.
  - Number and placement of servos.
  - Visible wires and cable ties.
  - Colors and material response.
- If the silhouette is wrong, fix the geometry before adding detail. Do not hide a wrong silhouette under textures or lighting.

A human should be able to say "that's the LAFVIN spider" without reading a label. If it still reads as a generic spider robot, the task is not done.

---

## 7. Phase 2 — gait, physics, and the test arena

### 7.1 Gait with 2-DOF legs

The current gait generates arbitrary foot targets with a lift, which assumes 3 DOF. Rework it so it respects the real leg:

- The hip yaw points the leg's vertical plane at the foot's horizontal target.
- The knee angle is solved so the foot reaches the target's horizontal distance at the resulting height. Because the leg has only 2 DOF, the foot height is a consequence of the knee angle; do not independently command a foot Y and expect it to be reachable.
- For a swing, shorten the leg (increase knee flexion) so the foot lifts, then extend it to plant. The foot should trace a shallow arc, not teleport.
- During stance, the foot must remain planted in world space while the body moves. Compute the body displacement from the stance feet, or verify that stance foot world positions stay within 1 mm during stance. If the body slides, fix it.
- Keep the existing gait names and periods: `tetrapod` (1.2 s), `wave` (2.4 s), `rest`. Keep the existing phase offsets if they produce a stable diagonal gait; adjust only if the 2-DOF constraint requires it.
- Add a small body sway (2–4 mm lateral, 1–2 mm vertical) synchronized with the gait, but keep it subtle. The real robot shifts its mass; it does not bounce.
- Turn in place: differential stride left/right. Full turn should be smooth and should not cross the legs. Clamp yaw rate.
- Rest pose: legs folded, body lowered to about 0.035 m, feet tucked. Do not just zero all joints if that leaves the legs splayed.

Add tests:

- Forward kinematics/inverse kinematics round trip for reachable targets.
- Unreachable target clamps, no `NaN`.
- Stance foot world position variance < 1 mm during stance over a full cycle.
- Swing foot clears the floor by at least 5 mm and returns to 0 ± 0.5 mm.
- No joint exceeds its limits over 10 seconds of each gait.
- Body position/heading changes monotonically for a constant forward/turn command (no oscillation or drift).

### 7.2 Collision

The current engine senses obstacles but walks through them. Add simple 2D collision:

- Represent the arena as a set of colliders: four boundary walls, one AABB box, one circle (cylinder), and optionally the pillar footprints.
- The spider body is a circle of radius ~0.07 m (or an oriented rectangle if you prefer, but a circle is enough for this scale).
- After integrating the pose, resolve penetration: push the body out along the minimum translation vector and zero the forward component into the obstacle (or slide along it). Do not teleport or jitter.
- The sonar ray must use the same collider set. If the ray hits a collider, return the distance to the hit; if not, `null`.
- Add tests: driving straight into the box stops at a stable distance; sliding along a wall does not penetrate; sonar distance matches the geometric distance within 1 mm for axis-aligned cases.

Do not add a physics engine. This is a 2D kinematic sim; a few lines of geometry are enough.

### 7.3 Arena visuals

The arena is a **test bench**, not a game level:

- Floor: 12 × 12 m dark matte plane, color `#070a0e`, roughness ~0.9. Subtle radial gradient or noise to avoid a flat void; no reflections.
- Grid: 1 m major lines in muted teal (`#1f6f7a`, opacity ~0.35), 0.1 m minor lines in `#0e1a20` (opacity ~0.18), 5 m accent lines slightly brighter. Fade with distance via fog. Do not let the grid dominate the spider.
- Calibration mat: a 1 × 1 m plane under the origin with a 10 cm grid and 5° angle ticks, dark gray lines, low contrast. Procedural CanvasTexture. This gives a visual scale for servo calibration.
- Distance markers: ticks and labels at 0.5, 1, 2, 3, and 4 m along the +Z axis (sonar range). Use thin geometry and small text sprites; no giant floating numbers.
- Origin: a small ring and red X / blue Z axes, muted, not neon.
- Boundary: low-profile markers at the 6 m edges, not tall walls that block the camera.
- Obstacles: the existing box at `(0, 1.5)` size `0.4 × 0.3 × 0.4`, plus a cylinder of radius 0.15 m at `(0.8, 2.5)` and a low wall at `z = 3.5`. Make them visually distinct but muted: box `#1c1712` with amber edges, cylinder `#14171d` with a thin teal band, wall `#14171d`.
- Pillars: keep the four corner pillars if they help orientation, but make them low-contrast and out of the main camera path. Do not let them look like a dungeon.
- Sonar: a translucent cone from the sensor, scaled to the measured distance, opacity ~0.10, plus a small hit marker (ring/dot) at the hit point. When no echo, fade the cone to the max range with low opacity. Do not use a bright laser beam.
- Lighting: one key spotlight from front-left-top (warm-neutral), one cool fill from the right, one cool rim from behind. One shadow-casting light only; shadow map 2048; soft PCF. Add a subtle contact shadow under the body and feet. The black acrylic must have specular highlights and readable edges, not a silhouette. Generate a small procedural environment map with `RoomEnvironment` + `PMREMGenerator` (no external HDR) and set `scene.environment` so acrylic, silver, and brass have reflections; keep the visible background as the dark gradient dome, not the room.
- Background: a dark vertical gradient dome from `#05070a` to `#0b1118`, plus fog. No stars, no particles, no hexagons, no scanlines.
- No postprocessing bloom by default. If you add a tiny bloom for LEDs, keep it under 0.15 and make it optional. Prefer clean tone mapping.

### 7.4 Camera

- Default view: a 3/4 front hero shot that shows the face and the leg layout. Frame it so the leg span fills roughly 65–75% of the viewport width and the face/body are clearly readable. This is the first impression; it must look like a product photo, not a distant speck. A starting camera is `(0.16, 0.11, −0.20)` looking at `(0, 0.03, 0)`; tune the distance until the leg span fills the frame without cropping.
- Camera modes:
  - **Orbit:** OrbitControls around the body, damping, min distance 0.15 m, max 6 m, max polar 88°, no going below the floor. Pan disabled or target-locked to the body.
  - **Follow:** behind and above the body, offset ~(0, 0.22, 0.40) in the body's forward frame, look at body center + 0.03 m up, smooth exponential damping. When the body turns, the camera follows with a slight lag; it must not snap.
  - **Front / Top / Side presets:** fixed views for inspection and screenshots. Front at `(0, 0.10, −0.30)` looking at the body; top at `(0, 0.35, 0)`; side at `(0.35, 0.10, 0)`. Tune each so the spider fills most of the frame; these are inspection views, not distant overviews.
- FOV 50°, near 0.01, far 100. Clamp the camera above the floor. Do not let it clip through the spider.
- If the user drives while in orbit, keep orbit (the user chose it); show a "Follow" button. If the user has never chosen a camera mode and starts driving, switch to follow once. Do not fight the user.
- Resize handling: update aspect and pixel ratio; cap DPR at 2.

### 7.5 Render loop and performance

- One animation loop. Do not run a separate `setInterval` for the sim and a separate rAF for the render if that causes jitter. Use `renderer.setAnimationLoop` with a fixed-step accumulator:
  - Fixed sim step: 1/30 s.
  - Clamp frame delta to 0.1 s; max 5 sim steps per frame.
  - Render every frame.
  - React UI snapshot at 10 Hz, not 60 Hz. The 3D view reads the runtime directly or via a ref; do not re-render React per frame.
- Performance budget at 1280×800 on the target Linux machine:
  - ≥ 55 fps average.
  - Draw calls < 250.
  - Triangles < 150k.
  - No per-frame allocations in the hot path (reuse vectors, quaternions, matrices).
  - One shadow-casting light; shadow map 2048.
- Use instancing for repeated screws/standoffs if draw calls grow. Reuse geometries/materials. Dispose everything on unmount.
- Pause rendering when the window is hidden or minimized; resume on show. Do not accumulate a huge delta on resume.

---

## 8. Phase 3 — controls and instrument UI

### 8.1 Design direction

The UI is a **precision instrument panel**, not a sci-fi dashboard:

- Dark neutral surfaces: background `#05070a`, panel `#0a0e13`, raised `#0e141b`, border `#1b2632`.
- Text: primary `#dbe4ee`, muted `#8494a6`.
- Accent: teal `#2dd4bf` only for active states and the grid. Warning: amber `#f59e0b`. Danger: red `#f87171`. Success: green `#34d399`.
- Typography: system UI for labels; `ui-monospace` for numbers. 11–13 px labels, 11 px uppercase section headers with 0.08em tracking. No external fonts.
- Density: 28–32 px controls, 6 px radius, 1 px borders, 8 px gaps. No 24 px rounded cards, no drop-shadow stacks, no glassmorphism.
- No emoji. No icon-only buttons without a tooltip and aria-label. Inline SVG icons only; no icon library.
- No landing-page hero, no marketing copy, no fake stats, no "AI-powered" labels, no decorative gradients. The 3D view is the hero; the panel is a tool.
- Motion: 120–160 ms transitions; respect `prefers-reduced-motion`. No constant pulsing except a slow, subtle link status dot.

### 8.2 Layout at 1280×800

- Titlebar: 32 px, custom, draggable, with window controls (see Phase 4).
- Main area: 3D viewport flex-1; right control panel 320 px (resizable 300–380 px).
- Bottom status bar: 24 px across the app; link state, broker, tick rate, fps, mode.
- Viewport overlays:
  - Top-left: compact HUD with mode (AUTO/MANUAL), gait, X/Z, distance. 2×2 or 4×1; no giant panel.
  - Top-right: camera mode buttons (Orbit / Follow / Front / Top / Side), compact.
  - Bottom-left: keyboard hint (`WASD drive · Space stop · F follow · R reset`), muted, dismissible.
  - Bottom-right: optional render stats (fps, draw calls, triangles) in a debug toggle.
- Right panel sections, in this order: **Link**, **Drive**, **Gait & Actions**, **Servo Test**, **Telemetry**, **Debug**. Use compact section headers; the panel scrolls. At 960×640, the panel becomes a bottom drawer or a collapsible overlay; controls must remain reachable. Test both sizes.

### 8.3 Link section

- Segmented control: **Loopback** / **MQTT**.
- Broker URL input, default `ws://localhost:9001/mqtt`. Accept `ws://`, `wss://`, hostnames, and paths. Placeholder examples:
  - Local: `ws://localhost:9001/mqtt`
  - T420 Tailscale/LAN: `ws://100.66.97.18:9001/mqtt`
  - Cloudflare: `wss://mqtt.t420.dev/mqtt`
- Username/password inputs. Do not hardcode credentials. Do not log the password.
- Connect/Disconnect button; status dot; broker name; last error; reconnect state. Disable the button while connecting; show a timeout after 10 s, not an infinite spinner.
- "Copy topics" button copies the four topic names. Useful for debugging.
- The loopback transport is always connected and needs no credentials.
- Do not add a "server" or "start broker" button to the Electron app; the broker is external. The local dev broker is `npm run broker`.

### 8.4 Drive section

- Circular joystick, 120 px, pointer and touch, `touch-action: none`, deadzone 0.08. X = turn, Y = forward. Right = turn right (negative turn per protocol, positive turn = left). Up = forward. Release returns to center and sends `stop`.
- Throttle slider 0–100%, default 70%. Scale the joystick output by throttle. Show the numeric value.
- Gait segmented control: **Tetrapod / Wave / Rest**. `Rest` is a gait, not an action.
- **STOP** button, red, prominent, 32 px; sends `{kind:"stop"}` and cancels any action. Keyboard `Space`.
- Keyboard: `W/S` forward/back, `A/D` turn left/right, `Shift` boost (if you implement it), `Space` stop, `F` follow, `O` orbit, `R` reset pose/position, `1/2/3` gaits. Do not hijack keys while an input is focused. Show a `?` help popover with the full list.
- Any drive input switches the engine to manual mode (existing behavior). Do not change that semantics.

### 8.5 Gait and actions

- Nine action buttons, grouped as in `LA072_3.jpg`:
  - Fighting, Standby, Push-Up
  - Sleep, Lie Down, Greet
  - Leg Raise, Swing, Relax
- Each action is a short keyframe sequence over the 8 joints. Implement a data-driven player in `src/sim/actions.ts`:
  ```ts
  export interface ActionFrame {
    t: number;              // 0..1 normalized time
    joints: number[];       // 8 angles, hip/knee order
  }
  export interface ActionSpec {
    name: string;
    duration: number;       // seconds
    loop: boolean;
    frames: ActionFrame[];
  }
  ```
- Add `PoseCmd` to `src/protocol.ts`:
  ```ts
  export interface PoseCmd {
    kind: typeof CMD_KIND.POSE;
    pose: ActionName;
  }
  export type Command = MoveCmd | StopCmd | GaitCmd | ModeCmd | PoseCmd;
  ```
  The payload is an additive protocol extension: an ESP firmware that validates `kind` can ignore it; document the extension and do not assume the current firmware supports it.
- During an action, the gait is paused; after the action, return to the previous gait and mode. Any move/stop cancels the action. Actions must not fight operator input.
- If you cannot implement all nine with credible keyframes, implement the data-driven player and at least Standby, Lie Down, Push-Up, Greet, Relax; mark the others as "not implemented" in the UI with a disabled state and a tooltip. Never fake an action with a random wiggle and call it "Fighting."
- The action player must respect joint limits and return to a neutral pose without snapping. Tests: each action starts/ends within limits, duration is positive, no `NaN`, and a stop cancels it.

### 8.6 Servo test and calibration

- Replace the generic 8 vertical bars with a 4×2 joint matrix:
  - Rows: FL, FR, RL, RR.
  - Columns: **Hip** (yaw, −45..45°) and **Knee** (pitch, 0..120°).
  - Each cell: numeric degrees, a horizontal bar with a center tick for hip, a min/max label for knee, and a slider in calibration mode.
- Calibration mode:
  - Toggle "Servo test" (warning: disables gait and actions).
  - 8 sliders, one per joint, with numeric inputs. "Center all" sets the neutral pose. "Apply" sends the joint angles to the twin (and to the broker if connected? Only if you define a safe command; otherwise keep it local and document).
  - A "Read pose" button copies the current telemetry angles into the sliders.
  - Limits are enforced; out-of-range values are clamped and shown.
- This is essential for testing the real kit's servo calibration. Make it usable, not buried.
- Do not add a "calibrate" button that writes to hardware; the twin has no hardware yet. Keep it local.

### 8.7 Telemetry

- Show: pose X/Z, heading (degrees), speed (m/s), distance (cm or "no echo"), gait, mode, link, tick rate, fps, packet counts, and the 8 joint angles.
- All values come from the engine/transport. No fake data. If a value is unavailable, show `—`, not a random number.
- Distance: show cm with 0 decimals when < 4 m; "no echo" when `null`; clamp the visual bar to 4 m.
- Mode: `AUTO` teal, `MANUAL` amber. Do not use red for manual.
- Link: connected green, connecting amber, disconnected muted, error red with the error message.
- Packet log (Debug section): a scrollable list of the last 50 messages, with direction (IN/OUT), topic, JSON payload, and timestamp. Pause/clear. This is a test tool; keep it compact and monospaced. Do not log credentials.

### 8.8 Environment toggles (Debug)

- Grid, axes, sonar cone, contact shadow, render stats, wireframe (debug only), and "reset camera."
- Use a small popover or disclosure, not a giant settings page.
- Persist UI preferences (camera mode, panel width, toggles) in `localStorage` with a versioned key. Do not persist broker passwords.

### 8.9 Accessibility

- All controls reachable by keyboard; visible focus rings.
- Joystick has an accessible alternative: forward/turn sliders or buttons; do not make it the only way to drive.
- ARIA labels for icon buttons; `aria-pressed` for toggles; `role="status"` for link status.
- Color is never the only indicator; pair it with text/icons.
- Respect `prefers-reduced-motion`: disable camera damping? Keep damping but reduce nonessential animations; no pulsing.
- Contrast: body text at least 4.5:1 on the panel. Test with a contrast checker if available.

---

## 9. Phase 4 — Electron shell

### 9.1 Window

- Default size **1280×800**, minimum **960×640**, resizable, frameless (`frame: false`), background `#05070a`, `show: false` until `ready-to-show`.
- `title: "Arana IoT"`, `autoHideMenuBar: true`, `Menu.setApplicationMenu(null)`.
- `webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `preload: path.join(__dirname, "preload.cjs")`. Do not enable `nodeIntegration`, `webviewTag`, or `allowRunningInsecureContent`.
- Single instance lock: a second launch focuses the existing window.
- Persist window bounds in `app.getPath("userData")/window-state.json`; restore on launch, clamp to a visible display. Handle multiple displays and display removal. Write a pure `clampWindowBounds(bounds, displays)` function and test it.
- Handle `window-all-closed` (quit except macOS), `activate` (recreate), `render-process-gone` (log; optionally show a reload dialog), and `unresponsive` (log).
- External links: `setWindowOpenHandler` denies and opens `http/https` in the system browser; `will-navigate` prevents navigation away from the app URL. Do not open arbitrary `file://` or `javascript:` URLs.

### 9.2 Preload and IPC

Create `electron/preload.cjs`:

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onMaximizedChange: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on("window:maximized-changed", handler);
    return () => ipcRenderer.removeListener("window:maximized-changed", handler);
  },
});
```

- Use `ipcMain.handle` for the four commands. Validate the sender: only the app's main window can call them. Do not expose arbitrary IPC or `ipcRenderer` itself.
- Send `window:maximized-changed` on `maximize`/`unmaximize`.
- The renderer must work in a browser too: `window.desktop` is optional. If absent, hide the custom window controls or render them disabled; do not crash. This keeps `npm run dev` usable in a browser and the PWA viable.
- Add `electron/preload.test.mjs` or extend `electron/window.test.mjs` to assert the exposed API shape? A preload test in Node is awkward; at minimum, test the pure window-state clamp and the window options. A static test can read `preload.cjs` and assert it exposes only the expected keys, but do not over-engineer.

### 9.3 Custom titlebar

Create `src/ui/TitleBar.tsx`:

- 32 px height, full width, background `#070a0e`, bottom border `#141c25`.
- Left: a small 12 px teal mark (simple square or a minimal spider glyph drawn with SVG), `ARANA` in 11 px uppercase tracking, and `IoT digital twin` muted.
- Right: link status (dot + `LOOPBACK`/`MQTT`), then window controls:
  - Minimize: horizontal line.
  - Maximize/Restore: square or overlapping squares, toggles based on `isMaximized`.
  - Close: X; hover background `#7f1d1d`, icon white.
- `-webkit-app-region: drag` on the bar; `-webkit-app-region: no-drag` on all buttons and interactive elements. Double-click the bar toggles maximize.
- Use `window.desktop?.platform` to adjust: on macOS, if you use native traffic lights, hide the custom controls and add left padding; on Linux/Windows, show them. The primary target is Linux; ensure it looks correct there.
- Do not put the titlebar inside the 3D canvas; it is a separate row above the main area. The 3D canvas must not be draggable.
- The titlebar must not cause the window to be moved when clicking the link status or buttons.

### 9.4 Packaging and scripts

- Keep `desktop:build` and `desktop:start`. Add:
  - `"desktop:shots": "node scripts/shots.mjs"` (screenshot mode; see Phase 6).
  - Optional `"desktop:package"` only if you can do it without adding a heavy dependency. Do not add electron-builder unless the user approves; a runnable `dist-desktop/` is the acceptance criterion, not an installer.
- `scripts/desktop.mjs` should keep working: starts Vite on 5173, waits for it, starts Electron with `ELECTRON_START_URL`, kills Vite on exit. Make sure it handles Ctrl+C and child process errors without leaving orphan processes.
- `scripts/shots.mjs` should launch Electron in capture mode, optionally under `xvfb-run` if no display is available, and write the PNGs. Do not require Playwright.

### 9.5 Security and production

- In production, load `dist-desktop/index.html` with `base: "./"` (already configured). Verify all assets resolve with `file://`.
- Add a Content-Security-Policy that works in production and does not break Vite dev. Prefer `session.defaultSession.webRequest.onHeadersReceived` in production with:
  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self' ws://localhost:9001 wss://mqtt.t420.dev;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  ```
  If Tailwind/Vite needs inline styles, keep `'unsafe-inline'` for styles only. Do not add `'unsafe-eval'` in production. Verify the app still loads.
- Disable devtools in production unless the user explicitly opens them; enable F12/Ctrl+Shift+I only in dev. Add F11 fullscreen in both.
- Do not ship source maps? Optional; Vite default is fine. Do not ship secrets.
- `app.setName("Arana IoT")`, `app.setAboutPanelOptions`, and a local icon. Use `public/favicon.svg` or generate a simple icon; do not add a random logo.

---

## 10. Phase 5 — protocol and remote-control readiness

### 10.1 Protocol contract

Do not change the existing contract. Document it in `docs/protocol.md` with exact JSON examples:

- Topics: `arana/cmd`, `arana/telemetry`, `arana/brain/state`, `arana/brain/stimulus`.
- Commands:
  ```json
  {"kind":"move","forward":0.5,"turn":-0.2}
  {"kind":"stop"}
  {"kind":"gait","gait":"tetrapod"}
  {"kind":"mode","mode":"manual"}
  {"kind":"pose","pose":"greet"}
  ```
- Telemetry:
  ```json
  {
    "t": 1760000000000,
    "x": 0.0, "y": 0.0, "z": 0.0, "yaw": 0.0,
    "distance": 1.24,
    "gait": "tetrapod",
    "mode": "manual",
    "joints": [0, 90, 0, 90, 0, 90, 0, 90]
  }
  ```
- Joint order: `FL_hip, FL_knee, FR_hip, FR_knee, RL_hip, RL_knee, RR_hip, RR_knee`, degrees.
- `turn` sign: positive = left. The joystick right must send a negative turn. Add a test.
- QoS: keep the current behavior. Document it. If the current code uses QoS 0, do not silently switch to QoS 1; the ESP firmware may not match. If you believe QoS 1 is required for commands, propose it to the user first.
- Unknown command kinds must be ignored, not crash. Unknown gait/mode values must be ignored (the current `8023e83` fix). Add tests.

### 10.2 T420 broker and Cloudflare Tunnel (documentation, not implementation)

The user's server is the **T420** (Tailscale `100.66.97.18`), which already runs Cloudflare Tunnel for other services. The Android app will connect through it later. Do not provision or modify the T420 in this task. Document the target architecture in `docs/remote-control.md`:

- Mosquitto on T420:
  ```conf
  # /etc/mosquitto/conf.d/arana.conf
  listener 1883 0.0.0.0
  protocol mqtt
  listener 9001 0.0.0.0
  protocol websockets
  allow_anonymous false
  password_file /etc/mosquitto/arana.passwd
  ```
  Restrict 1883/9001 with the firewall to Tailscale/LAN; do not expose them to the public internet.
- Cloudflare Tunnel ingress:
  ```yaml
  tunnel: <TUNNEL_ID>
  credentials-file: /home/iwakura/.cloudflared/<TUNNEL_ID>.json
  ingress:
    - hostname: mqtt.t420.dev
      service: http://localhost:9001
    - service: http_status:404
  ```
  DNS route: `cloudflared tunnel route dns <tunnel> mqtt.t420.dev`. Cloudflare proxies WebSocket automatically; the client URL is `wss://mqtt.t420.dev/mqtt`. The hostname `mqtt.t420.dev` is an example; create it on the T420 if it does not exist.
- Security: TLS terminates at Cloudflare; Mosquitto sees plaintext on localhost. Use MQTT username/password, no anonymous access, strong secrets, and no public 1883. For a university project, document that Cloudflare Access service tokens with Paho WebSocket custom headers are possible but add complexity; do not pretend it is configured. Never commit credentials.
- Android handoff (later, not now):
  - Kotlin + Eclipse Paho `MqttAsyncClient("wss://mqtt.t420.dev/mqtt", clientId, MemoryPersistence())`.
  - `MqttConnectOptions`: username/password, `cleanSession = true`, `automaticReconnect = true`, `connectionTimeout = 10`, `keepAliveInterval = 30`.
  - Subscribe `arana/telemetry` (QoS 0); publish `arana/cmd` (same QoS as the twin; document it).
  - Store broker credentials in `EncryptedSharedPreferences`, not in source.
  - `INTERNET` permission; TLS via system trust store (Cloudflare's edge certificate is publicly trusted).
  - The login screen remains local SQLite + SHA-256 + salt; it is not broker auth.
- The Electron app must accept `ws://localhost:9001/mqtt`, `ws://100.66.97.18:9001/mqtt`, and `wss://mqtt.t420.dev/mqtt`. Test the local one; do not require the tunnel to be live for the desktop task.

### 10.3 Brain bridge

Do not implement the fly-brain connectome in this task. Preserve the `BrainBridge` extension point and the auto/manual semantics. If auto mode has no brain messages, the body stays idle. Do not invent brain behavior or fake auto movement. Document the message shape you expect, but do not change the protocol without the user's approval.

---

## 11. Phase 6 — tests, screenshots, docs

### 11.1 Tests

Run the existing suite first. Add focused tests, not a test pyramid:

- `legKinematics.test.ts`: round trip, clamping, no NaN, joint limits, neutral pose envelope.
- `gait.test.ts`: stance foot planting, swing clearance, no limit violations, monotonic body motion.
- `collision.test.ts`: box stop, wall slide, sonar distance.
- `actions.test.ts`: each implemented action returns to neutral, limits, cancel on stop.
- `protocol.test.ts`: `PoseCmd` accepted, unknown kinds ignored, joint order length 8, turn sign.
- `heading.test.ts`: face points along heading; `bodyRotationY(0) = π`.
- `window.test.mjs`: window options, preload path, sandbox/context isolation, clamp bounds.
- UI math tests: joystick deadzone, turn sign, servo bar normalization, no division by zero.

Do not add a browser test framework or Playwright just for this. The screenshot mode is the visual check.

### 11.2 Screenshot mode

Add a deterministic screenshot command. The exact mechanism is yours, but it must:

- Launch the production desktop build (or the dev server with a fixed URL) at 1280×800.
- Set a fixed neutral pose, fixed camera preset, fixed lighting, and disable random animations.
- Write four PNGs:
  - `docs/screenshots/hero.png` (3/4 front)
  - `docs/screenshots/front.png`
  - `docs/screenshots/top.png`
  - `docs/screenshots/side.png`
- Work on this Linux host; if no display is available, use `xvfb-run -a`.
- Print the renderer stats (draw calls, triangles, fps) to stdout for the report.
- Not require a human click. If Electron's `capturePage` is used, wait for a `scene:ready` signal from the renderer and a short settle delay.

Add `npm run desktop:shots` to `package.json`. Document it in `README.md`.

### 11.3 Visual comparison

Open the four screenshots and the reference images. Compare honestly:

- Does the silhouette match?
- Are the proportions right?
- Are all 8 servos visible and in the right places?
- Does the face read as the cat-eye HC-SR04 panel?
- Are the tibias forked, not simple rods?
- Are the wires and cable ties visible but not messy?
- Does the black acrylic read as acrylic, not flat black?
- Is the scene too dark, too neon, or too busy?

If something is off, fix it and re-shoot. Do not declare success from a single tiny screenshot or from code alone.

### 11.4 Documentation

Update:

- `README.md`: what the app is, how to run (`dev`, `desktop`, `desktop:build`, `desktop:start`, `desktop:shots`, `broker`), controls, architecture, protocol summary, screenshots, limitations, T420/Cloudflare pointer.
- `docs/protocol.md`: exact topics, payloads, joint order, QoS, compatibility rules.
- `docs/remote-control.md`: T420 Mosquitto + Cloudflare Tunnel + Android handoff.
- `odd/tasks/desktop-experience.md`: create this new feature doc for the work, with specs, tasks, and a `## Log` containing the user's original request verbatim (Spanish) and your evidence. Leave `odd/tasks/base-system.md` intact and reference it; do not rewrite completed tasks.
- `docs/screenshots/`: the four PNGs.

Do not create a separate design essay. Keep docs practical.

---

## 12. Anti-slop review checklist

Before you say the task is done, go through this list and answer each item with evidence:

- [ ] The spider is the LAFVIN LA072 kit, not a generic spider. I compared `hero.png` and `front.png` to `LA072a.png` and `LA072_7.jpg`.
- [ ] Exactly 4 legs, 8 MG90S servos, 4 hip yaw + 4 knee pitch, passive femur. No third servo, no hip pitch.
- [ ] The face plate has cat ears and two HC-SR04 eyes; the sensor is not floating and is not a generic camera.
- [ ] The body has two black acrylic plates, four brass standoffs, the blue ESP8266, the expansion board, the 18650 holder, and silver screws.
- [ ] The tibias are forked acrylic, not cylinders or sticks.
- [ ] The feet have black rubber sleeves.
- [ ] Servo wires and cable ties are visible, routed with slack, not clipping.
- [ ] The materials read as black acrylic, silver metal, brass, blue PCB, pink labels, and warm wires. No random neon on the hardware.
- [ ] The scene is a test bench, not a game level. No stars, hexagons, scanlines, particles, or bloom soup.
- [ ] The UI is an instrument panel, not a landing page. No giant cards, fake stats, emoji, or meaningless gradients.
- [ ] Every control does something real. No dead buttons, no placeholder labels, no "coming soon" without a disabled state.
- [ ] Every number comes from the engine, transport, or renderer. No fake telemetry.
- [ ] The Electron window has a working custom titlebar; I can move, minimize, maximize, restore, and close it.
- [ ] The app works in a browser (`npm run dev`) and in Electron (`npm run desktop`), and the production build loads offline.
- [ ] The MQTT protocol is unchanged except the documented backward-compatible `pose` addition.
- [ ] `npm test`, `npm run lint`, `npm run build`, `npm run desktop:build` pass. I have the output.
- [ ] The four screenshots exist and I compared them to the references.
- [ ] I did not touch `android/`, add a backend, add a heavy dependency, or commit/push without permission.

If any item is unchecked, fix it or report it as a known limitation. Do not hide it.

---

## 13. Suggested implementation order

1. **Baseline**: run tests, read the ODD doc, open the reference images, inspect the current scene.
2. **Kinematics**: add `legKinematics.ts` with 2-DOF hip-yaw/knee-pitch, tests, and the neutral pose. Replace `solveLeg`/`legRig` usage. Get the spider standing correctly before adding detail.
3. **Body model**: rebuild the body, face, electronics, servos, femurs, tibias, feet, wires. Use the hierarchy and config. Get the silhouette right.
4. **Materials/lighting/camera**: acrylic, metal, PCB, labels; key/fill/rim; hero camera. Compare screenshots.
5. **Gait/collision/arena**: foot planting, swing, collision, sonar, calibration mat, distance markers, obstacles.
6. **Controls/UI**: link, drive, gait, actions, servo test, telemetry, debug, accessibility.
7. **Electron shell**: preload, IPC, titlebar, window state, security, production build.
8. **Tests/screenshots/docs**: add the remaining tests, screenshot mode, docs, ODD log.
9. **Final pass**: anti-slop checklist, performance, visual comparison, report.

Do not do the UI before the spider stands correctly. A beautiful panel around a wrong spider is still slop.

---

## 14. Verification commands

Run these from `/home/iwakura/arana-iot` and report the exact results:

```bash
npm ci
npm test
npm run lint
npm run build
npm run desktop:build
npm run desktop:start
npm run desktop:shots
```

If `npm run desktop:start` needs a display and the host is headless:

```bash
xvfb-run -a npm run desktop:start
xvfb-run -a npm run desktop:shots
```

Manual checks:

- Open the app at 1280×800. The window is frameless, the titlebar drags, the buttons work, and the spider is visible in the hero view.
- Drive forward/turn with the joystick and keyboard. The face leads, the legs step, the stance feet do not slide, the camera follows when selected.
- Select each gait; select each implemented action; stop cancels the action.
- Move the servo sliders; the model matches the numbers; "Center all" returns to neutral.
- Connect to `ws://localhost:9001/mqtt` with the local broker (`npm run broker` in another terminal); telemetry and commands flow. Disconnect; the status changes and reconnects.
- Resize the window to 960×640; the layout remains usable.
- Build and run `dist-desktop/` without the dev server; it loads offline.
- Check the console for errors. Fix any caused by your change.

---

## 15. Report format

When you finish, reply with:

1. **What changed** — files and the main decisions, in 5–10 bullets. No essay.
2. **Visual evidence** — the four screenshot paths and a short, honest comparison to the reference images. Mention remaining differences.
3. **Checks** — each command and its result (`npm test`: N passed; `lint`: N errors/warnings; `build`: pass; `desktop:build`: pass; `desktop:shots`: 4 files).
4. **Known limitations** — anything not implemented (e.g., actions not implemented, packaging not added, tunnel not provisioned). Do not hide them.
5. **Risk line** — one line: `Risk: item N (reason)` or `Risk: none`, using the repository's high-risk list. If you changed the protocol, the Electron security model, or the kinematics, say so explicitly.
6. **Next step** — one concrete action for the user (e.g., "open `docs/screenshots/hero.png` and compare; then run `npm run desktop`").

Do not claim "perfect" or "identical" without the screenshots. If the render is close but not identical, say what is still off.

---

## 16. Assumptions and defaults

Use these defaults; ask the user only if a choice changes product scope or requires a new dependency:

- The LAFVIN LA072 kit is the physical target. The reference images in `docs/reference/` are authoritative.
- The current branch `feat/base-system` is the working branch. Do not switch branches.
- The target platform is Linux (Garuda), Electron 45, Node as installed.
- The broker for local development is `ws://localhost:9001/mqtt` via `npm run broker`.
- The remote broker is on the T420; `mqtt.t420.dev` is an example hostname to document, not a guarantee that the tunnel is live.
- The Android app is out of scope; keep the protocol stable and document the handoff.
- The fly-brain is out of scope; keep auto/manual semantics and the `BrainBridge` extension point.
- Use meters, radians internally, degrees at the protocol/UI boundary.
- Keep the existing `bodyRotationY` convention unless you refactor all of it in one change.

If you must choose between more visual detail and 60 fps, keep the silhouette and materials; reduce hidden geometry, shadow resolution, or wire segments first. Never trade the spider's identity for performance.

---

## 17. Final instruction

Start now. Read the repository and the reference images, run the baseline, and implement the work in the order above. Keep the diff focused. Do not rewrite unrelated files. Do not commit or push unless the user asks.

The standard is simple: a person who knows the LAFVIN kit should look at the screen and recognize the robot, and a person who wants to test it should be able to drive it, change gaits, move every servo, read real telemetry, and connect it to the broker without guessing. Build that.

---

## Appendix A — original user request (verbatim, Spanish)

> oye necesito que investigues sobre en lo que íbamos del proyecto ed iot de la araña, necestio que aparte de aquello, me crees un prompt para claude, para que el entorno de electron, quede perfecto, y no "aislop", entonces necesito:
>
> - que la araña sea idéntica a como se ve en imagen y se describe
>
> -que el entorno sea perfecto para poder probar la araña
>
> - que tenga sus mandos para poder manipularlo desde la pag
>
> eso hasta ahora, luego se hará la app android para poder controlar la araña desde el celular y esperando, que se pueda controlar desde el celular, si hay que usar servidor, que se use el t420 que tiene todo conectado gracias a cloudflare, crea el prompt para claude, necesito que sea extremadamente detallado el prompt para que haga una buena pega
