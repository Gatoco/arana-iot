# Claude Code prompt — Arana Android command center (simple T420 login)

## 0. Role and mission

You are a senior Android engineer with 15 years of experience shipping field-control apps for
robotics and IoT. You are direct, security-minded, and allergic to demo-ware. You implement; you
do not stop at a proposal.

Your mission is to turn the existing `android/` app in this repository into the **Arana Command
Center**: a native Kotlin Android app that connects to the T420 Mosquitto broker through
Cloudflare, logs in with the broker credentials, controls the Electron spider twin over MQTT,
shows live telemetry and a 2D tactical map, exposes the nine firmware actions, and shows the eight
servo angles.

The desktop Electron app is already the hardware-faithful 3D twin. Do not rebuild 3D on the
phone. The phone is the **remote command center**: fast, legible, safe, and reliable in one hand.
The operator watches the spider on the desktop and drives it from the phone.

"Perfect" here means: every control is wired, every state is honest, every failure is visible,
and nothing is fake. No AI slop: no dead buttons, no placeholder charts, no invented telemetry,
no hardcoded "connected" state, no login that does not actually authenticate.

## 1. Non-negotiable constraints

1. **Native Android only.** Kotlin + XML + Material 3 + ViewBinding. No Compose, no Flutter, no
   web wrapper, no 3D renderer on the phone.
2. **Keep the package and toolchain.** `com.arana.controller`, compileSdk 35, minSdk 26,
   targetSdk 35, JDK 17, AGP 8.7.3, Kotlin 2.0.21, Gradle 8.11.1. You may add the dependencies
   explicitly listed in this prompt; do not add anything else without asking.
3. **The connection model is deliberately simple.** One login screen: Server URL, Username,
   Password, Remember, Connect. The app authenticates directly against the T420 Mosquitto broker
   with the MQTT CONNECT credentials. There is **no local account database**, no create-account
   flow, no password hashing in the app, no separate `ConnectionActivity`, and no LAN/Tailscale/
   emulator profile matrix.
4. **Defaults for this classroom demo.** Server `wss://mqtt.t420.dev/mqtt`, username
   `conectoma`, password `cont1234`. These are test credentials explicitly supplied by the user.
   They are not production secrets. Put them in `strings.xml` as clearly named demo defaults,
   prefill the login on first run, and document in `README.md` that they are test-only and must be
   rotated before any real deployment. Do not hide this tradeoff.
5. **The phone controls the Electron twin through the broker.** The phone does not launch,
   embed, or modify Electron. The Electron app must be connected to the same broker. If it is on
   its default Loopback transport, the phone will connect but there will be no telemetry; the UI
   must say so instead of pretending the body is there.
6. **Do not modify the Electron shell, the T420 broker, the Cloudflare tunnel, or `src/`.** This
   task touches `android/`, `docs/`, and the feature document only.
7. **Preserve the protocol.** Topics, payload shapes, QoS 0, joint order, gait names, and
   auto/manual semantics are frozen. The only additive change is `PoseCmd`:
   `{"kind":"pose","pose":"<name>"}`. Do not rename fields. Do not change the joint order.
8. **No fake success.** The Connect button must perform a real MQTT connection and wait for the
   CONNACK. A wrong password, DNS failure, TLS failure, or timeout must leave the user on the
   login screen with a specific error.
9. **Security.** Use TLS for the default URL and release builds. Cleartext is allowed only in
   debug for LAN/Tailscale. No trust-all socket factory. Never log the password, never put it in
   an Intent extra, never write it to a crash report. Remembered credentials go to
   EncryptedSharedPreferences.
10. **Offline-first is not a requirement for the phone.** The desktop twin keeps Loopback. The
    phone is a remote control; without a broker it must show a clear disconnected state and must
    not send commands.
11. **Do not commit or push** unless the user asks. Leave the working tree ready for review.
12. **No invented verification.** If a command was not run, say so. If the A55 is not connected,
    say so. Do not claim the app was installed on hardware when it was only built.
13. **Artifacts are English.** Code, comments, strings, docs, commit messages, and UI copy are
    English. The only Spanish allowed is a verbatim quote of the user's request in the feature
    document or the appendices of this prompt.
14. **Read the feature document first.** `odd/tasks/android-command-center.md` is the
    authoritative spec for this task. If it conflicts with this prompt, stop and report the
    conflict; do not guess.

## 2. Read these files before writing

Read, in this order:

1. `CLAUDE.md` — repository rules, ODD, artifact language, no Engram.
2. `odd/tasks/android-command-center.md` — the feature spec, tasks, and log.
3. `docs/protocol.md` — the authoritative message contract, joint order, limits, pose names,
   firmware channel map.
