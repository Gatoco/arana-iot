# Base system — 3D world in Electron + Android control

Branch: `feat/base-system`

## Specs

L1 (user request, verbatim, Spanish original):

> Feature: Base del sistema — mundo 3D en Electron + control desde la app Android
>
> Objetivo: Construir la base completa: un mundo 3D oscuro tipo zona de pruebas dentro de
> Electron, donde la araña camina y responde al conectoma, y que el usuario pueda moverla
> desde la app Android en su A55 (SM-A556E).
>
> Entregables:
> 1. Shell Electron — `electron/main.cjs`, ventana 1280x800 sin marco, fondo negro, sin menú
>    por defecto. Scripts `npm run desktop` (levanta Vite + Electron) y `npm run desktop:build`.
> 2. Zona de pruebas 3D oscura — grilla técnica de 12x12 m, niebla, 2 luces spot + ambiente
>    bajo, marcador de origen, marcas cada 1 m en los bordes, 4 pilares en las esquinas, un
>    obstáculo de 40x40x30 cm. Cámara orbital con mouse + modo follow. HUD con modo, marcha,
>    posición X/Z y distancia.
> 3. Modelo de la araña — 4 patas con cadena fémur→tibia visible, 8 servos identificables,
>    materiales oscuros con juntas emisivas. Marchas tetrapod, wave y rest. Desplazamiento real
>    (posición + yaw), no animación en el lugar. Cono del ultrasónico visible.
> 4. Modo auto/manual en el protocolo — nuevo comando `mode` en `arana/cmd` con `auto` |
>    `manual`. Default `auto`. Un comando de movimiento del operador cambia a `manual`. 5 s sin
>    comandos del operador vuelve a `auto`. `Telemetry` gana el campo `mode`. En `manual` el
>    gemelo ignora `arana/brain/state`. Dejar el punto de extensión para el bridge, pero NO
>    implementarlo.
> 5. Broker embebido — `npm run broker` con aedes, TCP 1883 + WebSocket 9001.
> 6. App Android en `android/` — Gradle + Kotlin + XML + Material Components, compileSdk 35,
>    minSdk 26, JDK 17, SDK en `/opt/android-sdk`, gradle wrapper. Pantallas: Login con
>    credenciales contra SQLite local, hash SHA-256 + salt. Conexión: host, puerto, usuario,
>    password. Control: d-pad o joystick, marcha con RadioButton, velocidad con Slider, switch
>    auto/manual, botón STOP, panel de telemetría. Cliente MQTT con Paho. Pantalla Body Mode
>    que simula el cuerpo: publica telemetría sintética y responde a `arana/cmd`. Necesaria
>    para el criterio de dos dispositivos. APK debug instalable por adb en el SM-A556E.
>
> Criterios de aceptación: Los 8 tests existentes siguen verdes; agregar tests para S5–S8.
> `npm run broker` + `npm run desktop` + APK instalada en el A55. Login real, conexión al
> broker, movimiento forward visible en el 3D, giro, cambio de marcha, STOP. 5 s de
> inactividad: el HUD vuelve a `auto`.
>
> Restricciones: No romper ni reescribir `src/protocol.ts` sin spec. Dependencias nuevas
> limitadas a: electron, aedes, Material Components, Paho, androidx. Artefactos en inglés;
> chat en español. Commits convencionales, sin atribución de IA, push a origin.

- S1. Electron opens a frameless, black, 1280x800 window.
- S2. Dark test zone with grid, fog, lights, pillars and obstacle.
- S3. Spider with 4 legs, 8 visible servos and 3 gaits.
- S4. Real displacement with follow camera.
- S5. `mode` command auto/manual, default auto.
- S6. Operator movement switches to manual.
- S7. 5 s without commands returns to auto.
- S8. `Telemetry` includes `mode`.
- S9. Broker on 1883 and 9001.
- S10. Real login with SQLite and hash.
- S11. The app moves the spider in 3D.
- S12. Body Mode answers with synthetic telemetry.

Protocol approval: S5 and S8 are the user-approved changes to `src/protocol.ts`
(additive only: new `mode` command kind, new `Telemetry.mode` field).

### Interpretations (to confirm, not new requirements)

- "Operator command" = any `Command` received on `arana/cmd` or issued from the twin UI.
  Every operator command resets the 5 s idle timer; only `move` (and `mode: manual`)
  switches to `manual`.
- Reverting to `auto` does not change motion state; the brain bridge is the auto driver
  and it is not implemented (extension point only).
- Hardware naming: `protocol.ts` names the two servos per leg `femur` and `tibia`; the sim
  names them `coxa` (yaw) and `femur` (pitch). The 3D view labels servos in protocol order.
  Real mechanical layout is unverified until the kit arrives.
- Login accounts: the request names no account source. The login screen offers
  "Create account" that stores `SHA-256(salt + password)` with a random salt in SQLite;
  no default credentials are seeded.
- Android control repeats `move` while a direction is held (keeps `manual` alive) and sends
  `stop` on release, matching the twin joystick (`onRelease` → stop).

## Tasks

