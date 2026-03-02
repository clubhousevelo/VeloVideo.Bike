import { useEffect, useMemo, useRef, useState } from 'react';
import type { MarkupSelection, MarkupState } from '../hooks/useMarkup';
import { DEFAULT_DISPLAY_DURATION } from '../hooks/useMarkup';

interface MarkupTimelinesProps {
  markupState: MarkupState;
  duration: number;
  currentTime: number;
  onScrub: (time: number) => void;
  onSelectedChange: (sel: MarkupSelection | null) => void;
  onHoveredChange: (sel: MarkupSelection | null) => void;
  onUpdateLineTiming: (id: string, updates: { timestamp: number; displayDuration: number | null; timelineRow?: number }) => void;
  onUpdateAngleTiming: (id: string, updates: { timestamp: number; displayDuration: number | null; timelineRow?: number }) => void;
  onUpdateTextTiming: (id: string, updates: { timestamp: number; displayDuration: number | null; timelineRow?: number }) => void;
}

type TimelineItem = {
  id: string;
  type: 'line' | 'angle' | 'text';
  label: string;
  /** Shown inside the rectangle: "Line", "Angle", or text content (may be truncated) */
  displayText: string;
  start: number;
  end: number;
  preferredRow: number;
  row?: number;
};

const MAX_DISPLAY_CHARS = 14;

function getDisplayText(type: 'line' | 'angle' | 'text', label: string): string {
  if (type === 'line') return 'Line';
  if (type === 'angle') return 'Angle';
  const trimmed = label.trim() || 'Text';
  if (trimmed.length <= MAX_DISPLAY_CHARS) return trimmed;
  return trimmed.slice(0, MAX_DISPLAY_CHARS - 3) + '...';
}

function toSelection(item: TimelineItem): MarkupSelection {
  return { type: item.type, id: item.id };
}

function itemToken(item: Pick<TimelineItem, 'type' | 'id'>): string {
  return `${item.type}:${item.id}`;
}

const MIN_DURATION = 0.1;
const OVERLAP_EPS = 0.0001;
const ROW_HEIGHT = 17;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toPercent(time: number, duration: number): number {
  if (duration <= 0) return 0;
  return (time / duration) * 100;
}

function resolveInterval(
  duration: number,
  timestamp: number | undefined,
  displayDuration: number | null | undefined,
  defaultDuration: number | null
): { start: number; end: number } {
  if (duration <= 0) return { start: 0, end: 0 };
  if (timestamp === undefined) return { start: 0, end: duration };
  const resolved = displayDuration === undefined ? defaultDuration : displayDuration;
  if (resolved === null) return { start: 0, end: duration };
  const maxStart = Math.max(0, duration - MIN_DURATION);
  const start = clamp(timestamp, 0, maxStart);
  const end = clamp(start + Math.max(MIN_DURATION, resolved), start + MIN_DURATION, duration);
  return { start, end };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd - OVERLAP_EPS && aEnd > bStart + OVERLAP_EPS;
}

function assignRows(items: TimelineItem[]): TimelineItem[] {
  const rows: TimelineItem[][] = [];
  const placed: TimelineItem[] = [];
  const sorted = [...items].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.preferredRow !== b.preferredRow) return a.preferredRow - b.preferredRow;
    return a.id.localeCompare(b.id);
  });

  for (const item of sorted) {
    const canPlaceInRow = (rowIdx: number) => {
      const row = rows[rowIdx] ?? [];
      return !row.some((x) => rangesOverlap(item.start, item.end, x.start, x.end));
    };

    // Always pack into the earliest available row to avoid sparse/blank lanes.
    // preferredRow still influences ordering (above), which preserves manual layering intent.
    let rowIdx = 0;
    while (!canPlaceInRow(rowIdx)) rowIdx += 1;

    if (!rows[rowIdx]) rows[rowIdx] = [];
    const placedItem = { ...item, row: rowIdx };
    rows[rowIdx].push(placedItem);
    placed.push(placedItem);
  }

  const usedRows = Array.from(new Set(placed.map((x) => x.row ?? 0))).sort((a, b) => a - b);
  const rowRemap = new Map<number, number>(usedRows.map((r, i) => [r, i]));
  return placed.map((x) => ({ ...x, row: rowRemap.get(x.row ?? 0) ?? 0 }));
}