4. `docs/remote-control.md` — T420 Mosquitto and Cloudflare facts, URLs, security notes.
5. `odd/tasks/desktop-experience.md` — S20 (`PoseCmd`) and S21 (instrument UI), so the phone
   matches the desktop vocabulary.
6. `android/app/build.gradle.kts`, `android/build.gradle.kts`, `android/settings.gradle.kts`,
   `android/app/src/main/AndroidManifest.xml`.
7. `android/app/src/main/java/com/arana/controller/` — every Kotlin file.
8. `android/app/src/main/res/layout/` — every layout.
9. `android/app/src/main/res/values/` — strings, colors, themes.
10. `android/app/src/test/java/com/arana/controller/` — existing tests.

The current baseline is app `0.1.0`:

- `LoginActivity` uses a local SQLite `UserDb` with SHA-256(salt + password). This is the old
  model and must be removed from the main flow.
- `ConnectionActivity` asks for host, port, username, password, then opens Control or Body Mode.
  This screen must be removed; its function moves into the single Login screen.
- `ControlActivity` is a D-pad with a speed slider and gait radio group.
- `BodyModeActivity` is a simulated body with `BodySim`.
- `MqttLink` uses Paho with `tcp://` only.
- 25 unit tests pass: `PasswordHasherTest`, `BodySimTest`, `ProtocolCodecTest`.
- `android/local.properties` is gitignored. Set `ANDROID_HOME=/home/iwakura/Android/Sdk` when
  building on the T420.

## 3. Target architecture

```
AranaApp
  AppContainer
    BrokerCredentialsStore   // EncryptedSharedPreferences
    LinkManager              // app-scoped MQTT connection + telemetry + packet log

LoginActivity
  LoginViewModel             // form state, validation, connect, error

MainActivity
  ConnectionDialog           // status, disconnect, logout, Body Mode
  ConsoleFragment            // tactical map, drive, telemetry, packet log
  ActionsFragment            // nine poses
  ServosFragment             // 4x2 live angles + channel details

BodyModeActivity             // optional EVA2 demo body, from overflow
```

There is no `LinkFragment`, no `ConnectionActivity`, no `UserDb`, no `PasswordHasher`, and no
`SessionStore`. If a `SessionStore` exists, delete it. Delete the old auth classes and their
tests. Delete `ControlActivity` and `activity_control.xml` after the Console replaces them; do not
leave two control screens. Do not migrate local accounts; they are unused. Do not delete the old
`users.db` file on existing installs; simply stop using it. Document that local accounts are gone.

Use a single app-scoped `LinkManager`. The login screen creates the connection; Main reuses it.
If the process dies, the user logs in again. There is no auto-login and no stored session token.

## 4. Product flow

1. Launch → `LoginActivity`.
2. Fields are prefilled with the demo defaults on first run, or with remembered encrypted values.
3. The user presses **Connect**.
4. The app validates the URL and fields, then performs a real MQTT CONNECT to the broker.
5. On success → `MainActivity`, Console tab, live telemetry.
6. On failure → stay on Login, show the exact error, keep the fields.
7. Main has three tabs: **Console**, **Actions**, **Servos**.
8. The toolbar shows a connection dot, the current mode (`AUTO` / `MANUAL`), and an overflow menu
   with **Connection**, **Body Mode (demo)**, and **Logout**.
9. **Connection** opens a dialog with state, server, username, telemetry age, Disconnect,
   Logout, and Body Mode. It never shows the password.
10. **Logout** sends `stop`, disconnects, clears in-memory telemetry, and returns to Login.
11. **Change server** is Logout → Login; the server field is editable there.
12. Body Mode is an optional demo body. It is not a main tab and does not replace Electron.

The operator drives the Electron twin. The phone shows a 2D tactical map and telemetry; the
desktop shows the 3D spider. This is intentional. Do not add a 3D view to the phone.

## 5. Login screen — exact behavior

Layout: a single `NestedScrollView` with a `ConstraintLayout` or `LinearLayout` inside, so the
keyboard never covers the Connect button.

Elements, top to bottom:

- Brand: **ARANA** / **Command Center** in the existing dark theme.
- Subtitle: `T420 broker · Cloudflare WSS`.
- `TextInputLayout` **Server URL**, input type URI, default
  `wss://mqtt.t420.dev/mqtt`. Helper text: `MQTT WebSocket endpoint`.
- `TextInputLayout` **Username**, default `conectoma`, autocomplete username.
- `TextInputLayout` **Password**, default `cont1234`, password toggle, autocomplete password.
- `MaterialCheckBox` **Remember credentials**, checked by default. Helper: `Encrypted on this
  device`.
- `MaterialButton` **Connect**, full width, 52 dp high.
- A small `TextView`: `Test credentials for the classroom demo. Do not reuse.` This is not a
  joke; it is the honest warning.
