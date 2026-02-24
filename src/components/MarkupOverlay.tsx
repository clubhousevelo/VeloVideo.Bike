/**
 * MarkupOverlay renders markup annotations (lines, angles, text, grid) over a video.
 *
 * Coordinate system
 * ─────────────────
 * All markup point coordinates (x, y) are stored in **normalized video-frame space**:
 *   x ∈ [0, 1]  → left … right edge of the video's displayed content box
 *   y ∈ [0, 1]  → top  … bottom edge of the video's displayed content box
 *
 * This makes markups independent of both canvas size (so they survive SBS ↔ Overlay
 * mode switches) and video transform (pan/zoom), because we apply the inverse transform
 * when recording clicks and the forward transform when rendering.
 *
 * Grid origin / spacing remain in canvas-pixel space and are intentionally not locked
 * to video content — the grid is a canvas reference overlay.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import type { MarkupHandle, Point } from '../hooks/useMarkup';
import type { VideoTransform } from '../hooks/useVideoPlayer';
import { calcAngleDeg } from '../hooks/useMarkup';

// ─── helpers ────────────────────────────────────────────────────────────────

interface VideoBox { x: number; y: number; w: number; h: number; }

/** Compute the letterbox/pillarbox display rect of a video inside a canvas. */
function computeVideoBox(canvasW: number, canvasH: number, videoAR: number): VideoBox {
  if (videoAR <= 0 || !isFinite(videoAR)) return { x: 0, y: 0, w: canvasW, h: canvasH };
  const canvasAR = canvasW / canvasH;
  if (canvasAR > videoAR) {
    const vH = canvasH;
    const vW = vH * videoAR;
    return { x: (canvasW - vW) / 2, y: 0, w: vW, h: vH };
  } else {
    const vW = canvasW;
    const vH = vW / videoAR;
    return { x: 0, y: (canvasH - vH) / 2, w: vW, h: vH };
  }
}

/**
 * Convert normalized video-frame coordinates → SVG canvas visual position.
 * Accounts for the video display box offset and the video CSS transform.
 */
function toVisual(nx: number, ny: number, vBox: VideoBox, W: number, H: number, vt: VideoTransform): Point {
  const cx = vBox.x + nx * vBox.w;
  const cy = vBox.y + ny * vBox.h;
  return {
    x: vt.scale * (cx - W / 2 + vt.translateX) + W / 2,
    y: vt.scale * (cy - H / 2 + vt.translateY) + H / 2,
  };
}

/**
 * Convert SVG canvas click position → normalized video-frame coordinates.
 * Inverse of toVisual.
 */
function toNormalized(canvasX: number, canvasY: number, vBox: VideoBox, W: number, H: number, vt: VideoTransform): Point {
  const contentX = (canvasX - W / 2) / vt.scale - vt.translateX + W / 2;
  const contentY = (canvasY - H / 2) / vt.scale - vt.translateY + H / 2;
  return {
    x: (contentX - vBox.x) / vBox.w,
    y: (contentY - vBox.y) / vBox.h,
  };
}

