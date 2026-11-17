'use client';
export default function Controls3D({ zoomBy, reset, hint }: { zoomBy: (k: number) => void; reset: () => void; hint: string }) {
  return (
    <div className="ctl3d">
      <span className="dim">{hint}</span>
      <span style={{ flex: 1 }} />
      <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.15)}>−</button>
      <button type="button" aria-label="Reset view" onClick={reset}>⟲</button>
    </div>
  );
}
