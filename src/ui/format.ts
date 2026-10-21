/** Pure display helpers shared by the HUD, the status bar and the panels. */

import type { TransportStatus } from "../net/transport";

export type LinkState = "connected" | "connecting" | "error" | "offline";

export function linkState(t: TransportStatus): LinkState {
  if (t.connected) return "connected";
  if (t.error) return "error";
  if (t.connecting) return "connecting";
  return "offline";
}

export const LINK_LABEL: Record<LinkState, string> = {
  connected: "connected",
  connecting: "connecting",
  error: "error",
  offline: "offline",
};

export function formatDistance(distance: number | null): string {
  return distance == null ? "no echo" : `${Math.round(distance * 100)} cm`;
}
