# Remote control — T420 broker, Cloudflare tunnel, Android handoff

Status on 2026-10-21 (verified over SSH, nothing below is provisioned by this repository):

- T420 (`ssh t420`, Artix Linux with **runit**, LAN `192.168.1.79`, Tailscale `100.66.97.18`)
  already runs **Mosquitto** as a runit service (`sv status mosquitto`) with:

  ```
  listener 1883 0.0.0.0
  protocol mqtt
  listener 9001 0.0.0.0
  protocol websockets
  allow_anonymous false
  password_file /etc/mosquitto/passwd
  ```

- Broker users: `arana` (pre-existing) and `conectoma` (test user added 2026-10-21; backup of the
  password file in `/etc/mosquitto/passwd.bak-20261021-184329`). The `conectoma` password is
  public in the Android demo defaults (`android/app/src/main/res/values/strings.xml`) by explicit
  project-owner request. It is a test credential, not a production secret; rotate it before any
  public exposure.
- Verified from the Garuda desktop: WebSocket on the LAN and on Tailscale, TCP 1883, wrong
  password rejected (`Not authorized`), and `src/net/mqtt.integration.test.ts` green against
  `ws://localhost:9001/mqtt` on the T420.
- Cloudflare Tunnel `morris` is running (`/etc/cloudflared/config.yml`) but has **no MQTT
  hostname yet**. `mqtt.t420.dev` below is a proposal, not a live address. The Android app ships
  it as the default; until the ingress rule exists, use the LAN or Tailscale URL in the login
  screen.

## Broker addresses

| Client location | URL |
| --- | --- |
| On the T420 | `ws://localhost:9001/mqtt` |
| Same LAN | `ws://192.168.1.79:9001/mqtt` |
| Tailscale | `ws://100.66.97.18:9001/mqtt` |
| Internet (after the tunnel step) | `wss://mqtt.t420.dev/mqtt` |

## Hardening before exposing it

1. Keep 1883 and 9001 off the public internet; only the tunnel should reach 9001 from outside.
   Restrict both listeners to LAN + Tailscale with the firewall (or bind 9001 to `127.0.0.1`
   once the tunnel carries remote clients).
2. Replace the test password with a strong one before any public exposure:
   `sudo mosquitto_passwd /etc/mosquitto/passwd conectoma` then `sudo sv hup mosquitto`.
3. Mosquitto warns that `/etc/mosquitto/passwd` should be owned by group `root` (it is
   `root:mosquitto`); future versions will refuse it. Fix when convenient.
4. Optionally add an ACL (`acl_file`) so the phone user can only publish `arana/cmd` and read
   `arana/telemetry`.

## Cloudflare tunnel step (proposal)

Add one ingress rule above the catch-all in `/etc/cloudflared/config.yml` (back up first, as
the existing `.bak-*` files do), then route DNS and restart the runit service:

```yaml
  - hostname: mqtt.t420.dev
    service: http://localhost:9001
```

```bash
cloudflared tunnel route dns morris mqtt.t420.dev
sudo sv restart cloudflared
```

Cloudflare proxies WebSockets; TLS ends at Cloudflare and Mosquitto sees plain WebSocket on
localhost. Clients use `wss://mqtt.t420.dev/mqtt` with the broker username/password. Cloudflare
Access service tokens would add a second factor but need custom headers in every client; not
configured.

## Android command center

The app in `android/` is implemented (version `0.2.0`) and uses **HiveMQ MQTT Client 1.3.3**;
Paho was removed because it cannot do WebSocket/TLS on Android. It is a native Kotlin/XML
controller with three tabs (Console, Actions, Servos) and Body Mode as an optional demo.

- One login screen: Server URL, Username, Password, Remember, Connect. The MQTT CONNECT is the
  login; there is no local SQLite account database and no separate connection screen.
- Defaults: `wss://mqtt.t420.dev/mqtt`, `conectoma`, `cont1234` (test credentials; see the
  warning above). Remembered values go to `EncryptedSharedPreferences`; the password is never
  logged or passed through an Intent.
- The app waits for CONNACK, stays on Login on any failure, and shows specific errors for bad
  credentials, unreachable host, TLS failure and refused connection.
- Once connected, the toolbar shows the link state; the Connection dialog offers Disconnect,
  Logout and Body Mode. A dropped link shows a reconnect banner and disables controls.
- Console: 2D tactical map, joystick, throttle, gait, auto/manual, STOP, telemetry cards and
  packet log. If no telemetry arrives it shows `NO TELEMETRY — connect the Electron body to the
  same broker.`; it never pretends the body is moving.
- Actions: the nine firmware poses (`fighting`, `standby`, `pushup`, `sleep`, `lie`, `hello`,
  `dance3`, `dance2`, `dance1`). Servos: read-only hip/knee matrix with the firmware GPIO map.
- Debug builds allow cleartext only for the LAN/Tailscale hosts in
  `app/src/debug/res/xml/network_security_config.xml`; the main config keeps TLS on.
- Build and test:
  `ANDROID_HOME=/home/iwakura/Android/Sdk ./gradlew test lintDebug assembleDebug --no-daemon`.

### Electron preflight

The phone controls the desktop twin only when both are on the same broker. Open the Electron
app, switch Link from Loopback to MQTT, enter the same URL/user/password, and Connect. Confirm
telemetry on the desktop, then connect the phone. The phone does not launch Electron.

### Protocol

Subscribe `arana/telemetry` QoS 0; publish `arana/cmd` QoS 0. The only additive command is
`{"kind":"pose","pose":"hello"}` (names in `docs/protocol.md`). Joint telemetry is hip/knee
degrees in `FL, FR, RL, RR` order; Body Mode uses the same semantics.