- An error `TextView` below the button, initially `GONE`, with `textColor` danger.
- A `ProgressBar` or button spinner while connecting; disable the button and fields during the
  attempt.

Behavior:

- Trim URL and username; do not trim the password.
- Validate: URL non-empty and parseable; username non-empty; password non-empty. Do not add a
  fake password-strength meter.
- The URL parser accepts `tcp`, `ssl`, `ws`, `wss`. Default ports: 1883, 8883, 80, 443.
  The WebSocket path defaults to `/mqtt` if absent. Reject empty host and unsupported schemes.
- On Connect: hide the keyboard, show progress, call `LinkManager.connect(credentials)`.
- On success: save credentials if Remember is checked; otherwise clear the stored password. The
  active connection keeps the password only in memory for reconnect. Start `MainActivity` and
  finish Login.
- On failure: map the failure to a human message:
  - `Invalid username or password` for a CONNACK "not authorized"/"bad user name or password".
  - `Cannot reach the server` for DNS/connect timeout.
  - `TLS error` for certificate/handshake failure.
  - `Connection refused` for a refused socket.
  - `Invalid server URL` for parse failure.
  Do not navigate on failure.
- If a previous connection exists (for example, the user backed out of Main), disconnect it
  before starting a new attempt.
- No create-account button, no "forgot password", no local user list, no guest mode.
- The password must never appear in logcat. Use a redacted `toString()` on the credentials model.

## 6. Broker URL and connection

### 6.1 URL model

Create a pure Kotlin `BrokerUrl`:

```kotlin
data class BrokerUrl(
    val scheme: String,   // tcp | ssl | ws | wss
    val host: String,
    val port: Int,
    val path: String,     // "/mqtt" for ws/wss, "" for tcp/ssl
)
```

Rules:

- `wss://mqtt.t420.dev/mqtt` → scheme `wss`, host `mqtt.t420.dev`, port 443, path `/mqtt`.
- `ws://192.168.1.79:9001/mqtt` → scheme `ws`, port 9001, path `/mqtt`.
- `tcp://100.66.97.18:1883` → scheme `tcp`, port 1883, path empty.
- `ssl://host:8883` → scheme `ssl`, port 8883.
- If the scheme is missing, reject. Do not guess `tcp`.
- If the path is missing for `ws`/`wss`, use `/mqtt`.
- Ignore query strings and fragments for the MQTT endpoint.
- Reject userinfo in the URL; credentials come from the fields.
- Unit-test every scheme, default ports, explicit ports, paths, and invalid inputs.

### 6.2 Client

Use **HiveMQ MQTT Client 1.3.3**, not Paho. Paho's Java client does not support `wss://` on
Android because it needs `javax.websocket`, which Android does not provide. HiveMQ supports
Android API 19+ and WebSocket/WSS.

Dependency:

```kotlin
implementation("com.hivemq:hivemq-mqtt-client:1.3.3")
```

Packaging excludes:

```kotlin
packaging {
    resources {
        excludes += "META-INF/INDEX.LIST"
        excludes += "META-INF/io.netty.versions.properties"
    }
}
```

Build the client with `MqttClient.builder()`:

- MQTT 3.1.1, clean session.
- Unique client ID: `arana-android-` + first 8 chars of a UUID.
- Host and port from `BrokerUrl`.
- `sslWithDefaultConfig()` for `ssl` and `wss`; no trust-all.
- `webSocketConfig(MqttWebSocketConfig.builder().serverPath(path).build())` for `ws`/`wss`.
- `automaticReconnectWithDefaultConfig()`.
- `connectTimeout` 10 s; keepalive 30 s.
- Last will: topic `arana/cmd`, payload `{"kind":"stop"}`, QoS 0. If the phone dies while
  driving, the broker publishes stop.
- Subscribe to `arana/telemetry` after CONNACK, QoS 0.
- Publish commands to `arana/cmd`, QoS 0.
- On reconnect: resubscribe and clear stale telemetry; do not replay the last command.

The exact HiveMQ builder API is in its 1.3.3 documentation. Use `Mqtt3AsyncClient`,
`connectWith()`, `subscribeWith()`, `publishWith()`, and `publishes(...)`. Do not block the main
thread. Use `CompletableFuture` callbacks or coroutines; never `.get()` on the UI thread.

### 6.3 Link state

```kotlin
sealed interface LinkState {
    data object Disconnected : LinkState
    data object Connecting : LinkState
    data object Connected : LinkState
    data class Reconnecting(val reason: String?) : LinkState
    data class Failed(val message: String) : LinkState
}
```

`LinkManager` exposes:

- `StateFlow<LinkState>`
- `StateFlow<Telemetry?>`
- `StateFlow<Long>` telemetry age / last timestamp
- `SharedFlow<PacketLogEntry>` for the debug log
- `suspend fun connect(credentials: BrokerCredentials): Result<Unit>`
- `fun disconnect()`
- `fun publish(command: Command): Boolean` — false when not connected
- `fun currentState(): LinkState`

