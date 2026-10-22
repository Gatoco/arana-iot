# Android command center — native Kotlin controller for the LA072 twin

Branch: `feat/base-system`. Builds on `odd/tasks/base-system.md` (S10–S12) and
`odd/tasks/desktop-experience.md` (S20, S21). The desktop Electron app remains the 3D body and
test bench; the phone becomes the field command center.

Commissioned prompt: `docs/claude-android-prompt.md`.
Build host: T420 (`/home/iwakura/Android/Sdk`, JDK 17, AVD `morris_test`).
Target device: Samsung A55 (SM-A556E). Current `adb devices` is empty; installation is pending.

Status: implemented in `0.2.0` on the T420; emulator acceptance passed, A55/WSS/real-Electron
acceptance pending. Baseline was `0.1.0` with a local SQLite login, a separate connection
screen, Paho TCP only, and 25 passing tests. This feature replaces that connection model with
one simple server login and three main tabs.

## Specs

- S1. Native Android command center in Kotlin + XML + Material 3. No 3D renderer on the phone.
  Screens: Login; Main with Console / Actions / Servos; connection dialog; Body Mode (demo,
  overflow). There is no separate Link tab and no ConnectionActivity. The desktop keeps the 3D
  twin.
- S2. Simple server login. A single `LoginActivity` asks for Server URL, Username, Password,
  Remember, and Connect. The app authenticates directly against the T420 Mosquitto broker with
  the MQTT CONNECT username/password. No local account database, no create-account flow, no
  password hashing in the app, no profile matrix. Defaults are
  `wss://mqtt.t420.dev/mqtt`, `conectoma`, `cont1234` — test credentials explicitly supplied by
  the user. They are documented as test-only and must not be reused outside this classroom demo.
- S3. Broker link. Editable broker URL supporting `tcp`, `ssl`, `ws`, `wss`; default is the
  Cloudflare WSS URL. Use HiveMQ MQTT Client 1.3.3 (Paho does not support WSS on Android).
  TLS with the platform trust store, automatic reconnect, last-will `stop`, connection state,
  and no credentials in logs or Intent extras. Remembered credentials go to
  EncryptedSharedPreferences.
- S4. Console. Live 2D tactical map (4 m viewport, grid, spider, sonar cone, obstacles, trail),
  custom joystick, throttle slider, gait selector, auto/manual switch, large STOP button,
  telemetry cards, packet log, and an explicit no-telemetry state that tells the operator the
  Electron body is not connected to the same broker.
- S5. Actions. A 3×3 grid of the nine firmware actions: Fighting, Standby, Push-Up, Sleep,
  Lie Down, Greet, Leg Raise, Swing, Relax. Each sends the documented `pose` command.
- S6. Servos. A 4×2 read-only live angle matrix for FL/FR/RL/RR hip and knee, with the firmware
  channel mapping visible in a details view. No sliders that pretend to calibrate hardware.
- S7. Protocol. Preserve topics, payload shapes, QoS 0, joint order, gait names, and mode
  semantics. Add `PoseCmd` (`{"kind":"pose","pose":"..."}`) to the Kotlin command union. Decode
  strictly; reject non-finite or wrong-length telemetry joints. Joints are
  `FL_hip, FL_knee, FR_hip, FR_knee, RL_hip, RL_knee, RR_hip, RR_knee`.
- S8. Body Mode (demo). Keep the existing simulated body for the EVA2 two-instance demonstration.
  It publishes telemetry at 10 Hz and accepts the same commands. It must use the current
  hip/knee joint semantics, not the old femur/tibia semantics. It is reachable from the overflow
  menu, not a main tab, and it does not replace the Electron body.
- S9. Connection UX. The connection dialog shows state, server (no password), username, telemetry
  age, and Disconnect / Logout / Body Mode. A dropped link shows a reconnect banner. Commands are
  never silently sent while disconnected. The app sends `stop` on pause/stop and before logout.
  "Change server" logs out and returns to Login.
- S10. Security. TLS for the default and release builds; cleartext only in debug for LAN and
  Tailscale; no trust-all socket factory; no passwords in logcat, crash reports, or Intent
  extras; encrypted credential storage; the supplied demo credentials are an explicit,
  documented test exception, not a production secret.
- S11. UI. Dark instrument-panel design: background `#0E1114`, surface `#161A1E`, primary
  `#4DD0E1`, warning `#FFB74D`, danger `#EF5350`, 8 dp spacing scale, 48 dp minimum touch targets,
  monospace numbers, no cards-inside-cards, no gradients, no emoji, no fake charts. Works from
  360 dp to 800 dp wide and in landscape.
- S12. Tests and build. Keep `ProtocolCodecTest` and `BodySimTest`; add `BrokerUrlTest` and
  `LoginFormTest`; remove tests for deleted local-auth classes. Run
  `ANDROID_HOME=/home/iwakura/Android/Sdk ./gradlew test lintDebug assembleDebug --no-daemon`.
  Produce a debug APK. Manual acceptance covers correct login, wrong password, no network,
  reconnect, Electron control, no-telemetry banner, and Body Mode.
- S13. Docs. Update `README.md` with the simple connection flow and the Electron preflight.
  Update `docs/remote-control.md` to the single-login model. Add an EVA2 mapping table that
  explains that login is remote MQTT authentication (API-style), not a local account database.
  Add screenshots or a short demo script.
