/**
 * PointMagnifier: a zoomed circular view with crosshair for precise point selection
 * when placing line/angle points. Shown in the bottom-right corner of the canvas.
 */

import { useEffect, useRef } from 'react';
import type { VideoTransform } from '../hooks/useVideoPlayer';

interface VideoBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PointMagnifierProps {
  /** Canvas (viewBox) coordinates of cursor */
  cursorX: number;
  cursorY: number;
  /** Canvas dimensions (viewBox) */
  W: number;
  H: number;
  /** Video content rect in canvas space */
  vBox: VideoBox;
  /** User transform */
  transform: VideoTransform;
  /** Video or image element to draw */
  mediaEl: HTMLVideoElement | HTMLImageElement | null;
  /** Size of the magnifier circle in pixels */
  size?: number;
  /** Zoom factor (e.g. 3 = 3x) */
  zoom?: number;
  /** Radius of the source region in viewBox units */
  sourceRadius?: number;
}

export default function PointMagnifier({
  cursorX,
  cursorY,
  W,
  H,
  vBox,
  transform,
  mediaEl,
  size = 120,
  zoom = 3,
  sourceRadius = 35,
}: PointMagnifierProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mediaEl) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // Draw full view to offscreen, then copy zoomed region
    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    const render = () => {
      const vw = 'videoWidth' in mediaEl ? mediaEl.videoWidth : (mediaEl as HTMLImageElement).naturalWidth;
      const vh = 'videoHeight' in mediaEl ? mediaEl.videoHeight : (mediaEl as HTMLImageElement).naturalHeight;
      if (vw <= 0 || vh <= 0) return;

      offCtx.save();
      offCtx.translate(W / 2, H / 2);
      offCtx.translate(transform.translateX, -transform.translateY);
      offCtx.scale(transform.scale, transform.scale);
      offCtx.translate(-W / 2, -H / 2);
      offCtx.drawImage(mediaEl, 0, 0, vw, vh, vBox.x, vBox.y, vBox.w, vBox.h);
      offCtx.restore();

      // Copy zoomed region to magnifier canvas
      const sw = sourceRadius * 2;
      const sh = sourceRadius * 2;
      const sx = Math.max(0, Math.min(W - sw, cursorX - sourceRadius));
      const sy = Math.max(0, Math.min(H - sh, cursorY - sourceRadius));

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(offscreen, sx, sy, sw, sh, 0, 0, size, size);

      // Crosshair at the position that corresponds to the cursor (may be off-center when clamped)
      // Round + offset for pixel-aligned stroke centering (adjust offset if crosshair looks off)
      const offset = -1.5;
      const cx = Math.round(((cursorX - sx) / sw) * size) + offset;
      const cy = Math.round(((cursorY - sy) / sh) * size) + offset;
      const len = 14;
      // Thick black outline for visibility on any background
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - len, cy);
      ctx.lineTo(cx + len, cy);
      ctx.moveTo(cx, cy - len);
      ctx.lineTo(cx, cy + len);
      ctx.stroke();
      // Bright white center
      ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - len, cy);
      ctx.lineTo(cx + len, cy);
      ctx.moveTo(cx, cy - len);
      ctx.lineTo(cx, cy + len);
      ctx.stroke();
    };

    render();
    const raf = requestAnimationFrame(function loop() {
      render();
      rafId = requestAnimationFrame(loop);
    });
    let rafId = raf;

    return () => cancelAnimationFrame(rafId);
  }, [cursorX, cursorY, W, H, vBox, transform, mediaEl, size, zoom, sourceRadius]);

  return (
    <div
      className="absolute bottom-4 right-4 pointer-events-none z-20 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        className="rounded-full overflow-hidden border-2 border-white shadow-xl ring-2 ring-black/30"
        style={{ width: size, height: size }}
      >
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          className="block w-full h-full"
          style={{ display: 'block' }}
        />
      </div>
    </div>
  );
}