`BrokerCredentials` is `data class BrokerCredentials(val url: BrokerUrl, val username: String,
val password: String)` with a redacted `toString()`.

`BrokerCredentialsStore`:

- `EncryptedSharedPreferences` with a `MasterKey` (AES256_GCM).
- Keys: `server_url`, `username`, `password`, `remember`.
- On first run, no saved values → use `strings.xml` demo defaults.
- If Remember is checked, save; if not, clear the stored password.
- Never log values. Never pass them through Intent extras.
- If the encrypted store fails (keystore reset), fall back to the demo defaults and show no
  secrets; do not crash.

### 6.4 Connection dialog

A `MaterialAlertDialog` or `BottomSheetDialog` from the toolbar overflow:

- State: `Connected`, `Connecting`, `Reconnecting`, `Disconnected`, `Failed`.
- Server: full URL, no credentials.
- Username: visible.
- Telemetry: `last packet 0.4 s ago` or `no telemetry`.
- Buttons: **Disconnect** (when connected), **Logout**, **Body Mode (demo)**, **Close**.
- `Disconnect` sends stop first, then disconnects and stays in Main with a disconnected banner.
  It does not navigate to Login.
- `Logout` sends stop, disconnects, clears telemetry, and returns to Login.
- `Body Mode` warns that only one body should publish telemetry on the broker.

## 7. Electron body preflight (must be in the README and in your acceptance)

The phone can only control the Electron spider if the Electron app is connected to the **same**
broker. The Electron app's default is Loopback, which is local to the desktop and invisible to
the phone. Do not modify Electron; document the steps.

1. On the desktop, start the Electron app (`npm run desktop` from the repo, or the packaged
   `dist-desktop` build).
2. Open the Link panel.
3. Choose **MQTT**.
4. Set the broker URL to `wss://mqtt.t420.dev/mqtt` (or, if the desktop CSP blocks WSS, the LAN
   URL `ws://192.168.1.79:9001/mqtt` or Tailscale `ws://100.66.97.18:9001/mqtt` for the demo;
   report the limitation, do not change Electron in this task).
5. Set username `conectoma`, password `cont1234`.
6. Connect and confirm telemetry appears and the twin responds to the desktop controls.
7. Then open the phone app, log in with the same server and credentials, and drive.

If the phone connects but the Console shows no telemetry for more than 3 seconds, show a
persistent banner:

> **NO TELEMETRY — connect the Electron body to the same broker.**

Do not show a green "connected" state as if the body were present. The broker connection and the
body connection are different facts. The UI must distinguish them.

Preflight commands (run from the repo on the T420 after `npm ci`):

```bash
node -e "const mqtt=require('mqtt');const c=mqtt.connect('wss://mqtt.t420.dev/mqtt',{username:'conectoma',password:'cont1234',connectTimeout:10000,reconnectPeriod:0});c.on('connect',()=>{console.log('CONNECTED');c.end(true)});c.on('error',e=>{console.error('ERROR',e.message);process.exit(1)})"
```

```bash
node -e "const mqtt=require('mqtt');const c=mqtt.connect('wss://mqtt.t420.dev/mqtt',{username:'conectoma',password:'cont1234'});c.on('connect',()=>c.subscribe('arana/telemetry'));c.on('message',(t,m)=>{console.log(m.toString());c.end(true)});setTimeout(()=>{console.error('NO TELEMETRY');process.exit(2)},8000)"
```

If `mqtt.t420.dev` is not live from the build host, report it with the exact error. Do not
silently switch the app default to a LAN URL. The user can edit the URL in the login screen.

## 8. Main screen and navigation

Use `MainActivity` with:

- `MaterialToolbar` (title `Arana Command Center`) with a connection dot and mode badge.
- `BottomNavigationView` with three items: Console, Actions, Servos.
- `FragmentContainerView` and three fragments.
- Overflow menu: Connection, Body Mode (demo), Logout.
- A `Snackbar` or banner for reconnect/disconnected states.

Rules:

- If `LinkManager` is not connected when Main starts, finish and return to Login.
- The selected tab survives rotation via `savedInstanceState`.
- The connection dot is green only when the broker is connected; amber when reconnecting; red
  when disconnected. No dot for telemetry; telemetry age is separate.
- The mode badge reads `AUTO` or `MANUAL` from telemetry. If there is no telemetry, show `--`.
- On `onStop`, send `stop` if connected. This is a safety stop, not a user command.
- Back exits the app; `onStop` sends stop. Do not trap the user.
- Logout is explicit.

## 9. Console tab

Layout, top to bottom:

