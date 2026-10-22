# Android command center — demo script

Use this script for the EVA2 demo and for regression checks. The phone app is a controller; the
Electron app is the 3D body. Both must be connected to the same T420 Mosquitto broker.

## 0. Preflight

1. Build and install:

   ```bash
   cd android
   ANDROID_HOME=/home/iwakura/Android/Sdk ./gradlew test lintDebug assembleDebug
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

2. Broker addresses:

   | Client | URL |
   | --- | --- |
   | Phone on the same LAN | `ws://192.168.1.79:9001/mqtt` |
   | Phone on Tailscale | `ws://100.66.97.18:9001/mqtt` |
   | Internet, after the tunnel is provisioned | `wss://mqtt.t420.dev/mqtt` |

   `mqtt.t420.dev` is the app default but is not live yet. Use the LAN or Tailscale URL in the
   Server URL field for the demo.

3. Credentials: `conectoma` / `cont1234`. These are classroom test credentials and are public in
   the repository. Do not reuse them.

## 1. Login and error handling

1. Launch the app. It opens on Login with the demo fields prefilled.
2. Change the URL to `ws://127.0.0.1:1/mqtt` and tap Connect. Expected: “Cannot reach the server”;
   the app stays on Login.
3. Restore the LAN/Tailscale URL and enter a wrong password. Expected: “Invalid username or
   password”; the app stays on Login.
4. Enter `cont1234` and tap Connect. Expected: the Console opens and the toolbar shows the link
   state.

## 2. Electron body

1. Open the Electron app on the desktop.
2. In Link, switch from Loopback to MQTT.
3. Enter the same URL, `conectoma`, `cont1234`, then Connect.
4. Confirm that the desktop twin’s telemetry and 3D view are live.
5. Return to the phone. The Console should show fresh telemetry. If it shows
   `NO TELEMETRY — connect the Electron body to the same broker.`, the desktop is still on
   Loopback or on a different broker.

## 3. Console

1. Push the joystick up: the twin walks forward; the map marker moves.
2. Push right: the twin turns right; the packet log shows a negative `turn` (the protocol’s
   positive turn is left).
3. Move the throttle slider: speed scales without changing direction.
4. Tap STOP: the twin stops and the gait returns to rest.
5. Switch gait TETRAPOD / WAVE: the twin changes gait.
6. Toggle Manual off: the mode returns to auto after the operator-idle timeout; confirm the
   telemetry mode changes.
7. Cut Wi-Fi or stop the broker: the reconnect banner appears and controls are disabled. Restore
   the link: the app reconnects and telemetry resumes.

## 4. Actions and servos

1. Open Actions. Tap `dance3` (Leg Raise). The packet log shows
   `{"kind":"pose","pose":"dance3"}`.
2. Tap `hello` (Greet). The twin plays the action if the body supports it.
3. Open Servos. Confirm eight read-only hip/knee values and the firmware channel map.
4. Do not expect per-servo sliders: the firmware has no per-servo command over MQTT.

## 5. Body Mode (two-instance demo)

1. On phone A, open the overflow menu and choose Body Mode (demo). Confirm the warning that only
   one body should publish telemetry.
2. On phone B, log in to the same broker and open the Console. It receives phone A’s synthetic
   telemetry.
3. Drive from phone B; phone A’s command log shows the commands.
4. Stop Body Mode before reconnecting the Electron twin, otherwise two bodies publish on
   `arana/telemetry`.

## 6. Evidence to capture

- Login with the wrong-password error.
- Console with live telemetry and the tactical map.
- Actions after sending `dance3`.
- Servos matrix.
- Body Mode on one device and Console on the other.
- Reconnect banner after a network cut.

Filter logcat for accidental credentials:

```bash
adb logcat -d | grep -i -E 'cont1234|password'
```

Expected: no match for the password value.

## Known blockers at commit time

- `mqtt.t420.dev` is not yet in the Cloudflare tunnel; the default URL fails until it is added.
- The A55 was not attached to the T420 during implementation; installation on it is pending.
- The real Electron body over MQTT was not exercised; a test publisher was used as the body.
