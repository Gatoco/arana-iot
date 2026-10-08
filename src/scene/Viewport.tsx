import { useEffect, useRef } from "react";
import { SpiderView } from "./SpiderView";
import type { TwinRuntime } from "../runtime/TwinRuntime";
import { useTwin } from "../runtime/useTwin";

export function Viewport({ runtime }: { runtime: TwinRuntime }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SpiderView | null>(null);
  const snapshot = useTwin(runtime);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = new SpiderView(canvas);
    viewRef.current = view;
    const observer = runtime.subscribe(() => view.update(runtime.getSnapshot().state));
    view.update(runtime.getSnapshot().state);

    let raf = 0;
    const loop = () => {
      view.render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      observer();
      view.dispose();
      viewRef.current = null;
    };
  }, [runtime]);

  // Keep the view in sync with non-render state changes.
  useEffect(() => {
    viewRef.current?.update(snapshot.state);
  }, [snapshot.state]);

  return <canvas ref={canvasRef} className="h-full w-full block touch-none" />;
}