1. **Connection strip**: broker state, telemetry age, mode badge, `AUTO`/`MANUAL`.
2. **Tactical map** (`TacticalMapView`, custom `View`, 16:10 or square, min 220 dp):
   - 4 m × 4 m viewport centered on the spider, north-up or heading-up. Pick heading-up and
     label it; do not rotate silently.
   - 0.5 m grid, 1 m major lines, scale bar, origin marker.
   - Spider as a triangle or rounded body with four foot dots; heading line.
   - Sonar cone using `distance` and the 7.5° half-angle; color teal; no cone when `distance` is
     null.
   - Obstacles from the desktop arena: box at `(0, 1.5)` size `0.4 × 0.4`, cylinder at
     `(0.8, 2.5)` radius `0.15`, low wall at `z = 3.5`, arena bounds ±6 m. Draw only what fits
     the viewport.
   - Short trail (last 80 points) in a dim teal.
   - Do not fake a map if telemetry is absent; draw the grid and a centered "NO TELEMETRY" label.
3. **Drive block**:
   - Custom `JoystickView`, 120 dp, dead zone 0.12, returns to center on release.
   - Left/right = turn, up/down = forward. The protocol says positive `turn` = left. The
     joystick's right must produce negative `turn`; test the sign.
   - Throttle `Slider` 0.2–1.0, default 0.6, labeled `Throttle`.
   - Gait `MaterialButtonToggleGroup`: TETRAPOD, WAVE, REST.
   - `MaterialSwitch` **Manual**; when off, send `mode: auto`; when on, send `mode: manual`.
   - Large **STOP** button, 64 dp high, danger color, always enabled when connected.
   - Send `move` at 10 Hz while the joystick is held; send `stop` on release and on
     `onPause`/`onStop`. Do not send a command every frame.
4. **Telemetry cards** (2 columns):
   - Pose X / Z in meters, heading in degrees, distance in cm or `no echo`.
   - Gait, mode, link state, telemetry age.
   - Eight servo values in a compact 4×2 strip; full matrix lives in Servos.
5. **Packet log** (collapsible, default collapsed):
   - Last 50 entries: timestamp, direction, topic, compact JSON.
   - Redact nothing except credentials; commands and telemetry are safe to show.
   - Pause/resume and clear buttons; no auto-scroll when paused.
6. **No-telemetry banner** as described in section 7.

Command behavior:

- All drive commands require `LinkState.Connected`. If not connected, disable the controls and
  show the reason.
- If connected but no telemetry for >3 s, keep STOP enabled; show the no-telemetry banner. Drive
  commands are allowed but marked `unconfirmed` in the packet log. Do not claim they were
  delivered to a body.
- The joystick must not send `move` before the first touch. No drift.
- STOP sends `{"kind":"stop"}` once; it does not spam.
- Never send `pose` from the Console; poses live in Actions.

## 10. Actions tab

A 3×3 grid of Material buttons, one per firmware action, in this exact order:

| Row | Button | Payload |
|---|---|---|
| 1 | Fighting | `{"kind":"pose","pose":"fighting"}` |
| 1 | Standby | `{"kind":"pose","pose":"standby"}` |
| 1 | Push-Up | `{"kind":"pose","pose":"pushup"}` |
| 2 | Sleep | `{"kind":"pose","pose":"sleep"}` |
| 2 | Lie Down | `{"kind":"pose","pose":"lie"}` |
| 2 | Greet | `{"kind":"pose","pose":"hello"}` |
| 3 | Leg Raise | `{"kind":"pose","pose":"dance3"}` |
| 3 | Swing | `{"kind":"pose","pose":"dance2"}` |
| 3 | Relax | `{"kind":"pose","pose":"dance1"}` |

- Each button sends exactly one `pose` command; no repeats.
- Disable the grid when not connected.
- Show a short `Snackbar`: `Sent Fighting` or `Sent Fighting (unconfirmed)`.
- A small note: poses are firmware actions; the physical robot may not support all of them yet.
- Do not add a "calibrate" button here.

## 11. Servos tab

A read-only 4×2 matrix:

```
FL  hip 45°   knee 65°
FR  hip 45°   knee 65°
RL  hip 45°   knee 65°
RR  hip 45°   knee 65°
```

- Values come from telemetry `joints` in the exact order
  `FL_hip, FL_knee, FR_hip, FR_knee, RL_hip, RL_knee, RR_hip, RR_knee`.
- Show a small horizontal bar per joint with the legal range; color normal teal, near-limit amber,
  invalid red.
- If telemetry is absent, show `--` for every value, not zeros.
- A details dialog shows the firmware channel map:

```
G14 FR knee 135 −    G12 FR hip 45 +
G13 RR hip 135 +     G15 RR knee 45 +
G16 FL knee 45 +     G5  FL hip 135 −
G4  RL hip 45 −      G2  RL knee 135 −
```

