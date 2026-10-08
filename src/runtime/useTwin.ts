import { useSyncExternalStore } from "react";
import type { TwinRuntime, RuntimeSnapshot } from "./TwinRuntime";

/** Subscribe React to the twin runtime without manual memoization. */
export function useTwin(runtime: TwinRuntime): RuntimeSnapshot {
  return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
}
