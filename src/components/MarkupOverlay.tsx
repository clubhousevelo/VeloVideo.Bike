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
import type { HTMLAttributes } from 'react';
import type { MarkupHandle, Point } from '../hooks/useMarkup';
import { DEFAULT_DISPLAY_DURATION } from '../hooks/useMarkup';
import type { VideoTransform } from '../hooks/useVideoPlayer';
import { calcAngleDeg } from '../hooks/useMarkup';
import PointMagnifier from './PointMagnifier';

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
 * Matches CSS transform: translate(tx, -ty) scale(s) with transform-origin: center.
 * Order: translate first, then scale around center — translation is NOT scaled.
 */
function toVisual(nx: number, ny: number, vBox: VideoBox, W: number, H: number, vt: VideoTransform): Point {
  const cx = vBox.x + nx * vBox.w;
  const cy = vBox.y + ny * vBox.h;
  return {
    x: W / 2 + vt.translateX + vt.scale * (cx - W / 2),
    y: H / 2 - vt.translateY + vt.scale * (cy - H / 2),
  };
}

/**
 * Convert SVG canvas click position → normalized video-frame coordinates.
 * Inverse of toVisual.
 */
function toNormalized(canvasX: number, canvasY: number, vBox: VideoBox, W: number, H: number, vt: VideoTransform): Point {
  const contentX = (canvasX - W / 2 - vt.translateX) / vt.scale + W / 2;
  const contentY = (canvasY - H / 2 + vt.translateY) / vt.scale + H / 2;
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
  /** Optional: scale the effective video box (e.g. overlay correction). Use raw transform when set. */
  correctionScale?: number;
  /** Video current time (seconds). Used for timestamp when adding markups and for visibility filtering. */
  currentTime?: number;
  /** Called when user double-clicks a markup item. Opens the corresponding tool panel. */
  onOpenToolPanel?: (type: 'line' | 'angle' | 'text') => void;
  /** Called when Escape should close the tool panel (e.g. second Escape after unselecting). */
  onClosePanel?: () => void;
  /** Video or image element for the magnifier. When not provided, the magnifier will try to find it from the DOM. */
  mediaEl?: HTMLVideoElement | HTMLImageElement | null;
}

type DragState =
  | { kind: 'ep-line'; id: string; pointIndex: 0 | 1 }
  | { kind: 'ep-angle'; id: string; pointIndex: 0 | 1 | 2 }
  | { kind: 'body-line'; id: string; ox1: number; oy1: number; ox2: number; oy2: number; mx0: number; my0: number }
  | { kind: 'body-angle'; id: string; op1: Point; ov: Point; op2: Point; mx0: number; my0: number }
  | { kind: 'body-text'; id: string; ox: number; oy: number; mx0: number; my0: number }
  | { kind: 'box-resize'; id: string; origBoxNorm: number; startCanvasX: number };

function isMarkupVisible(
  timestamp: number | undefined,
  displayDuration: number | null | undefined,
  defaultDuration: number | null,
  currentTime: number
): boolean {
  if (timestamp === undefined) return true; // legacy: no timestamp = always visible
  // undefined = use default; null = "Always on" (visible from start, even before timestamp)
  const dur = displayDuration === undefined ? defaultDuration : displayDuration;
  if (dur === null || dur === undefined) return true; // Always on: visible everywhere
  const t = timestamp;
  if (currentTime < t) return false;
  return currentTime <= t + dur;
}