- No sliders, no "set servo" controls. The firmware does not support per-servo commands over
  MQTT; do not invent them.
- The old `legTopic(leg)` / `arana/servo/{leg}` topic is not part of the command contract. Do
  not use it unless the protocol doc explicitly adds it.

## 12. Protocol and codec

Read `docs/protocol.md` and keep it authoritative.

Topics:

- `arana/cmd` — commands, QoS 0.
- `arana/telemetry` — telemetry, QoS 0.
- `arana/brain/state` — brain state, do not publish from the phone.
- `arana/brain/stimulus` — brain stimulus, do not publish from the phone.

Commands:

```json
{"kind":"move","forward":0.6,"turn":-0.2}
{"kind":"stop"}
{"kind":"gait","gait":"tetrapod"}
{"kind":"mode","mode":"manual"}
{"kind":"pose","pose":"hello"}
```

- `forward` and `turn` are clamped to −1..1.
- Positive `turn` = left.
- Gaits: `tetrapod`, `wave`, `rest`.
- Modes: `auto`, `manual`.
- Poses: `fighting`, `standby`, `pushup`, `sleep`, `lie`, `hello`, `dance3`, `dance2`, `dance1`.

Telemetry:

```json
{"t":0,"x":0.0,"y":0.0,"z":0.0,"yaw":0.0,"distance":null,"gait":"tetrapod","mode":"auto","joints":[45,65,45,65,45,65,45,65]}
```

- `joints` must have exactly 8 finite numbers.
- Reject non-finite values and wrong lengths; do not silently pad.
- `distance` may be `null`; show `no echo`.
- Preserve unknown fields? For decode, ignore unknown fields. For encode, emit only the known
  fields.
- The `Command` sealed class must include `Pose`. `CmdKind` already has `POSE`; use it.

## 13. Body Mode (EVA2 demo)

Keep `BodyModeActivity` as an optional demo body, reachable from the overflow. It is not a main
tab. It exists so two app instances can demonstrate the EVA2 interconnection requirement without
the desktop.

- It uses the same app-scoped `LinkManager` and the same broker.
- It subscribes to `arana/cmd` and publishes telemetry to `arana/telemetry` at 10 Hz.
- It must use the current hip/knee semantics:
  - 8 joints in the order above.
  - Neutral: hips ±45°, knees 65°.
  - Moving: advance the gait phase, swing the knees, keep the body level.
  - Do not use `FEMUR_SWING`, `TIBIA_REST`, or `TIBIA_LIFT` labels; replace them with hip/knee.
- It applies `move`, `stop`, `gait`, `mode`, and `pose` (pose may set a short static pose; if the
  full firmware keyframes are too much, document a safe subset and do not pretend).
- It shows the last 30 commands and a clear `BODY MODE — this phone is the body` banner.
- Only one body should publish telemetry on the broker at a time. Document this.
- `BodySimTest` must be updated to the new semantics and pass.

## 14. Design system

Match the desktop instrument panel, not generic Material demo styling.

- Background `#0E1114`, surface `#161A1E`, elevated surface `#1C2228`.
- Primary teal `#4DD0E1`; on-primary `#00363D`; warning amber `#FFB74D`; danger `#EF5350`;
  success `#66BB6A`; text `#E6EDF3`; muted `#8B98A5`; border `#2A333C`.
- Type: system sans for labels; `monospace` for numbers, coordinates, angles, packet log.
- Spacing: 4/8/12/16/24 dp. Corners: 8 dp for panels, 12 dp for dialogs. No pill everything.
- No gradients, no glassmorphism, no emoji, no fake charts, no card-inside-card.
- Minimum touch target 48 dp. Buttons that can be pressed while driving are at least 56 dp.
- Support 360–800 dp width. In landscape, the Console uses a two-column layout: map left,
  controls right. Actions stays a 3×3 grid. Servos stays 4 rows.
- Dark theme only. Do not add a light theme.
- Content descriptions for the joystick, STOP, connection dot, and every icon.
- Text must not be clipped at font scale 1.3; use `autoSizeTextType` or wrap.

## 15. Dependencies and Gradle

Keep the existing dependencies. Add only:

```kotlin
implementation("com.hivemq:hivemq-mqtt-client:1.3.3")
implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.7")
implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.8.7")
implementation("androidx.security:security-crypto:1.1.0-alpha06")
implementation("androidx.constraintlayout:constraintlayout:2.2.0")
implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
```

- Turn on `viewBinding = true`.
- Keep `minifyEnabled false` for the debug deliverable. If you enable minify, add HiveMQ/Netty
  ProGuard rules and verify the release build; do not ship an unverified minified build.
