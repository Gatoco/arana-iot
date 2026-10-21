import { useEffect, useRef } from "react";
import { SpiderView, type CameraMode } from "./SpiderView";
import type { TwinRuntime } from "../runtime/TwinRuntime";

export function Viewport({ runtime, cameraMode }: { runtime: TwinRuntime; cameraMode: CameraMode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SpiderView | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = new SpiderView(canvas);
    viewRef.current = view;
    const unsubscribe = runtime.subscribe(() => view.update(runtime.getSnapshot().state));
    view.update(runtime.getSnapshot().state);

    let raf = 0;
    const loop = () => {
      view.render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      view.dispose();
      viewRef.current = null;
    };
  }, [runtime]);

  useEffect(() => {
    viewRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  return <canvas ref={canvasRef} className="block h-full w-full touch-none" />;
}
