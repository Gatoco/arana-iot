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
  password file in `/etc/mosquitto/passwd.bak-20261021-184329`). Passwords are never stored in
  this repository.
- Verified from the Garuda desktop: WebSocket on the LAN and on Tailscale, TCP 1883, wrong
  password rejected (`Not authorized`), and `src/net/mqtt.integration.test.ts` green against
  `ws://localhost:9001/mqtt` on the T420.
- Cloudflare Tunnel `morris` is running (`/etc/cloudflared/config.yml`) but has **no MQTT
  hostname yet**. `mqtt.t420.dev` below is a proposal, not a live address.

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

## Android handoff (later)

The Android app in `android/` already speaks this protocol (Paho, login, control, body mode).
For remote use:

- `MqttAsyncClient("wss://mqtt.t420.dev/mqtt", clientId, MemoryPersistence())` (or the LAN /
  Tailscale URL while testing).
- `MqttConnectOptions`: username/password, `isCleanSession = true`,
  `isAutomaticReconnect = true`, `connectionTimeout = 10`, `keepAliveInterval = 30`.
- Subscribe `arana/telemetry` QoS 0; publish `arana/cmd` QoS 0 (same as the twin).
- New command available: `{"kind":"pose","pose":"hello"}` (names in `docs/protocol.md`).
- Joint telemetry semantics are now hip/knee degrees (see `docs/protocol.md`); Body Mode's
  synthetic telemetry should follow them.
- Store broker credentials in `EncryptedSharedPreferences`, never in source. The app login
  (local SQLite + SHA-256 + salt) is not broker authentication.
- `INTERNET` permission; TLS through the system trust store (Cloudflare's certificate is public).