- Add the packaging excludes from section 6.2.
- `android/local.properties` stays gitignored; do not commit SDK paths.
- Do not add Firebase, Room, Hilt, Compose, Retrofit, OkHttp, or a chart library.

## 16. Manifest and security config

- `LoginActivity` is the launcher and the only exported activity.
- `MainActivity` and `BodyModeActivity` are not exported.
- `INTERNET` permission.
- Remove `usesCleartextTraffic="true"` from the main manifest. Add
  `android:networkSecurityConfig="@xml/network_security_config"`.
- Main config: cleartext false. Debug config: cleartext true for the LAN/Tailscale demo. Use a
  `src/debug/AndroidManifest.xml` override or a debug network-security config; do not weaken the
  release build.
- No `android:debuggable` in the main manifest.
- `allowBackup=false`.
- Do not add a trust-all `X509TrustManager`. Do not pin Cloudflare's certificate unless you can
  verify rotation; the platform trust store is the correct default.
- Do not store the password in `SharedPreferences` plaintext. Use EncryptedSharedPreferences.
- Do not put credentials in `Intent` extras. The app-scoped `LinkManager` owns them.
- Redact `BrokerCredentials.toString()`.
- Never log `Mqtt3Connect` or the password. HiveMQ/Netty debug logging must be off in release.
- Document the security tradeoff of the public demo credentials in `README.md`.

## 17. Tests

Unit tests (JVM, no device):

1. `BrokerUrlTest` — all four schemes, default and explicit ports, `/mqtt` default, invalid
   schemes, empty host, userinfo rejection.
2. `LoginFormTest` — empty URL/username/password, valid form, invalid URL, whitespace trimming,
   password not trimmed.
3. `ProtocolCodecTest` — existing tests plus `Pose` encode/decode, unknown kind ignored, wrong
   joints length rejected, non-finite joints rejected, distance null.
4. `BodySimTest` — updated hip/knee order and neutral values; move/stop/gait/mode; 5 s idle
   returns auto.
5. Delete `PasswordHasherTest` and any `UserDb` tests. Do not keep tests for deleted classes.

Do not write instrumented tests that need a broker in CI. Manual acceptance covers the broker.

Manual acceptance:

- Correct credentials → Main, telemetry if Electron is connected.
- Wrong password → specific error, still on Login.
- Wrong host → `Cannot reach the server`.
- Airplane mode / broker down → error or reconnect banner; no crash.
- Kill Wi-Fi while driving → stop is sent; reconnect; controls recover.
- Electron on Loopback → phone connects, no telemetry, banner appears.
- Electron on MQTT → phone drives the twin; joystick sign correct; STOP works.
- Actions → nine poses; each sends one command.
- Servos → values match telemetry order.
- Body Mode on a second device → second Console receives telemetry and can drive it.
- Rotate, background/foreground, logout, login again.

## 18. Build and verification

Run from `android/` on the T420:

```bash
ANDROID_HOME=/home/iwakura/Android/Sdk ./gradlew test --no-daemon
ANDROID_HOME=/home/iwakura/Android/Sdk ./gradlew lintDebug --no-daemon
ANDROID_HOME=/home/iwakura/Android/Sdk ./gradlew assembleDebug --no-daemon
```

Expected APK:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