function angleArcPath(vertex: Point, p1: Point, p2: Point, radius: number): string {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (mag1 === 0 || mag2 === 0) return '';
  const u1 = { x: v1.x / mag1, y: v1.y / mag1 };
  const u2 = { x: v2.x / mag2, y: v2.y / mag2 };
  const start = { x: vertex.x + u1.x * radius, y: vertex.y + u1.y * radius };
  const end = { x: vertex.x + u2.x * radius, y: vertex.y + u2.y * radius };
  const cross = v1.x * v2.y - v1.y * v2.x;
  const sweepFlag = cross > 0 ? 1 : 0;
  const angleDeg = calcAngleDeg(p1, vertex, p2);
  const largeArc = angleDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweepFlag} ${end.x} ${end.y}`;
}

function angleLabelPos(vertex: Point, p1: Point, p2: Point, dist: number): Point {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (mag1 === 0 || mag2 === 0) return { x: vertex.x + dist, y: vertex.y };
  const bisect = { x: v1.x / mag1 + v2.x / mag2, y: v1.y / mag1 + v2.y / mag2 };
  const bmag = Math.sqrt(bisect.x ** 2 + bisect.y ** 2);
  if (bmag === 0) return { x: vertex.x, y: vertex.y - dist };
  return { x: vertex.x + (bisect.x / bmag) * dist, y: vertex.y + (bisect.y / bmag) * dist };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / (len * len);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Snap second point so the line is horizontal, vertical, or 45°. Uses visual coords for correct angles. */
function snapLineSecondPoint(
  p0Norm: Point,
  cursorNorm: Point,
  vis: (nx: number, ny: number) => Point,
  norm: (cx: number, cy: number) => Point
): Point {
  const p0v = vis(p0Norm.x, p0Norm.y);
  const cv = vis(cursorNorm.x, cursorNorm.y);
  const dx = cv.x - p0v.x;
  const dy = cv.y - p0v.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return cursorNorm;
  const angleRad = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snappedRad = Math.round(angleRad / step) * step;
  const snapX = p0v.x + len * Math.cos(snappedRad);
  const snapY = p0v.y + len * Math.sin(snappedRad);
  return norm(snapX, snapY);
}

const HANDLE_R = 6;
const HIT_THRESHOLD = 12;

// ─── component ──────────────────────────────────────────────────────────────

interface MarkupOverlayProps {
  handle: MarkupHandle;
  /** CSS transform applied to the video element (translate + scale). */
  transform: VideoTransform;
  /** Natural aspect ratio of the video (videoWidth / videoHeight). 0 = unknown → full canvas. */
  videoAR: number;
}

type DragState =
  | { kind: 'ep-line'; id: string; pointIndex: 0 | 1 }
  | { kind: 'ep-angle'; id: string; pointIndex: 0 | 1 | 2 }
  | { kind: 'body-line'; id: string; ox1: number; oy1: number; ox2: number; oy2: number; mx0: number; my0: number }
  | { kind: 'body-angle'; id: string; op1: Point; ov: Point; op2: Point; mx0: number; my0: number }
  | { kind: 'body-text'; id: string; ox: number; oy: number; mx0: number; my0: number }
  | { kind: 'box-resize'; id: string; origBoxNorm: number; startCanvasX: number };

export default function MarkupOverlay({ handle, transform, videoAR }: MarkupOverlayProps) {
  const { state, addLine, addAngle, addText, updateLine, updateAngle, updateText, setSelected, setTool, snapshotForUndo, removeItem } = handle;
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ width: 400, height: 300 });
  const [pendingPoints, setPendingPoints] = useState<Point[]>([]); // normalized
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null); // normalized
  const [editingText, setEditingText] = useState<{ id: string; normX: number; normY: number; value: string } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [shiftKey, setShiftKey] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSvgSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setPendingPoints([]);
    setHoverPoint(null);
    setEditingText(null);
  }, [state.tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (e.key === 'Shift') setShiftKey(true);
      if (e.key === 'Escape') {
        setPendingPoints([]);
        setEditingText(null);
        setDrag(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
        if (state.selected) {
          e.preventDefault();
          removeItem(state.selected.type, state.selected.id);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftKey(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [state.selected, removeItem]);

  // Derived helpers (re-computed per render but cheap)
  const W = svgSize.width;
  const H = svgSize.height;
  const vBox = computeVideoBox(W, H, videoAR);

  const vis = useCallback((nx: number, ny: number) => toVisual(nx, ny, vBox, W, H, transform), [vBox, W, H, transform]);
  const norm = useCallback((cx: number, cy: number) => toNormalized(cx, cy, vBox, W, H, transform), [vBox, W, H, transform]);

  // Get raw canvas-space mouse position from the SVG (no transform on SVG element itself)
  const getCanvasPoint = useCallback((e: React.MouseEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  // Hit test against visual (canvas) positions of stored items
  const hitTest = useCallback((canvasPt: Point) => {
    for (const line of state.lines) {
      const p1 = vis(line.x1, line.y1);
      const p2 = vis(line.x2, line.y2);
      if (distToSegment(canvasPt.x, canvasPt.y, p1.x, p1.y, p2.x, p2.y) <= HIT_THRESHOLD)
        return { type: 'line' as const, id: line.id };
    }
    for (const angle of state.angles) {
      const vp1 = vis(angle.p1.x, angle.p1.y);
      const vvx = vis(angle.vertex.x, angle.vertex.y);
      const vp2 = vis(angle.p2.x, angle.p2.y);
      if (distToSegment(canvasPt.x, canvasPt.y, vp1.x, vp1.y, vvx.x, vvx.y) <= HIT_THRESHOLD) return { type: 'angle' as const, id: angle.id };
      if (distToSegment(canvasPt.x, canvasPt.y, vvx.x, vvx.y, vp2.x, vp2.y) <= HIT_THRESHOLD) return { type: 'angle' as const, id: angle.id };
    }
    for (const text of state.texts) {
      const tp = vis(text.x, text.y);
      const boxW = text.boxWidth && text.boxWidth > 0 ? text.boxWidth * vBox.w : null;
      const approxW = boxW ?? text.content.length * text.size * 0.55;
      const approxH = text.size * 1.2;
      if (canvasPt.x >= tp.x && canvasPt.x <= tp.x + approxW && canvasPt.y >= tp.y - approxH && canvasPt.y <= tp.y + 4)
        return { type: 'text' as const, id: text.id };
    }
    return null;
  }, [state.lines, state.angles, state.texts, vis]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvasPt = getCanvasPoint(e);
    if (drag) {
      e.preventDefault();
      if (drag.kind === 'ep-line') {
        const n = norm(canvasPt.x, canvasPt.y);
        if (drag.pointIndex === 0) updateLine(drag.id, { x1: n.x, y1: n.y });
        else updateLine(drag.id, { x2: n.x, y2: n.y });
      } else if (drag.kind === 'ep-angle') {
        const n = norm(canvasPt.x, canvasPt.y);
        // Read current stored angle to get the two non-dragged points,
        // then compute angleDeg from visual (pixel) coords for accuracy
        const cur = state.angles.find((a) => a.id === drag.id);
        if (cur) {
          const newP1 = drag.pointIndex === 0 ? n : cur.p1;
          const newVertex = drag.pointIndex === 1 ? n : cur.vertex;
          const newP2 = drag.pointIndex === 2 ? n : cur.p2;
          const vP1 = vis(newP1.x, newP1.y);
          const vVx = vis(newVertex.x, newVertex.y);
          const vP2 = vis(newP2.x, newP2.y);
          updateAngle(drag.id, {
            p1: drag.pointIndex === 0 ? n : undefined,
            vertex: drag.pointIndex === 1 ? n : undefined,
            p2: drag.pointIndex === 2 ? n : undefined,
            angleDeg: calcAngleDeg(vP1, vVx, vP2),
          });
        }
      } else if (drag.kind === 'body-line') {
        // Delta in content canvas space, then normalized
        const dx = (canvasPt.x - drag.mx0) / transform.scale / vBox.w;
        const dy = (canvasPt.y - drag.my0) / transform.scale / vBox.h;
        updateLine(drag.id, { x1: drag.ox1 + dx, y1: drag.oy1 + dy, x2: drag.ox2 + dx, y2: drag.oy2 + dy });
      } else if (drag.kind === 'body-angle') {
        const dx = (canvasPt.x - drag.mx0) / transform.scale / vBox.w;
        const dy = (canvasPt.y - drag.my0) / transform.scale / vBox.h;
        const newP1 = { x: drag.op1.x + dx, y: drag.op1.y + dy };
        const newVertex = { x: drag.ov.x + dx, y: drag.ov.y + dy };
        const newP2 = { x: drag.op2.x + dx, y: drag.op2.y + dy };
        const vP1 = vis(newP1.x, newP1.y);
        const vVx = vis(newVertex.x, newVertex.y);
        const vP2 = vis(newP2.x, newP2.y);
        updateAngle(drag.id, { p1: newP1, vertex: newVertex, p2: newP2, angleDeg: calcAngleDeg(vP1, vVx, vP2) });
      } else if (drag.kind === 'body-text') {
        const dx = (canvasPt.x - drag.mx0) / transform.scale / vBox.w;
        const dy = (canvasPt.y - drag.my0) / transform.scale / vBox.h;
        updateText(drag.id, { x: drag.ox + dx, y: drag.oy + dy });
      } else if (drag.kind === 'box-resize') {
        const deltaPixels = canvasPt.x - drag.startCanvasX;
        const newBoxNorm = Math.max(0.04, drag.origBoxNorm + deltaPixels / vBox.w);
        updateText(drag.id, { boxWidth: newBoxNorm });
      }
      return;
    }
    if (state.tool !== 'none') setHoverPoint(norm(canvasPt.x, canvasPt.y));
  }, [drag, state.angles, vis, getCanvasPoint, norm, transform.scale, vBox.w, vBox.h, updateLine, updateAngle, updateText, state.tool]);

  const handleMouseLeave = useCallback(() => { setHoverPoint(null); }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvasPt = getCanvasPoint(e);
    if (state.tool === 'none') {
      const hit = hitTest(canvasPt);
      if (hit) {
        e.stopPropagation();
        setSelected(hit);
        snapshotForUndo();
        if (hit.type === 'line') {
          const line = state.lines.find((l) => l.id === hit.id);
          if (line) setDrag({ kind: 'body-line', id: hit.id, ox1: line.x1, oy1: line.y1, ox2: line.x2, oy2: line.y2, mx0: canvasPt.x, my0: canvasPt.y });
        } else if (hit.type === 'angle') {
          const angle = state.angles.find((a) => a.id === hit.id);
          if (angle) setDrag({ kind: 'body-angle', id: hit.id, op1: { ...angle.p1 }, ov: { ...angle.vertex }, op2: { ...angle.p2 }, mx0: canvasPt.x, my0: canvasPt.y });
        } else if (hit.type === 'text') {
          const text = state.texts.find((t) => t.id === hit.id);
          if (text) setDrag({ kind: 'body-text', id: hit.id, ox: text.x, oy: text.y, mx0: canvasPt.x, my0: canvasPt.y });
        }
      } else {
        setSelected(null);
      }
      return;
    }
    e.stopPropagation();
  }, [state.tool, state.lines, state.angles, state.texts, getCanvasPoint, hitTest, setSelected, snapshotForUndo]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (state.tool === 'none') return;
    e.stopPropagation();
    const canvasPt = getCanvasPoint(e);
    const n = norm(canvasPt.x, canvasPt.y);

    if (state.tool === 'line') {
      if (pendingPoints.length === 0) {
        setPendingPoints([n]);
      } else {
        const p2 = e.shiftKey ? snapLineSecondPoint(pendingPoints[0], n, vis, norm) : n;
        addLine({ x1: pendingPoints[0].x, y1: pendingPoints[0].y, x2: p2.x, y2: p2.y, color: state.activeColor, width: state.lineWidth });
        setPendingPoints([]);
        setTool('none');
      }
    } else if (state.tool === 'angle') {
      const snapped = e.shiftKey && pendingPoints.length >= 1
        ? snapLineSecondPoint(pendingPoints[pendingPoints.length - 1], n, vis, norm)
        : n;
      const next = [...pendingPoints, snapped];
      if (next.length < 3) {
        setPendingPoints(next);
      } else {
        const [p1, vertex, p2] = next;
        addAngle({ p1, vertex, p2, color: state.activeColor, width: state.lineWidth, angleDeg: calcAngleDeg(vis(p1.x, p1.y), vis(vertex.x, vertex.y), vis(p2.x, p2.y)) });
        setPendingPoints([]);
        setTool('none');
      }
    } else if (state.tool === 'text') {
      setEditingText({ id: '', normX: n.x, normY: n.y, value: '' });
    }
  }, [state.tool, state.activeColor, state.lineWidth, pendingPoints, addLine, addAngle, setTool, getCanvasPoint, norm, vis]);

  const commitText = useCallback(() => {
    if (editingText) {
      if (editingText.id) {
        if (editingText.value.trim()) updateText(editingText.id, { content: editingText.value });
      } else if (editingText.value.trim()) {
        addText({ x: editingText.normX, y: editingText.normY, content: editingText.value, size: state.textSize, color: state.activeColor });
        setTool('none');
      }
    }
    setEditingText(null);
  }, [editingText, addText, updateText, setTool, state.textSize, state.activeColor]);

  const startEpLineDrag = useCallback((id: string, pointIndex: 0 | 1) => (e: React.MouseEvent) => {
    e.stopPropagation();
    snapshotForUndo();
    setDrag({ kind: 'ep-line', id, pointIndex });
  }, [snapshotForUndo]);

  const startEpAngleDrag = useCallback((id: string, pointIndex: 0 | 1 | 2) => (e: React.MouseEvent) => {
    e.stopPropagation();
    snapshotForUndo();
    setDrag({ kind: 'ep-angle', id, pointIndex });
  }, [snapshotForUndo]);

  useEffect(() => {
    if (!drag) return;
    const onUp = () => setDrag(null);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [drag]);

  if (state.hidden) return null;

  const isToolActive = state.tool !== 'none';
  const isDragging = drag !== null;
  const hasContent = state.grid.show || state.lines.length > 0 || state.angles.length > 0 || state.texts.length > 0;
  const dropShadow = 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))';

  // ─── grid (canvas-space, intentionally NOT locked to video content) ───────
  const gridLines: React.ReactElement[] = [];
  if (state.grid.show) {
    const { spacingPx, mode, color, opacity, originX, originY } = state.grid;
    const sp = Math.max(10, spacingPx);
    if (mode === 'horizontal' || mode === 'both') {
      let y = originY % sp; if (y < 0) y += sp;
      for (; y <= H + sp; y += sp)
        gridLines.push(<line key={`h${y}`} x1={0} y1={y} x2={W} y2={y} stroke={color} strokeOpacity={opacity} strokeWidth={1} />);
    }
    if (mode === 'vertical' || mode === 'both') {
      let x = originX % sp; if (x < 0) x += sp;
      for (; x <= W + sp; x += sp)
        gridLines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={H} stroke={color} strokeOpacity={opacity} strokeWidth={1} />);
    }
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: isToolActive || hasContent ? 'all' : 'none' }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        className={isToolActive ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : ''}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{ pointerEvents: isToolActive || hasContent ? 'all' : 'none' }}
      >
        {gridLines}

        {state.lines.map((line) => {
          const p1 = vis(line.x1, line.y1);
          const p2 = vis(line.x2, line.y2);
          const isSel = state.selected?.type === 'line' && state.selected.id === line.id;
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy);
          // Acute angle with horizontal: 0–90°
          let lineAngleDeg: number | null = null;
          if (line.showAngle && len > 1e-6) {
            let deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
            if (deg > 90) deg = 180 - deg;
            lineAngleDeg = deg;
          }
          return (
            <g key={line.id}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} style={{ cursor: 'grab' }} />
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={line.color} strokeWidth={line.width} strokeLinecap="round" style={{ filter: dropShadow, pointerEvents: 'none' }} />
              {lineAngleDeg != null && (
                <text x={mid.x} y={mid.y - 10} fill={line.color} fontSize={12} fontWeight="600" textAnchor="middle" dominantBaseline="middle" style={{ filter: dropShadow, userSelect: 'none', pointerEvents: 'none' }}>
                  {lineAngleDeg.toFixed(1)}°
                </text>
              )}
              {isSel && (
                <>
                  <circle cx={p1.x} cy={p1.y} r={HANDLE_R} fill="white" stroke={line.color} strokeWidth={2} style={{ cursor: 'crosshair' }} onMouseDown={startEpLineDrag(line.id, 0)} />
                  <circle cx={p2.x} cy={p2.y} r={HANDLE_R} fill="white" stroke={line.color} strokeWidth={2} style={{ cursor: 'crosshair' }} onMouseDown={startEpLineDrag(line.id, 1)} />
                </>
              )}
            </g>
          );
        })}

        {state.angles.map((angle) => {
          const vp1 = vis(angle.p1.x, angle.p1.y);
          const vvx = vis(angle.vertex.x, angle.vertex.y);
          const vp2 = vis(angle.p2.x, angle.p2.y);
          const arcPath = angleArcPath(vvx, vp1, vp2, 22);
          const labelPos = angleLabelPos(vvx, vp1, vp2, 42);
          const isSel = state.selected?.type === 'angle' && state.selected.id === angle.id;
          const angleStroke = angle.width ?? 2;
          return (
            <g key={angle.id} style={{ filter: dropShadow }}>
              <line x1={vp1.x} y1={vp1.y} x2={vvx.x} y2={vvx.y} stroke="transparent" strokeWidth={16} style={{ cursor: 'grab' }} />
              <line x1={vvx.x} y1={vvx.y} x2={vp2.x} y2={vp2.y} stroke="transparent" strokeWidth={16} style={{ cursor: 'grab' }} />
              <line x1={vp1.x} y1={vp1.y} x2={vvx.x} y2={vvx.y} stroke={angle.color} strokeWidth={angleStroke} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              <line x1={vvx.x} y1={vvx.y} x2={vp2.x} y2={vp2.y} stroke={angle.color} strokeWidth={angleStroke} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              {arcPath && <path d={arcPath} fill="none" stroke={angle.color} strokeWidth={Math.max(1, angleStroke * 0.75)} style={{ pointerEvents: 'none' }} />}
              <text x={labelPos.x} y={labelPos.y} fill={angle.color} fontSize={13} fontWeight="700" textAnchor="middle" dominantBaseline="middle" style={{ userSelect: 'none', pointerEvents: 'none' }}>
                {calcAngleDeg(vp1, vvx, vp2).toFixed(1)}°
              </text>
              {isSel ? (
                <>
                  {([{ p: vp1, i: 0 }, { p: vvx, i: 1 }, { p: vp2, i: 2 }] as const).map(({ p, i }) => (
                    <circle key={i} cx={p.x} cy={p.y} r={HANDLE_R} fill="white" stroke={angle.color} strokeWidth={2} style={{ cursor: 'crosshair' }} onMouseDown={startEpAngleDrag(angle.id, i)} />
                  ))}
                </>
              ) : (
                [vp1, vvx, vp2].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={angle.color} style={{ pointerEvents: 'none' }} />)
              )}
            </g>
          );
        })}

        {state.texts.map((text) => {
          const tp = vis(text.x, text.y);
          const isSel = state.selected?.type === 'text' && state.selected.id === text.id;
          const boxWidthPx = text.boxWidth && text.boxWidth > 0 ? text.boxWidth * vBox.w : 0;
          const hasBox = boxWidthPx > 0;
          const singleLineW = Math.max(30, text.content.length * text.size * 0.55);
          const resizeHandleX = hasBox ? tp.x + boxWidthPx : tp.x + singleLineW;
          const resizeHandleY = tp.y - text.size * 0.5;

          const resizeHandle = isSel && (
            <g key="resize">
              {/* dashed boundary line */}
              <line
                x1={resizeHandleX}
                y1={tp.y - text.size * 1.15}
                x2={resizeHandleX}
                y2={tp.y + text.size * 0.2}
                stroke={text.color}
                strokeWidth={1}
                strokeDasharray="3 2"
                opacity={0.6}
                style={{ pointerEvents: 'none' }}
              />
              {/* drag grip */}
              <rect
                x={resizeHandleX - 4}
                y={resizeHandleY - 10}
                width={8}
                height={20}
                rx={2}
                fill="white"
                stroke={text.color}
                strokeWidth={1.5}
                style={{ cursor: 'ew-resize' }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  snapshotForUndo();
                  setDrag({ kind: 'box-resize', id: text.id, origBoxNorm: text.boxWidth ?? 0, startCanvasX: getCanvasPoint(e).x });
                }}
              />
            </g>
          );

          if (hasBox) {
            return (
              <g key={text.id}>
                <foreignObject
                  x={tp.x}
                  y={tp.y - text.size}
                  width={boxWidthPx}
                  height={320}
                  style={{ overflow: 'visible', filter: dropShadow, cursor: state.tool === 'none' ? 'grab' : 'default' }}
                  onDoubleClick={(e) => {
                    if (state.tool === 'none') {
                      e.stopPropagation();
                      setEditingText({ id: text.id, normX: text.x, normY: text.y, value: text.content });
                    }
                  }}
                >
                  <div
                    xmlns="http://www.w3.org/1999/xhtml"
                    style={{
                      width: boxWidthPx,
                      minHeight: text.size * 1.2,
                      padding: '2px 4px',
                      boxSizing: 'border-box',
                      color: text.color,
                      backgroundColor: text.backgroundColor ?? 'transparent',
                      fontSize: text.size,
                      fontFamily: 'sans-serif',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      margin: 0,
                    }}
                  >
                    {text.content || ' '}
                  </div>
                </foreignObject>
                {isSel && <circle cx={tp.x} cy={tp.y} r={HANDLE_R} fill="white" stroke={text.color} strokeWidth={2} style={{ cursor: 'crosshair', pointerEvents: 'none' }} />}
                {resizeHandle}
              </g>
            );
          }

          return (
            <g key={text.id}>
              {text.backgroundColor && (
                <rect
                  x={tp.x}
                  y={tp.y - text.size}
                  width={singleLineW}
                  height={text.size * 1.2}
                  fill={text.backgroundColor}
                  style={{ filter: dropShadow, pointerEvents: 'none' }}
                />
              )}
              <text
                x={tp.x}
                y={tp.y}
                fill={text.color}
                fontSize={text.size}
                fontFamily="sans-serif"
                style={{ userSelect: 'none', filter: dropShadow, cursor: state.tool === 'none' ? 'grab' : 'default' }}
                onDoubleClick={(e) => {
                  if (state.tool === 'none') {
                    e.stopPropagation();
                    setEditingText({ id: text.id, normX: text.x, normY: text.y, value: text.content });
                  }
                }}
              >
                {text.content}
              </text>
              {isSel && <circle cx={tp.x} cy={tp.y} r={HANDLE_R} fill="white" stroke={text.color} strokeWidth={2} style={{ cursor: 'crosshair', pointerEvents: 'none' }} />}
              {resizeHandle}
            </g>
          );
        })}

        {/* In-progress drawing previews */}
        {state.tool === 'line' && pendingPoints.length === 1 && (() => {
          const p0 = vis(pendingPoints[0].x, pendingPoints[0].y);
          const endNorm = hoverPoint && shiftKey ? snapLineSecondPoint(pendingPoints[0], hoverPoint, vis, norm) : hoverPoint;
          const endVis = endNorm ? vis(endNorm.x, endNorm.y) : null;
          return (
            <>
              <circle cx={p0.x} cy={p0.y} r={4} fill={state.activeColor} style={{ filter: dropShadow }} />
              {endVis && <line x1={p0.x} y1={p0.y} x2={endVis.x} y2={endVis.y} stroke={state.activeColor} strokeWidth={state.lineWidth} strokeDasharray="5 4" strokeLinecap="round" opacity={0.75} />}
              {shiftKey && hoverPoint && <text x={p0.x + 8} y={p0.y - 6} fill={state.activeColor} fontSize={10} style={{ filter: dropShadow, userSelect: 'none' }}>Snap 0° / 45° / 90°</text>}
            </>
          );
        })()}

        {state.tool === 'angle' && pendingPoints.length >= 1 && (() => {
          const vpts = pendingPoints.map((p) => vis(p.x, p.y));
          const hoverNorm = hoverPoint && shiftKey
            ? snapLineSecondPoint(pendingPoints[pendingPoints.length - 1], hoverPoint, vis, norm)
            : hoverPoint;
          const hp = hoverNorm ? vis(hoverNorm.x, hoverNorm.y) : null;
          return (
            <>
              {vpts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill={state.activeColor} style={{ filter: dropShadow }} />)}
              {pendingPoints.length === 1 && hp && <line x1={vpts[0].x} y1={vpts[0].y} x2={hp.x} y2={hp.y} stroke={state.activeColor} strokeWidth={2} strokeDasharray="5 4" opacity={0.75} />}
              {pendingPoints.length === 1 && shiftKey && hoverPoint && <text x={vpts[0].x + 8} y={vpts[0].y - 6} fill={state.activeColor} fontSize={10} style={{ filter: dropShadow, userSelect: 'none' }}>Snap 0° / 45° / 90°</text>}
              {pendingPoints.length === 2 && (
                <>
                  <line x1={vpts[0].x} y1={vpts[0].y} x2={vpts[1].x} y2={vpts[1].y} stroke={state.activeColor} strokeWidth={2} strokeLinecap="round" />
                  {hp && (
                    <>
                      <line x1={vpts[1].x} y1={vpts[1].y} x2={hp.x} y2={hp.y} stroke={state.activeColor} strokeWidth={2} strokeDasharray="5 4" opacity={0.75} />
                      <text x={vpts[1].x + 10} y={vpts[1].y - 10} fill={state.activeColor} fontSize={13} fontWeight="700" style={{ filter: dropShadow, userSelect: 'none' }}>
                        {calcAngleDeg(vpts[0], vpts[1], hp).toFixed(1)}°
                      </text>
                    </>
                  )}
              {shiftKey && hoverPoint && <text x={vpts[1].x + 8} y={vpts[1].y - 22} fill={state.activeColor} fontSize={10} style={{ filter: dropShadow, userSelect: 'none' }}>Snap 0° / 45° / 90°</text>}
                </>
              )}
            </>
          );
        })()}

        {isToolActive && hoverPoint && state.tool !== 'text' && (() => {
          const hp = vis(hoverPoint.x, hoverPoint.y);
          return <circle cx={hp.x} cy={hp.y} r={3} fill={state.activeColor} fillOpacity={0.5} />;
        })()}
        {isToolActive && hoverPoint && state.tool === 'text' && (() => {
          const hp = vis(hoverPoint.x, hoverPoint.y);
          return <text x={hp.x + 4} y={hp.y} fill={state.activeColor} fontSize={state.textSize * 0.6} opacity={0.5} style={{ userSelect: 'none' }}>T</text>;
        })()}
      </svg>

      {editingText && (() => {
        const textSize = editingText.id
          ? (state.texts.find((t) => t.id === editingText.id)?.size ?? state.textSize)
          : state.textSize;
        const { x: visX, y: visY } = vis(editingText.normX, editingText.normY);
        return (
          <input
            autoFocus
            type="text"
            value={editingText.value}
            onChange={(e) => setEditingText((prev) => (prev ? { ...prev, value: e.target.value } : null))}
            onKeyDown={(e) => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setEditingText(null); }}
            onBlur={commitText}
            style={{
              position: 'absolute',
              left: visX,
              top: visY - textSize,
              fontSize: textSize,
              color: state.activeColor,
              background: 'transparent',
              border: 'none',
              outline: '1px dashed rgba(255,255,255,0.4)',
              padding: '0 2px',
              minWidth: 60,
              caretColor: state.activeColor,
              fontFamily: 'sans-serif',
            }}
          />
        );
      })()}
    </div>
  );
}