export default function MarkupOverlay({ handle, transform, videoAR, correctionScale = 1, currentTime = 0, onOpenToolPanel, onClosePanel, mediaEl: mediaElProp }: MarkupOverlayProps) {
  const { state, addLine, addAngle, addText, updateLine, updateAngle, updateText, setSelected, setTool, snapshotForUndo, removeItem } = handle;
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mediaElFromDom, setMediaElFromDom] = useState<HTMLVideoElement | HTMLImageElement | null>(null);
  const mediaEl = mediaElProp ?? mediaElFromDom;
  const [svgSize, setSvgSize] = useState({ width: 400, height: 300 });
  const [pendingPoints, setPendingPoints] = useState<Point[]>([]); // normalized
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null); // normalized
  const [cursorViewBox, setCursorViewBox] = useState<Point>({ x: 0, y: 0 }); // viewBox coords for magnifier
  const [editingText, setEditingText] = useState<{ id: string; normX: number; normY: number; value: string } | null>(null);
  const [pendingReferenceLineId, setPendingReferenceLineId] = useState<string | null>(null);
  const [pendingReferenceInput, setPendingReferenceInput] = useState({ value: '', unit: 'mm' });
  const pendingReferenceRef = useRef(false);
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

  // Resolve media element from DOM when not passed as prop
  useEffect(() => {
    if (mediaElProp != null) return;
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const media = el.querySelector('video, img') as HTMLVideoElement | HTMLImageElement | null;
    setMediaElFromDom(media);
    const mo = new MutationObserver(() => {
      const m = el.querySelector('video, img') as HTMLVideoElement | HTMLImageElement | null;
      setMediaElFromDom(m);
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [mediaElProp]);

  useEffect(() => {
    setPendingPoints([]);
    setHoverPoint(null);
    setEditingText(null);
    setPendingReferenceLineId(null);
  }, [state.tool]);

  // When we add a line for measure reference, capture its id once state updates
  useEffect(() => {
    if (pendingReferenceRef.current && state.lines.length > 0) {
      pendingReferenceRef.current = false;
      const last = state.lines[state.lines.length - 1];
      if (last.referenceLength == null) setPendingReferenceLineId(last.id);
    }
  }, [state.lines]);

  // Clear pending reference input if the line was deleted
  useEffect(() => {
    if (pendingReferenceLineId && !state.lines.some((l) => l.id === pendingReferenceLineId)) {
      setPendingReferenceLineId(null);
      setPendingReferenceInput({ value: '', unit: 'mm' });
    }
  }, [pendingReferenceLineId, state.lines]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (e.key === 'Shift') setShiftKey(true);
      if (e.key === 'Escape') {
        if (editingText) {
          setEditingText(null);
          return;
        }
        if (state.selected) {
          setSelected(null);
          return;
        }
        if (pendingPoints.length > 0) {
          setPendingPoints([]);
          setPendingReferenceLineId(null);
          setDrag(null);
          return;
        }
        onClosePanel?.();
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
    const onBlur = () => setShiftKey(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [state.selected, state.tool, pendingPoints.length, editingText, removeItem, setTool, setSelected, onClosePanel]);

  // Derived helpers (re-computed per render but cheap)
  const W = svgSize.width;
  const H = svgSize.height;
  const vBoxRaw = computeVideoBox(W, H, videoAR);
  const vBox =
    correctionScale !== 1
      ? {
          x: W / 2 - (vBoxRaw.w * correctionScale) / 2,
          y: H / 2 - (vBoxRaw.h * correctionScale) / 2,
          w: vBoxRaw.w * correctionScale,
          h: vBoxRaw.h * correctionScale,
        }
      : vBoxRaw;

  const vis = useCallback((nx: number, ny: number) => toVisual(nx, ny, vBox, W, H, transform), [vBox, W, H, transform]);
  const norm = useCallback((cx: number, cy: number) => toNormalized(cx, cy, vBox, W, H, transform), [vBox, W, H, transform]);

  // Get canvas (viewBox) coordinates from mouse event
  const getCanvasPoint = useCallback((e: React.MouseEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  // Hit test against visual (canvas) positions of visible stored items
  const hitTest = useCallback((canvasPt: Point) => {
    const vLines = state.lines.filter((l) => isMarkupVisible(l.timestamp, l.displayDuration, DEFAULT_DISPLAY_DURATION.line, currentTime));
    const vAngles = state.angles.filter((a) => isMarkupVisible(a.timestamp, a.displayDuration, DEFAULT_DISPLAY_DURATION.angle, currentTime));
    const vTexts = state.texts.filter((t) => isMarkupVisible(t.timestamp, t.displayDuration, DEFAULT_DISPLAY_DURATION.text, currentTime));
    for (const line of vLines) {
      const p1 = vis(line.x1, line.y1);
      const p2 = vis(line.x2, line.y2);
      if (distToSegment(canvasPt.x, canvasPt.y, p1.x, p1.y, p2.x, p2.y) <= HIT_THRESHOLD)
        return { type: 'line' as const, id: line.id };
    }
    for (const angle of vAngles) {
      const vp1 = vis(angle.p1.x, angle.p1.y);
      const vvx = vis(angle.vertex.x, angle.vertex.y);
      const vp2 = vis(angle.p2.x, angle.p2.y);
      if (distToSegment(canvasPt.x, canvasPt.y, vp1.x, vp1.y, vvx.x, vvx.y) <= HIT_THRESHOLD) return { type: 'angle' as const, id: angle.id };
      if (distToSegment(canvasPt.x, canvasPt.y, vvx.x, vvx.y, vp2.x, vp2.y) <= HIT_THRESHOLD) return { type: 'angle' as const, id: angle.id };
    }
    for (const text of vTexts) {
      const tp = vis(text.x, text.y);
      const boxW = text.boxWidth && text.boxWidth > 0 ? text.boxWidth * vBox.w : null;
      const approxW = boxW ?? text.content.length * text.size * 0.55;
      const approxH = text.size * 1.2;
      if (canvasPt.x >= tp.x && canvasPt.x <= tp.x + approxW && canvasPt.y >= tp.y - approxH && canvasPt.y <= tp.y + 4)
        return { type: 'text' as const, id: text.id };
    }
    return null;
  }, [state.lines, state.angles, state.texts, vis, currentTime]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setShiftKey(e.shiftKey);
    const canvasPt = getCanvasPoint(e);
    if (drag?.kind === 'ep-line' || drag?.kind === 'ep-angle') setCursorViewBox(canvasPt);
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
    if (state.tool !== 'none') {
      setHoverPoint(norm(canvasPt.x, canvasPt.y));
      setCursorViewBox(canvasPt);
    }
  }, [drag, state.angles, vis, getCanvasPoint, norm, transform.scale, vBox.w, vBox.h, updateLine, updateAngle, updateText, state.tool]);

  const handleMouseLeave = useCallback(() => { setHoverPoint(null); }, []);

  const syncCursorFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const pt = getCanvasPoint(e as unknown as React.MouseEvent);
    setCursorViewBox(pt);
  }, [getCanvasPoint]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvasPt = getCanvasPoint(e);
    if (state.tool === 'line' || state.tool === 'angle' || state.tool === 'measure' || drag?.kind === 'ep-line' || drag?.kind === 'ep-angle') {
      setCursorViewBox(canvasPt);
    }
    if ((e.target as Element)?.closest?.('[data-endpoint-handle]')) return;
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
  }, [state.tool, state.lines, state.angles, state.texts, drag, getCanvasPoint, hitTest, setSelected, snapshotForUndo]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!onOpenToolPanel) return;
    const canvasPt = getCanvasPoint(e);
    const hit = hitTest(canvasPt);
    if (hit && (hit.type === 'line' || hit.type === 'angle' || hit.type === 'text')) {
      e.stopPropagation();
      setDrag(null);
      setSelected(hit);
      onOpenToolPanel(hit.type);
    }
  }, [onOpenToolPanel, getCanvasPoint, hitTest, setSelected]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (state.tool === 'none') return;
    e.stopPropagation();
    // When a markup is selected, disable creating new items until unselected
    if (state.selected) {
      setSelected(null);
      setPendingPoints([]);
      return;
    }
    const canvasPt = getCanvasPoint(e);
    const n = norm(canvasPt.x, canvasPt.y);

    if (state.tool === 'line') {
      if (pendingPoints.length === 0) {
        setPendingPoints([n]);
      } else {
        const p2 = e.shiftKey ? snapLineSecondPoint(pendingPoints[0], n, vis, norm) : n;
        addLine({
          x1: pendingPoints[0].x, y1: pendingPoints[0].y, x2: p2.x, y2: p2.y,
          color: state.activeColor, width: state.lineWidth,
          timestamp: currentTime, displayDuration: DEFAULT_DISPLAY_DURATION.line,
        });
        setPendingPoints([]);
        setTool('none');
      }
    } else if (state.tool === 'measure') {
      const hasReference = state.lines.some((l) => l.referenceLength != null);
      if (pendingPoints.length === 0) {
        setPendingPoints([n]);
      } else {
        const p2 = e.shiftKey ? snapLineSecondPoint(pendingPoints[0], n, vis, norm) : n;
        const newLine = {
          x1: pendingPoints[0].x, y1: pendingPoints[0].y, x2: p2.x, y2: p2.y,
          color: state.activeColor, width: state.lineWidth,
          timestamp: currentTime, displayDuration: DEFAULT_DISPLAY_DURATION.line,
        };
        if (!hasReference) {
          pendingReferenceRef.current = true;
          addLine(newLine);
          setPendingPoints([]);
        } else {
          addLine({ ...newLine, isMeasurement: true });
          setPendingPoints([]);
          setTool('none');
        }
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
        addAngle({
          p1, vertex, p2, color: state.activeColor, width: state.lineWidth,
          angleDeg: calcAngleDeg(vis(p1.x, p1.y), vis(vertex.x, vertex.y), vis(p2.x, p2.y)),
          timestamp: currentTime, displayDuration: DEFAULT_DISPLAY_DURATION.angle,
        });
        setPendingPoints([]);
        setTool('none');
      }
    } else if (state.tool === 'text') {
      setEditingText({ id: '', normX: n.x, normY: n.y, value: '' });
    }
  }, [state.tool, state.selected, state.activeColor, state.lineWidth, state.lines, pendingPoints, addLine, addAngle, setTool, setSelected, getCanvasPoint, norm, vis, currentTime]);

  const commitText = useCallback(() => {
    if (editingText) {
      if (editingText.id) {
        if (editingText.value.trim()) updateText(editingText.id, { content: editingText.value });
      } else if (editingText.value.trim()) {
        addText({
          x: editingText.normX, y: editingText.normY, content: editingText.value,
          size: state.textSize, color: state.activeColor,
          timestamp: currentTime, displayDuration: DEFAULT_DISPLAY_DURATION.text,
        });
        setTool('none');
      }
    }
    setEditingText(null);
  }, [editingText, addText, updateText, setTool, state.textSize, state.activeColor, currentTime]);

  const commitReferenceLength = useCallback(() => {
    if (!pendingReferenceLineId) return;
    const num = parseFloat(pendingReferenceInput.value.replace(/,/g, ''));
    if (Number.isFinite(num) && num > 0) {
      updateLine(pendingReferenceLineId, {
        referenceLength: num,
        unit: pendingReferenceInput.unit || 'mm',
      });
    }
    setPendingReferenceLineId(null);
    setPendingReferenceInput({ value: '', unit: 'mm' });
  }, [pendingReferenceLineId, pendingReferenceInput, updateLine]);

  const startEpLineDrag = useCallback((id: string, pointIndex: 0 | 1) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const pt = getCanvasPoint(e as unknown as React.MouseEvent);
    setCursorViewBox(pt);
    snapshotForUndo();
    setDrag({ kind: 'ep-line', id, pointIndex });
    containerRef.current?.setPointerCapture?.(e.pointerId);
  }, [getCanvasPoint, snapshotForUndo]);

  const startEpAngleDrag = useCallback((id: string, pointIndex: 0 | 1 | 2) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const pt = getCanvasPoint(e as unknown as React.MouseEvent);
    setCursorViewBox(pt);
    snapshotForUndo();
    setDrag({ kind: 'ep-angle', id, pointIndex });
    containerRef.current?.setPointerCapture?.(e.pointerId);
  }, [getCanvasPoint, snapshotForUndo]);

  useEffect(() => {
    if (!drag) return;
    const onUp = () => setDrag(null);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, [drag]);

  if (state.hidden) return null;

  const isToolActive = state.tool !== 'none';
  const isDragging = drag !== null;
  const visibleLines = state.lines.filter((l) => isMarkupVisible(l.timestamp, l.displayDuration, DEFAULT_DISPLAY_DURATION.line, currentTime));
  const visibleAngles = state.angles.filter((a) => isMarkupVisible(a.timestamp, a.displayDuration, DEFAULT_DISPLAY_DURATION.angle, currentTime));
  const visibleTexts = state.texts.filter((t) => isMarkupVisible(t.timestamp, t.displayDuration, DEFAULT_DISPLAY_DURATION.text, currentTime));
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
      onPointerMove={handleMouseMove as React.PointerEventHandler}
      onPointerEnter={(e) => { if (state.tool === 'line' || state.tool === 'angle' || state.tool === 'measure' || drag?.kind === 'ep-line' || drag?.kind === 'ep-angle') syncCursorFromEvent(e); }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        className={isToolActive ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : ''}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{ pointerEvents: isToolActive || hasContent ? 'all' : 'none' }}
      >
        {gridLines}

        {visibleLines.map((line) => {
          const p1 = vis(line.x1, line.y1);
          const p2 = vis(line.x2, line.y2);
          const isSel = state.selected?.type === 'line' && state.selected.id === line.id;
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy);
          // Acute angle with horizontal: 0–90°
          let lineAngleDeg: number | null = null;
          let lineRotationDeg = len > 1e-6 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;
          if (lineRotationDeg > 90 || lineRotationDeg < -90) lineRotationDeg += 180;
          if (line.showAngle && len > 1e-6) {
            let deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
            if (deg > 90) deg = 180 - deg;
            lineAngleDeg = deg;
          }
          const refLine = state.lines.find((l) => l.referenceLength != null);
          const refPx = refLine ? Math.hypot(vis(refLine.x2, refLine.y2).x - vis(refLine.x1, refLine.y1).x, vis(refLine.x2, refLine.y2).y - vis(refLine.x1, refLine.y1).y) : 0;
          const measureScale = refLine && refPx > 1e-6 ? refLine.referenceLength! / refPx : null;
          const measureLabel = line.referenceLength != null
            ? `${line.referenceLength} ${line.unit ?? ''}`
            : line.isMeasurement && measureScale != null
              ? `${(len * measureScale).toFixed(1)} ${refLine?.unit ?? ''}`
              : null;
          const textY = mid.y - 10;
          return (
            <g key={line.id}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={16} style={{ cursor: 'grab' }} />
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={line.color} strokeWidth={line.width} strokeLinecap="round" style={{ filter: dropShadow, pointerEvents: 'none' }} />
              {lineAngleDeg != null && (
                <text x={mid.x} y={textY} fill={line.color} fontSize={12} fontWeight="600" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${lineRotationDeg}, ${mid.x}, ${textY})`} style={{ filter: dropShadow, userSelect: 'none', pointerEvents: 'none' }}>
                  {lineAngleDeg.toFixed(1)}°
                </text>
              )}
              {measureLabel != null && (
                <text x={mid.x} y={textY - (lineAngleDeg != null ? 14 : 0)} fill={line.color} fontSize={12} fontWeight="600" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${lineRotationDeg}, ${mid.x}, ${textY - (lineAngleDeg != null ? 14 : 0)})`} style={{ filter: dropShadow, userSelect: 'none', pointerEvents: 'none' }}>
                  {measureLabel}
                </text>
              )}
              {isSel && (
                <>
                  <circle data-endpoint-handle cx={p1.x} cy={p1.y} r={HANDLE_R} fill="white" stroke={line.color} strokeWidth={2} style={{ cursor: 'crosshair' }} onPointerDown={startEpLineDrag(line.id, 0)} />
                  <circle data-endpoint-handle cx={p2.x} cy={p2.y} r={HANDLE_R} fill="white" stroke={line.color} strokeWidth={2} style={{ cursor: 'crosshair' }} onPointerDown={startEpLineDrag(line.id, 1)} />
                </>
              )}
            </g>
          );
        })}

        {visibleAngles.map((angle) => {
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
                    <circle key={i} data-endpoint-handle cx={p.x} cy={p.y} r={HANDLE_R} fill="white" stroke={angle.color} strokeWidth={2} style={{ cursor: 'crosshair' }} onPointerDown={startEpAngleDrag(angle.id, i)} />
                  ))}
                </>
              ) : (
                [vp1, vvx, vp2].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill={angle.color} style={{ pointerEvents: 'none' }} />)
              )}
            </g>
          );
        })}

        {visibleTexts.map((text) => {
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
                      setSelected({ type: 'text', id: text.id });
                      onOpenToolPanel?.('text');
                    }
                  }}
                >
                  <div
                    {...({
                      xmlns: 'http://www.w3.org/1999/xhtml',
                      style: {
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
                      },
                    } as HTMLAttributes<HTMLDivElement>)}
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
                    setSelected({ type: 'text', id: text.id });
                    onOpenToolPanel?.('text');
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
        {(state.tool === 'line' || state.tool === 'measure') && pendingPoints.length === 1 && (() => {
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

      {/* Zoomed magnifier for precise point selection when placing or editing line/angle/measure points */}
      {((state.tool === 'line' || state.tool === 'angle' || state.tool === 'measure') || drag?.kind === 'ep-line' || drag?.kind === 'ep-angle') &&
        mediaEl && (
        <PointMagnifier
          cursorX={cursorViewBox.x}
          cursorY={cursorViewBox.y}
          W={W}
          H={H}
          vBox={vBox}
          transform={transform}
          mediaEl={mediaEl}
        />
      )}

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

      {/* Reference length input for measure tool */}
      {pendingReferenceLineId && (() => {
        const line = state.lines.find((l) => l.id === pendingReferenceLineId);
        if (!line) return null;
        const mid = vis((line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2);
        return (
          <div
            className="absolute flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/95 border border-cyan-500/60 shadow-lg"
            style={{ left: mid.x - 100, top: mid.y - 50, minWidth: 200 }}
          >
            <span className="text-xs text-slate-300 whitespace-nowrap">Known length:</span>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              placeholder="e.g. 1000"
              value={pendingReferenceInput.value}
              onChange={(e) => setPendingReferenceInput((p) => ({ ...p, value: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitReferenceLength();
                if (e.key === 'Escape') { setPendingReferenceLineId(null); setPendingReferenceInput({ value: '', unit: 'mm' }); }
              }}
              className="flex-1 min-w-0 px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            <select
              value={pendingReferenceInput.unit}
              onChange={(e) => setPendingReferenceInput((p) => ({ ...p, unit: e.target.value }))}
              className="px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="in">in</option>
              <option value="ft">ft</option>
            </select>
            <button
              onClick={commitReferenceLength}
              className="px-2 py-1 text-xs font-medium rounded bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              Set
            </button>
          </div>
        );
      })()}
    </div>
  );
}
