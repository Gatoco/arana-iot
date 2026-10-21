/**
 * Bridge exposed by electron/preload.cjs. Absent in a plain browser (npm run dev, PWA):
 * callers must handle `undefined`.
 */
export interface DesktopBridge {
  platform: string;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(cb: (maximized: boolean) => void): () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export function desktop(): DesktopBridge | undefined {
  return typeof window === "undefined" ? undefined : window.desktop;
}
