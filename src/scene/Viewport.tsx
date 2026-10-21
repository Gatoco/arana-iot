import { useEffect, useRef, useState } from "react";
import { SpiderView, type CameraMode, type ViewOptions } from "./SpiderView";
import type { TwinRuntime } from "../runtime/TwinRuntime";

/** Mounts the imperative 3D view; the view reads engine state per tick, never React state. */
export function Viewport({
  runtime,
  cameraMode,
  options,
  onView,
}: {
  runtime: TwinRuntime;
  cameraMode: CameraMode;
  options: ViewOptions;
  onView?: (view: SpiderView | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SpiderView | null>(null);
  const onViewRef = useRef(onView);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    onViewRef.current = onView;
  }, [onView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let view: SpiderView;
    try {
      view = new SpiderView(canvas);
    } catch (err) {
      // No WebGL (blocked GPU, headless): keep the controls usable and say why.
      queueMicrotask(() => setFailure(err instanceof Error ? err.message : String(err)));
      return;
    }
    viewRef.current = view;
    view.pushState(runtime.engine.getState());
    const off = runtime.onTick((state) => view.pushState(state));
    onViewRef.current?.(view);
    return () => {
      off();
      onViewRef.current?.(null);
      view.dispose();
      viewRef.current = null;
    };
  }, [runtime]);

  useEffect(() => {
    viewRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    viewRef.current?.setOptions(options);
  }, [options]);

  return (
    <>
      <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="3D view of the spider test bench" />
      {failure && (
        <div role="alert" className="absolute inset-0 flex items-center justify-center p-6 text-center text-[12px] text-muted">
          <p className="max-w-sm">
            3D view unavailable: WebGL could not start ({failure}). The twin, its controls and the MQTT link keep running.
          </p>
        </div>
      )}
    </>
  );
}
