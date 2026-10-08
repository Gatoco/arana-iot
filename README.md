# arana-iot

Digital twin + web controller for the TI3042 IoT spider robot.

The twin (Three.js) speaks the **same MQTT protocol** the physical ESP kit
will speak, so swapping the simulated body for the real one changes only
the transport target — not the code.

## Stack

- React 19 + TypeScript + Vite
- Three.js (3D view)
- Tailwind CSS 4
- mqtt.js (broker transport) with an in-memory loopback fallback
- PWA (installable on Android)

## Scripts

```bash
npm run dev      # dev server
npm run build    # type-check + production build (PWA)
npm test         # sim self-checks (gait + IK)
npm run lint     # oxlint
```

## Architecture

```
src/protocol.ts        message contract shared by twin / brain / ESP
src/sim/               headless engine (no Three.js): model, gait, engine
src/net/transport.ts   Loopback | MQTT (same interface)
src/runtime/           binds engine + transport, exposes a React store
src/scene/             Three.js view of the spider
src/ui/                joystick, telemetry, servo bars
```

The engine owns all state. React only subscribes and draws. The future ESP
replaces the "body" on the other end of the broker.