- S14. Scope. Only `android/`, `docs/`, and this feature file. Do not modify the Electron shell,
  the T420 broker, the Cloudflare tunnel, or `src/`. Do not commit or push unless the user asks.
- S15. EVA2. The demo must satisfy: real login, live monitoring, activator with EditText /
  Slider / RadioButton / Switch, two app instances over the network, disconnect/reconnect
  handling, and documented security. The app must install and run on the A55 and on at least one
  other Android device or emulator.

## Tasks

- [x] T1. Add `Pose` / `PoseCmd` to `Protocol.kt`; add codec tests; update joint comments. `S7`.
- [x] T2. Replace local auth and ConnectionActivity with the single broker LoginActivity, LoginViewModel,
  BrokerCredentialsStore, and defaults. `S1`, `S2`, `S10`.
- [x] T3. Replace Paho with HiveMQ; implement BrokerUrl parsing, LinkManager, WSS/TLS, LWT, reconnect,
  and connection state. `S3`, `S9`.
- [x] T4. Rework MainActivity into Console / Actions / Servos; add connection dialog and overflow.
  `S1`, `S4`, `S5`, `S6`, `S11`.
- [x] T5. Build the Console: tactical map, joystick, throttle, gait, mode, STOP, telemetry, packet log,
  no-telemetry banner. `S4`, `S9`.
- [x] T6. Build the Actions grid and Servos matrix with firmware channel details. `S5`, `S6`.
- [x] T7. Update Body Mode to hip/knee semantics and keep it as the EVA2 demo body. `S8`.
- [x] T8. Tests, lint, build, APK, README, remote-control doc, demo script, EVA2 mapping.
  `S12`, `S13`, `S15`. Android screenshots were not produced; the desktop screenshots are
  unrelated.
- [ ] T9. Manual acceptance on the T420 emulator and, if connected, the A55. `S12`, `S15`.
  Emulator passed on 2026-10-21; A55, live WSS and the real Electron body are pending.

## Log

- L1 (2026-10-21, user, verbatim): “está verdaderamente increible el resultado, espero el commit y el push estuviese bien hecho, vamos por buen camino, ahora tenemos que trabajar en la apk, hagamos el prompt para que el centro de mando pase al celular, y así poder usar el a55 para controlar la araña, asi que necesito crear el prompt con el que el agente claude, hará la apk que será el centro de mando, podriamos comenzar ahora a ir planificando esto, comencemos”
- L2 (2026-10-21, user, verbatim): “este plan, quiero que en temas de conexión sea sencillo, al abrir la app, login, poner las credenciales del server del t420 donde se sirve el cerebro de la araña por medio de cloudflare, el user es conectoma y la pass es cont1234, con eso se entra y se controla la araña de electron, ajusta el prompt a eso, y vuelve a mandarmelo como te lo pedí la última vez”
- L3 (2026-10-21, decision): the connection model is broker authentication only. The local
  SQLite account database, PBKDF2 work, session store, ConnectionActivity, and LAN/Tailscale/
  emulator profile matrix are out of scope. The login screen is the only entry point.
- L4 (2026-10-21, baseline): app 0.1.0 builds on the T420 with 25 tests; Paho is TCP-only; the
  Electron twin defaults to Loopback and must be switched to MQTT to be controlled from the phone.
- L5 (2026-10-21, risk): the user supplied test credentials are public in this prompt and may be
  in the app defaults. They are test-only; rotate them before any real deployment. The phone can
  connect to the broker while the Electron body is on Loopback; the Console must say so instead
  of showing fake control.
- L6 (2026-10-21, implementation report): app implemented in `/home/iwakura/arana-build/android`.
  `gradlew clean test lintDebug assembleDebug` → 67 tests, 0 failed, 3 skipped (broker tests need
  env vars). Broker tests separately passed against real Mosquitto over WebSocket and TCP.
  Emulator: bad URL rejected, wrong password rejected, correct password enters Console, joystick
  right sends negative turn, STOP and `dance3` reach `arana/cmd`, Logout returns to Login,
  `cont1234` absent from logcat. Bugs fixed: missing HiveMQ `netty-codec-http` (WS/WSS silently
  hung), connect timeout vs CONNACK, Spanish error classification, rotation sending a gait, login
  status-bar overlap, pill buttons, map pushing the joystick offscreen. Pending: A55, live
  `wss://mqtt.t420.dev`, real Electron body over MQTT, 360 dp/font 1.3, Wi-Fi reconnect, Body Mode
  on a second device, sustained 10 Hz.
- L7 (2026-10-21, source reconciliation): the implementation was not in the git checkout. Copied
  `/home/iwakura/arana-build/android/` into `/home/iwakura/arana-iot/android/` with rsync, excluding
  `app/build`, `.gradle`, `.kotlin`, `local.properties` and `build`. Rebuilt from the canonical
  checkout on the T420: `test lintDebug assembleDebug` green. The reported Android README,
  remote-control edits and screenshots were absent; README, `docs/remote-control.md` and
  `docs/android-demo.md` are written in this commit. APK copied to
  `android/arana-command-center-0.2.0-debug.apk`. Commit and push follow this log entry.