- [x] T0 — fold pending MQTT username/password (uncommitted) into the branch. Route: inline.
      Commit `cea4074`.
- [x] T1 — S5, S6, S7, S8: protocol `mode` + engine mode state machine + brain gate with
      bridge extension point. Route: inline, test-first. High risk (contract) → verifier.
      Commit `047f8e5`.
- [x] T1b — verifier finding: unknown `mode` values wedged the state machine. Route: inline,
      test-first. Commit `8023e83`.
- [x] T2 — S9: `npm run broker` (aedes, 1883 + 9001). Route: inline. `ws` approved.
      Commit `357391b`.
- [x] T3 — S2, S4: dark test zone, orbit + follow camera, HUD. Route: inline. Commit `bae04b0`.
- [x] T4 — S3: spider model visuals (servos, emissive joints, ultrasonic cone). Route: inline.
      Commit `bae04b0`.
- [x] T4b — joystick turn sign contradicted the protocol (right turned left). Route: inline,
      test-first. Commit `adf014d`.
- [x] T5 — S1: Electron shell + `desktop` / `desktop:build` scripts. Route: inline.
      Commit `6ec8947`.
- [x] T6 — S10, S11, S12: Android app in `android/`. Route: delegated worker (independent
      surface, parallel with T3–T5). Commit `dc788a8`. APK built, not installed (device offline).
- [ ] T7 — end-to-end acceptance on the A55 + push. Route: inline, needs the user.

## Log

- 2026-10-21: baseline `npm test` 8/8 green, `npm run lint` 0 errors (2 pre-existing
  `react(refs)` warnings in `src/App.tsx`), `npm run build` OK. adb sees the A55 over TLS.
  No `gradle` on PATH; JDK 17 and `/opt/android-sdk` platform 35 present.
- 2026-10-21: aedes 1.2.0 has no WebSocket server; port 9001 needs `ws` (present only as a
  transitive dependency of `mqtt@5.16.0`, v8.22.0). Asked the user.
- 2026-10-21: user approved declaring `ws` explicitly for the broker WebSocket listener.
- 2026-10-21: T0 committed `cea4074`. T1 RED observed (8 new tests failing on missing
  `CONTROL_MODE`), GREEN `npm test` 16/16, `tsc -b` clean, lint unchanged. Commit `047f8e5`.
- 2026-10-21: T6 delegated (Android worker, surface `android/`); T1 independent verifier spawned.
- 2026-10-21: T1 verifier: finding 1 (unvalidated mode wedges state) fixed in `8023e83`;
  finding 2 (bridge must not drive through operator commands) documented on `BrainBridge`.
  Open, pre-existing: UI commands echo back through `arana/cmd` (idempotent, idle timer
  restarts one round trip later); old transport handlers not unsubscribed on `reconnect()`.
- 2026-10-21: T2 RED: `S9` timed out. Root cause reproduced on plain Node 26.10.0: several
  synchronous `push()`es then `read(null)` returns only the first chunk and no further
  'readable' fires; aedes reads once per 'readable', and mqtt.js sends each packet piece as
  its own WS frame. Fixed by coalescing frames per tick. GREEN.
- 2026-10-21: T3/T4: found the rendered nose pointed opposite to travel (engine moves +Z at
  yaw 0, mesh nose on -Z). Fixed via `bodyRotationY`, covered by test. Sensor now ray-casts
  the arena walls and obstacle (2–400 cm, null beyond). `sim.test.ts` setup line changed from
  `setWorld({ wall: null })` to `setWorld({ sensor: false })` (fake wall removed); assertions
  unchanged. Electron capture: 1280x800 frameless, HUD `AUTO` → `MANUAL` after joystick drag,
  pose moved to (0.03, 0.14) heading 26°.
- 2026-10-21: T6 worker: Gradle 8.11.1, AGP 8.7.3, Kotlin 2.0.21, Material 1.12.0, Paho 1.2.5;
  `buildToolsVersion 35.0.0` (34 not installed). RED compile failure observed, GREEN
  `./gradlew test` 25 tests (PasswordHasher 6, BodySim 11, ProtocolCodec 8), `assembleDebug`
  OK. Test-only dep `org.json:json:20240303`. Install failed: device not found.
- 2026-10-21: user: heavy work goes to the T420 (`ssh t420`); this host has ~1.3 GiB free.
  T420 has node/java/git, no Android SDK; it already runs mosquitto on 1883 + 9001.
- `npm test` 28/28, `tsc -b` clean, lint 0 errors (2 pre-existing warnings).

### Gaps

- `desktop:build` produces a runnable `dist-desktop/` (`npm run desktop:start`), not an
  installer: packaging needs electron-builder/forge, outside the allowed dependencies.
- "Responds to the connectome": only the `BrainBridge` gate exists, by request; no brain
  message shape is defined, so auto mode does not drive the body yet.
- Falling back to `auto` keeps the last forward/turn; with no bridge, a client that drops
  mid-move leaves the twin walking. Needs a user decision.
- No collision with the obstacle (the sensor sees it; the body can walk through it).
- Android Paho/broker path has no automated test; S11/S12 depend on T7.
