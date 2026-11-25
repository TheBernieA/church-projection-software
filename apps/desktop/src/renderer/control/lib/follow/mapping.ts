import type { CameraView, FramePoint, FrameRect } from '@lampstand/core';

/**
 * Between a camera's picture and a monitor showing it (with its digital shot and mirror), in
 * fractions of each. The detector works on the whole picture; the operator sees the shot.
 */
export function pictureToMonitor(p: FramePoint, view: CameraView, mirror: boolean): FramePoint {
  const x = (p.x - (view.x - 0.5 / view.zoom)) * view.zoom;
  const y = (p.y - (view.y - 0.5 / view.zoom)) * view.zoom;
  return { x: mirror ? 1 - x : x, y };
}

export function monitorToPicture(p: FramePoint, view: CameraView, mirror: boolean): FramePoint {
  const mx = mirror ? 1 - p.x : p.x;
  return {
    x: view.x - 0.5 / view.zoom + mx / view.zoom,
    y: view.y - 0.5 / view.zoom + p.y / view.zoom,
  };
}

/** A person's outline on the monitor (null when it's entirely outside the shot). */
export function boxOnMonitor(b: FrameRect, view: CameraView, mirror: boolean): FrameRect | null {
  const a = pictureToMonitor({ x: b.x, y: b.y }, view, mirror);
  const c = pictureToMonitor({ x: b.x + b.w, y: b.y + b.h }, view, mirror);
  const x0 = Math.max(0, Math.min(a.x, c.x));
  const x1 = Math.min(1, Math.max(a.x, c.x));
  const y0 = Math.max(0, a.y);
  const y1 = Math.min(1, c.y);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