function TimelineLane({
  title,
  items,
  collapsed,
  onToggleCollapsed,
  duration,
  currentTime,
  selected,
  onSelectedChange,
  onHoveredChange,
  onScrub,
  onUpdateItemTiming,
}: {
  title: string;
  items: TimelineItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  duration: number;
  currentTime: number;
  selected: MarkupSelection | null;
  onSelectedChange: (sel: MarkupSelection | null) => void;
  onHoveredChange: (sel: MarkupSelection | null) => void;
  onScrub: (time: number) => void;
  onUpdateItemTiming: (item: TimelineItem, start: number, end: number, timelineRow: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<
    | { token: string; kind: 'start' | 'end' }
    | { token: string; kind: 'move'; pointerOffsetSec: number; durationSec: number; row: number; startClientY: number }
    | null
  >(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number } | null>(null);
  const placedItems = useMemo(() => assignRows(items), [items]);
  const rowCount = Math.max(1, ...placedItems.map((x) => (x.row ?? 0) + 1));

  const timeFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    return x * duration;
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const item = placedItems.find((x) => itemToken(x) === drag.token);
      if (!item) return;
      const t = timeFromClientX(e.clientX);
      if (drag.kind === 'start') {
        const start = clamp(t, 0, item.end - MIN_DURATION);
        onUpdateItemTiming(item, start, item.end, item.row ?? 0);
      } else if (drag.kind === 'end') {
        const end = clamp(t, item.start + MIN_DURATION, duration);
        onUpdateItemTiming(item, item.start, end, item.row ?? 0);
      } else if (drag.kind === 'move') {
        const start = clamp(t - drag.pointerOffsetSec, 0, duration - drag.durationSec);
        const end = start + drag.durationSec;
        const rect = trackRef.current?.getBoundingClientRect();
        let nextRow = drag.row;
        if (rect) {
          const dragDistanceY = Math.abs(e.clientY - drag.startClientY);
          // Keep row stable during horizontal scrubbing; only change rows with clear vertical intent.
          if (dragDistanceY >= ROW_HEIGHT * 0.6) {
            const y = e.clientY - rect.top;
            nextRow = clamp(Math.floor(y / ROW_HEIGHT), 0, rowCount - 1) as number;
          }
        }
        if (nextRow !== drag.row) {
          setDrag((prev) => (prev && prev.kind === 'move' ? { ...prev, row: nextRow } : prev));
        }
        onUpdateItemTiming(item, start, end, nextRow);
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, placedItems, duration, onUpdateItemTiming, rowCount]);

  return (
    <div className="rounded-md border border-slate-700/70 bg-slate-900/40 px-2 py-1.5">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full flex items-center justify-between text-[11px] text-slate-300 hover:text-slate-100 transition-colors"
      >
        <span className="font-medium">{title}</span>
        <span className="flex items-center gap-2">
          <span className="text-slate-400">{items.length}</span>
          <svg className={`w-3 h-3 transition-transform ${collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
      </button>
      {!collapsed && (
        <div className="pt-1.5">
          <div
            ref={trackRef}
            className="relative rounded bg-slate-800/80 border border-slate-700/70 cursor-pointer overflow-hidden"
            style={{ height: `${Math.max(22, rowCount * ROW_HEIGHT + 8)}px` }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).dataset.edgeHandle === 'true') return;
              if ((e.target as HTMLElement) === e.currentTarget) onSelectedChange(null);
              onScrub(timeFromClientX(e.clientX));
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {Array.from({ length: rowCount }).map((_, i) => (
              <div key={i} className="absolute left-0 right-0 h-px bg-slate-700/45" style={{ top: `${i * ROW_HEIGHT + 1}px` }} />
            ))}
            {placedItems.map((item) => {
              const safeStart = clamp(item.start, 0, duration);
              const safeEnd = clamp(item.end, safeStart + MIN_DURATION, duration);
              const left = toPercent(safeStart, duration);
              const right = toPercent(safeEnd, duration);
              const width = Math.max(0.8, right - left);
              const clampedLeft = Math.min(left, 100 - width);
              const row = item.row ?? 0;
              const colorClass =
                item.type === 'line'
                  ? 'bg-green-500/70 border-green-300/70'
                  : item.type === 'angle'
                  ? 'bg-amber-500/70 border-amber-300/70'
                  : 'bg-blue-500/70 border-blue-300/70';
              const isSelected = selected?.type === item.type && selected.id === item.id;
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  className={`absolute h-3.5 rounded-sm border flex items-center ${colorClass} ${isSelected ? 'ring-1 ring-white/90' : ''}`}
                  style={{ left: `${clampedLeft}%`, width: `${width}%`, top: `${row * ROW_HEIGHT + 3}px` }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const clickTime = timeFromClientX(e.clientX);
                    onScrub(safeStart);
                    onSelectedChange(toSelection(item));
                    setDrag({
                      token: itemToken(item),
                      kind: 'move',
                      pointerOffsetSec: clickTime - item.start,
                      durationSec: Math.max(MIN_DURATION, Math.min(duration, item.end - item.start)),
                      row: row,
                      startClientY: e.clientY,
                    });
                  }}
                  onMouseEnter={(e) => {
                    onHoveredChange(toSelection(item));
                    const rect = trackRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setTooltip({ text: item.label, x: e.clientX - rect.left });
                  }}
                  onMouseMove={(e) => {
                    const rect = trackRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setTooltip({ text: item.label, x: e.clientX - rect.left });
                  }}
                  onMouseLeave={() => {
                    onHoveredChange(null);
                    setTooltip(null);
                  }}
                >
                  <span
                    className="absolute left-1.5 right-1.5 top-0 bottom-0 flex items-center justify-center text-[10px] font-medium text-white/95 pointer-events-none"
                    title={item.label}
                  >
                    <span className="truncate text-center w-full min-w-0">
                      {item.displayText}
                    </span>
                  </span>
                  <div
                    data-edge-handle="true"
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/70 hover:bg-white"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelectedChange(toSelection(item));
                      setDrag({ token: itemToken(item), kind: 'start' });
                    }}
                  />
                  <div
                    data-edge-handle="true"
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/70 hover:bg-white"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelectedChange(toSelection(item));
                      setDrag({ token: itemToken(item), kind: 'end' });
                    }}
                  />
                </div>
              );
            })}
            <div
              className="absolute top-0 bottom-0 w-px bg-blue-300 pointer-events-none"
              style={{ left: `${toPercent(currentTime, duration)}%` }}
            />
          </div>
          {tooltip && (
            <div
              className="absolute px-2 py-1 text-[11px] leading-[1.3] whitespace-nowrap bg-slate-800 text-slate-200 rounded border border-slate-600 shadow-lg pointer-events-none z-[1000] animate-[tooltipFade_3.3s_ease_forwards]"
              style={{
                left: `${tooltip.x}px`,
                bottom: `calc(100% + 6px)`,
                transform: 'translateX(-50%)',
              }}
            >
              {tooltip.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MarkupTimelines({
  markupState,
  duration,
  currentTime,
  onScrub,
  onSelectedChange,
  onHoveredChange,
  onUpdateLineTiming,
  onUpdateAngleTiming,
  onUpdateTextTiming,
}: MarkupTimelinesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const allItems = useMemo<TimelineItem[]>(() => {
    const lines = markupState.lines.map((line, i) => {
      const { start, end } = resolveInterval(duration, line.timestamp, line.displayDuration, DEFAULT_DISPLAY_DURATION.line);
      const label = line.name?.trim() || `Line ${i + 1}`;
      return { id: line.id, type: 'line' as const, label, displayText: getDisplayText('line', label), start, end, preferredRow: line.timelineRow ?? 0 };
    });
    const angles = markupState.angles.map((angle) => {
      const { start, end } = resolveInterval(duration, angle.timestamp, angle.displayDuration, DEFAULT_DISPLAY_DURATION.angle);
      const label = angle.name?.trim() || `Angle ${angle.angleDeg.toFixed(0)}°`;
      return { id: angle.id, type: 'angle' as const, label, displayText: getDisplayText('angle', label), start, end, preferredRow: angle.timelineRow ?? 0 };
    });
    const texts = markupState.texts.map((text) => {
      const { start, end } = resolveInterval(duration, text.timestamp, text.displayDuration, DEFAULT_DISPLAY_DURATION.text);
      const label = text.content?.trim() || 'Text';
      return { id: text.id, type: 'text' as const, label, displayText: getDisplayText('text', label), start, end, preferredRow: text.timelineRow ?? 0 };
    });
    return [...lines, ...angles, ...texts].sort((a, b) => a.start - b.start);
  }, [markupState.lines, markupState.angles, markupState.texts, duration]);

  const hasLayerItems = allItems.length > 0;

  const [showTimelines, setShowTimelines] = useState(hasLayerItems);
  const [lineAngleCollapsed, setLineAngleCollapsed] = useState(false);
  const prevHasItemsRef = useRef(hasLayerItems);

  useEffect(() => {
    const hadItems = prevHasItemsRef.current;
    if (hasLayerItems && !hadItems) {
      setShowTimelines(true);
      setLineAngleCollapsed(false);
    } else if (!hasLayerItems) {
      setShowTimelines(false);
    }
    prevHasItemsRef.current = hasLayerItems;
  }, [hasLayerItems]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t)) return;
      // Don't deselect when clicking inside the strip markup editor popup (color, title, content inputs)
      if ((t as Element).closest?.('[data-markup-editor]')) return;
      onSelectedChange(null);
      onHoveredChange(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelectedChange(null);
        onHoveredChange(null);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onSelectedChange, onHoveredChange]);

  if (!showTimelines) return null;

  const applyTimingUpdate = (item: TimelineItem, start: number, end: number, timelineRow: number) => {
    const maxStart = Math.max(0, duration - MIN_DURATION);
    const normalizedStart = clamp(start, 0, maxStart);
    const normalizedEnd = clamp(end, normalizedStart + MIN_DURATION, duration);
    const coversFullRange = normalizedStart <= 0.001 && normalizedEnd >= duration - 0.001;
    const nextDisplayDuration = coversFullRange ? null : Math.max(MIN_DURATION, normalizedEnd - normalizedStart);
    const updates = { timestamp: normalizedStart, displayDuration: nextDisplayDuration, timelineRow };
    if (item.type === 'line') onUpdateLineTiming(item.id, updates);
    else if (item.type === 'angle') onUpdateAngleTiming(item.id, updates);
    else onUpdateTextTiming(item.id, updates);
  };

  return (
    <div ref={containerRef} className="mt-1.5 space-y-1" data-tooltip-side="top" onMouseLeave={() => onHoveredChange(null)}>
      {allItems.length > 0 && (
        <TimelineLane
          title="Markup"
          items={allItems}
          collapsed={lineAngleCollapsed}
          onToggleCollapsed={() => setLineAngleCollapsed((v) => !v)}
          duration={duration}
          currentTime={currentTime}
          selected={markupState.selected}
          onSelectedChange={onSelectedChange}
          onHoveredChange={onHoveredChange}
          onScrub={onScrub}
          onUpdateItemTiming={applyTimingUpdate}
        />
      )}
    </div>
  );
}
