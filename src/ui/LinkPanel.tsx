import { useState } from "react";
import { TOPIC } from "../protocol";
import { TRANSPORT_KIND, CONNECT_TIMEOUT_S, type TransportKind, type TransportStatus } from "../net/transport";
import { Button, Field, Segmented, inputClass } from "./controls";
import { LinkDot } from "./LinkDot";
import { LINK_LABEL, linkState } from "./format";

export interface LinkConfig {
  kind: TransportKind;
  url: string;
  username: string;
  password: string;
}

/** Broker addresses the operator can pick; the tunnel host is an example until provisioned. */
const BROKER_PRESETS = [
  { url: "ws://localhost:9001/mqtt", label: "Local (npm run broker)" },
  { url: "ws://192.168.1.79:9001/mqtt", label: "T420 LAN" },
  { url: "ws://100.66.97.18:9001/mqtt", label: "T420 Tailscale" },
  { url: "wss://mqtt.t420.dev/mqtt", label: "Cloudflare tunnel (example host)" },
];

export function LinkPanel({
  link,
  transport,
  onChange,
  onApply,
}: {
  link: LinkConfig;
  transport: TransportStatus;
  onChange: (next: LinkConfig) => void;
  onApply: (next: LinkConfig) => void;
}) {
  const [copied, setCopied] = useState(false);
  const state = linkState(transport);
  const mqtt = link.kind === TRANSPORT_KIND.MQTT;
  const busy = mqtt && state === "connecting";

  async function copyTopics() {
    const text = Object.values(TOPIC).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply(link);
      }}
    >
      <Segmented
        label="Transport"
        value={link.kind}
        onChange={(kind) => onApply({ ...link, kind })}
        options={[
          { value: TRANSPORT_KIND.LOOPBACK, label: "Loopback", title: "In-memory body, no broker" },
          { value: TRANSPORT_KIND.MQTT, label: "MQTT", title: "Broker over WebSocket" },
        ]}
      />
      {mqtt && (
        <>
          <Field label="Broker URL" hint="ws:// or wss:// · host:port also accepted">
            <input
              className={inputClass}
              value={link.url}
              list="broker-presets"
              spellCheck={false}
              placeholder="ws://localhost:9001/mqtt"
              onChange={(e) => onChange({ ...link, url: e.target.value })}
            />
            <datalist id="broker-presets">
              {BROKER_PRESETS.map((p) => (
                <option key={p.url} value={p.url}>
                  {p.label}
                </option>
              ))}
            </datalist>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Username">
              <input
                className={inputClass}
                value={link.username}
                autoComplete="username"
                spellCheck={false}
                onChange={(e) => onChange({ ...link, username: e.target.value })}
              />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={link.password}
                autoComplete="current-password"
                onChange={(e) => onChange({ ...link, password: e.target.value })}
              />
            </Field>
          </div>
        </>
      )}
      <div className="flex items-center gap-2">
        {mqtt &&
          (transport.connected || transport.connecting ? (
            <Button tone="default" onClick={() => onApply({ ...link, kind: TRANSPORT_KIND.LOOPBACK })} title="Disconnect and fall back to loopback">
              Disconnect
            </Button>
          ) : (
            <Button tone="accent" type="submit" disabled={busy}>
              Connect
            </Button>
          ))}
        <Button onClick={copyTopics} title={Object.values(TOPIC).join(", ")}>
          {copied ? "Copied" : "Copy topics"}
        </Button>
      </div>
      <div className="flex items-center gap-1.5 text-[11px]" role="status" aria-live="polite">
        <LinkDot transport={transport} />
        <span className={state === "error" ? "text-danger" : state === "connected" ? "text-ok" : "text-muted"}>
          {LINK_LABEL[state]}
        </span>
        <span className="truncate font-mono text-muted" title={transport.broker}>
          {transport.kind === TRANSPORT_KIND.MQTT ? transport.broker : "in-memory"}
        </span>
      </div>
      {transport.error && (
        <p className="break-words font-mono text-[10px] text-danger">{transport.error}</p>
      )}
      {mqtt && state === "connecting" && !transport.error && (
        <p className="text-[10px] text-muted">Waiting for the broker (timeout {CONNECT_TIMEOUT_S} s, then retries every 3 s).</p>
      )}
    </form>
  );
}