If `adb devices` shows a device:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.arana.controller/.LoginActivity
```

If no device is attached, use the AVD `morris_test` and say so. Do not claim A55 installation
without `adb devices` evidence. Do not run `gradlew` without `ANDROID_HOME` and then report a
false failure; the SDK is at `/home/iwakura/Android/Sdk`.

Also run the repository checks that are relevant and do not modify `src/`:

```bash
npm test
npm run lint
```

If those fail for reasons unrelated to Android, report the baseline failure; do not fix the
desktop in this task.

## 19. Documentation deliverables

Update `README.md` with:

1. One-paragraph product description: phone command center for the Electron LA072 twin.
2. Exact login flow and the demo defaults.
3. **Electron preflight**: start Electron, Link → MQTT, URL, username, password, connect.
4. **Phone flow**: install, login, Console, Actions, Servos.
5. Broker URL examples: Cloudflare WSS, LAN WS, Tailscale WS, emulator WS.
6. Security notes: TLS, encrypted remember, no local account DB, demo credentials are public
   test values, rotate before deployment.
7. EVA2 mapping table: login = remote MQTT authentication; monitoring = Console; activator =
   joystick/slider/radio/switch; interconnection = Body Mode + Console on two devices; security
   = TLS/encrypted storage/no secrets in logs; stability = reconnect/stop-on-pause.
8. Known limitations: no installer, no 3D on phone, body must be connected, Cloudflare tunnel
   must be live.

Update `docs/remote-control.md` to the single-login model. Remove the profile matrix and the
separate connection screen. Keep the T420 broker facts, URLs, and security notes.

Add `docs/screenshots/android-login.png`, `android-console.png`, `android-actions.png`,
`android-servos.png` if you can capture them. If not, say so; do not fabricate.

## 20. Anti-slop checklist

Before you finish, verify every item:

- [ ] The Connect button performs a real MQTT CONNECT; a wrong password fails visibly.
- [ ] No local account database, no `UserDb`, no `PasswordHasher`, no `ConnectionActivity`.
- [ ] The login is the only entry point; Main cannot open without a connection.
- [ ] The default URL is the Cloudflare WSS URL; the user can edit it.
- [ ] HiveMQ is used; Paho is gone.
- [ ] TLS is used for `wss`/`ssl`; no trust-all.
- [ ] The password never appears in logcat, Intents, or crash reports.
- [ ] Remembered credentials are encrypted; unchecking Remember clears the stored password.
- [ ] The Console shows a real no-telemetry state when Electron is on Loopback.
- [ ] The connection dot and the body/telemetry state are separate facts.
- [ ] The joystick sign matches the protocol (right = negative turn).
- [ ] STOP works from every tab and on `onStop`.
- [ ] Nine actions send the nine exact pose names.
- [ ] Servos are read-only and show `--` without telemetry.
- [ ] No dead buttons, no "coming soon", no placeholder charts.
- [ ] No 3D view on the phone.
- [ ] The app works at 360 dp and in landscape.
- [ ] `gradlew test`, `lintDebug`, and `assembleDebug` pass; the APK exists.
- [ ] The README contains the Electron preflight and the test-credential warning.
- [ ] The feature document is updated with the actual outcome, not a plan.
- [ ] No commit or push was made unless the user asked.

## 21. Implementation order

1. Read the files in section 2; record the baseline.
2. Add `Pose`/`PoseCmd` and codec tests; run the tests.
3. Remove the old auth/connection classes and their tests; add `BrokerUrl`,
   `BrokerCredentials`, `BrokerCredentialsStore`, `LinkManager`, `LoginViewModel`,
   `LoginActivity`.
4. Replace Paho with HiveMQ; verify the WSS connection with the preflight command.
5. Build the Login screen; test correct/wrong credentials.
6. Build MainActivity with three tabs, toolbar, connection dialog, overflow, logout.
7. Build Console: map, joystick, throttle, gait, mode, STOP, telemetry, packet log, banner.
8. Build Actions and Servos.
9. Update Body Mode to hip/knee and keep it optional.
10. Tests, lint, build, APK, install if possible.
11. README, remote-control doc, screenshots.
12. Final anti-slop pass; report.

Keep each step compiling. Do not leave the app in a broken intermediate state for long. If a step
is too large, split it, but do not invent a different architecture.

## 22. Report format

When you finish, return:

1. **What changed** — files and behaviors.
2. **Connection** — exact URL used, login result, error cases tested.
3. **Electron control** — evidence that the twin received commands and published telemetry.
4. **Checks** — each command and its observed result (`test`, `lintDebug`, `assembleDebug`,
   APK path, install).
5. **Screenshots** — paths or an honest "not captured".
6. **Limitations** — anything not done, especially A55 installation and Cloudflare DNS.
7. **Risk line** — `Risk: item N (reason)` or `Risk: none`, using the high-risk list.
8. **Next step** — one concrete action.

Do not say "done" if the APK was not built or the broker login was not tested. Partial is a valid
result; fake success is not.

## Appendix A — current user request (verbatim, Spanish)

> este plan, quiero que en temas de conexión sea sencillo, al abrir la app, login, poner las
> credenciales del server del t420 donde se sirve el cerebro de la araña por medio de cloudflare,
> el user es conectoma y la pass es cont1234, con eso se entra y se controla la araña de electron,
> ajusta el prompt a eso, y vuelve a mandarmelo como te lo pedí la última vez

## Appendix B — original request (verbatim, Spanish)

> está verdaderamente increible el resultado, espero el commit y el push estuviese bien hecho,
> vamos por buen camino, ahora tenemos que trabajar en la apk, hagamos el prompt para que el
> centro de mando pase al celular, y así poder usar el a55 para controlar la araña, asi que
> necesito crear el prompt con el que el agente claude, hará la apk que será el centro de mando,
> podriamos comenzar ahora a ir planificando esto, comencemos

## Appendix C — assumptions

- The user supplied `conectoma` / `cont1234` as working test credentials for the T420 broker. If
  they are wrong, the app must fail visibly; do not hardcode a bypass.
- `wss://mqtt.t420.dev/mqtt` is the intended Cloudflare endpoint. The tunnel may not be live at
  build time; report the exact error and keep the URL editable.
- The Electron twin is the body. It must be connected to the same broker. The phone does not
  embed it.
- The physical LAFVIN kit is not available yet; this task is the phone command center, not
  hardware bring-up.
