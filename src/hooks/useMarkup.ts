import { useState, useCallback } from 'react';

export type MarkupTool = 'none' | 'line' | 'angle' | 'text' | 'measure';

export interface GridSettings {
  show: boolean;
  mode: 'both' | 'horizontal' | 'vertical';
  spacingPx: number;
  color: string;
  opacity: number;
  originX: number;
  originY: number;
}

export interface MarkupLine {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  /** Show line angle (0–90°) at center of line */
  showAngle?: boolean;
  /** Video timestamp (seconds) when created. Used for scrubber markers and visibility. */
  timestamp?: number;
  /** Seconds to display; null = infinite. Default: infinite for lines. */
  displayDuration?: number | null;
  /** Measure tool: known real-world length for this reference line (e.g. wheelbase in mm) */
  referenceLength?: number;
  /** Measure tool: unit for referenceLength (e.g. "mm", "in") */
  unit?: string;
  /** Measure tool: when true, this line shows scaled length based on reference */
  isMeasurement?: boolean;
  /** User-defined name for the line (e.g. "Wheelbase") */
  name?: string;
}

export interface MarkupAngle {
  id: string;
  p1: { x: number; y: number };
  vertex: { x: number; y: number };
  p2: { x: number; y: number };
  color: string;
  /** Stroke width; default 2 if omitted (e.g. legacy data) */
  width?: number;
  angleDeg: number;
  /** Video timestamp (seconds) when created. Used for scrubber markers and visibility. */
  timestamp?: number;
  /** Seconds to display; null = infinite. Default: 2 for angles. */
  displayDuration?: number | null;
  /** User-defined name for the angle (e.g. "Knee angle") */
  name?: string;
}

export interface MarkupText {
  id: string;
  x: number;
  y: number;
  content: string;
  size: number;
  color: string;
  /** CSS color for text background; undefined = none */
  backgroundColor?: string;
  /** Normalized width (0–1) for bounding box; 0 or undefined = single line, no wrap */
  boxWidth?: number;
  /** Video timestamp (seconds) when created. Used for scrubber markers and visibility. */
  timestamp?: number;
  /** Seconds to display; null = infinite. Default: 5 for text. */
  displayDuration?: number | null;
}

export type MarkupSelection = { type: 'line'; id: string } | { type: 'angle'; id: string } | { type: 'text'; id: string };

export interface MarkupSnap {
  lines: MarkupLine[];
  angles: MarkupAngle[];
  texts: MarkupText[];
  grid: GridSettings;
  hidden: boolean;
}

export interface MarkupState {
  tool: MarkupTool;
  grid: GridSettings;
  lines: MarkupLine[];
  angles: MarkupAngle[];
  texts: MarkupText[];
  activeColor: string;
  lineWidth: number;
  textSize: number;
  hidden: boolean;
  selected: MarkupSelection | null;
  undoStack: MarkupSnap[];
  redoStack: MarkupSnap[];
}

export interface MarkupHandle {
  state: MarkupState;
  setTool: (tool: MarkupTool) => void;
  setSelected: (sel: MarkupSelection | null) => void;
  setHidden: (hidden: boolean) => void;
  updateGrid: (g: Partial<GridSettings>) => void;
  addLine: (line: Omit<MarkupLine, 'id'>) => void;
  addAngle: (angle: Omit<MarkupAngle, 'id'>) => void;
  addText: (text: Omit<MarkupText, 'id'>) => void;
  updateLine: (id: string, updates: Partial<Pick<MarkupLine, 'x1' | 'y1' | 'x2' | 'y2' | 'color' | 'width' | 'showAngle' | 'displayDuration' | 'referenceLength' | 'unit' | 'isMeasurement' | 'name'>>) => void;
  updateAngle: (id: string, updates: Partial<{ p1: Point; vertex: Point; p2: Point; color: string; width: number; angleDeg: number; displayDuration: number | null; name: string }>) => void;
  updateText: (id: string, updates: Partial<Pick<MarkupText, 'content' | 'size' | 'color' | 'x' | 'y' | 'backgroundColor' | 'boxWidth' | 'displayDuration'>>) => void;
  removeItem: (type: 'line' | 'angle' | 'text', id: string) => void;
  clearAll: () => void;
  undo: () => void;
  redo: () => void;
  snapshotForUndo: () => void;
  loadSnap: (snap: MarkupSnap) => void;
  setActiveColor: (color: string) => void;
  setLineWidth: (w: number) => void;
  setTextSize: (s: number) => void;
}

export type Point = { x: number; y: number };

/** Default display duration (seconds). null = infinite. */
export const DEFAULT_DISPLAY_DURATION = { line: null as number | null, angle: 2, text: 5 } as const;

export type ScrubberMarker = { time: number; type: 'line' | 'angle' | 'text'; id: string };

export function getScrubberMarkers(state: MarkupState): ScrubberMarker[] {
  const markers: ScrubberMarker[] = [];
  for (const l of state.lines) {
    if (l.timestamp != null) markers.push({ time: l.timestamp, type: 'line', id: l.id });
  }
  for (const a of state.angles) {
    if (a.timestamp != null) markers.push({ time: a.timestamp, type: 'angle', id: a.id });
  }
  for (const t of state.texts) {
    if (t.timestamp != null) markers.push({ time: t.timestamp, type: 'text', id: t.id });
  }
  return markers.sort((a, b) => a.time - b.time);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function calcAngleDeg(p1: Point, vertex: Point, p2: Point): number {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
  if (mag1 === 0 || mag2 === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2)))) * (180 / Math.PI);
}

function getSnap(state: MarkupState): MarkupSnap {
  return {
    lines: state.lines.map((l) => ({ ...l })),
    angles: state.angles.map((a) => ({ ...a, p1: { ...a.p1 }, vertex: { ...a.vertex }, p2: { ...a.p2 } })),
    texts: state.texts.map((t) => ({ ...t })),
    grid: { ...state.grid },
    hidden: state.hidden,
  };
}

const MAX_UNDO = 50;

const DEFAULT_GRID: GridSettings = {
  show: false,
  mode: 'both',
  spacingPx: 50,
  color: '#ffffff',
  opacity: 0.35,
  originX: 0,
  originY: 0,
};

const INITIAL_STATE: MarkupState = {
  tool: 'none',
  grid: DEFAULT_GRID,
  lines: [],
  angles: [],
  texts: [],
  activeColor: '#ffff00',
  lineWidth: 2,
  textSize: 18,
  hidden: false,
  selected: null,
  undoStack: [],
  redoStack: [],
};

export function useMarkup(): MarkupHandle {
  const [state, setState] = useState<MarkupState>(INITIAL_STATE);

  const setTool = useCallback((tool: MarkupTool) => {
    setState((prev) => ({ ...prev, tool }));
  }, []);

  const setSelected = useCallback((selected: MarkupSelection | null) => {
    setState((prev) => ({ ...prev, selected }));
  }, []);

  const setHidden = useCallback((hidden: boolean) => {
    setState((prev) => ({ ...prev, hidden }));
  }, []);

  const updateGrid = useCallback((g: Partial<GridSettings>) => {
    setState((prev) => ({ ...prev, grid: { ...prev.grid, ...g } }));
  }, []);

  const snapshotForUndo = useCallback(() => {
    setState((prev) => {
      const snap = getSnap(prev);
      return { ...prev, undoStack: [...prev.undoStack, snap].slice(-MAX_UNDO), redoStack: [] };
    });
  }, []);

  const addLine = useCallback((line: Omit<MarkupLine, 'id'>) => {
    setState((prev) => {
      const snap = getSnap(prev);
      return {
        ...prev,
        lines: [...prev.lines, { ...line, id: uid() }],
        undoStack: [...prev.undoStack, snap].slice(-MAX_UNDO),
        redoStack: [],
      };
    });
  }, []);

  const addAngle = useCallback((angle: Omit<MarkupAngle, 'id'>) => {
    setState((prev) => {
      const snap = getSnap(prev);
      return {
        ...prev,
        angles: [...prev.angles, { ...angle, id: uid() }],
        undoStack: [...prev.undoStack, snap].slice(-MAX_UNDO),
        redoStack: [],
      };
    });
  }, []);

  const addText = useCallback((text: Omit<MarkupText, 'id'>) => {
    setState((prev) => {
      const snap = getSnap(prev);
      return {
        ...prev,
        texts: [...prev.texts, { ...text, id: uid() }],
        undoStack: [...prev.undoStack, snap].slice(-MAX_UNDO),
        redoStack: [],
      };
    });
  }, []);

  const updateLine = useCallback((id: string, updates: Partial<Pick<MarkupLine, 'x1' | 'y1' | 'x2' | 'y2' | 'color' | 'width' | 'showAngle' | 'displayDuration'>>) => {
    setState((prev) => ({
      ...prev,
      lines: prev.lines.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
  }, []);

  const updateAngle = useCallback((id: string, updates: Partial<{ p1: Point; vertex: Point; p2: Point; color: string; width: number; angleDeg: number; displayDuration: number | null }>) => {
    setState((prev) => {
      const angles = prev.angles.map((a) => {
        if (a.id !== id) return a;
        const next = {
          ...a,
          p1: updates.p1 ?? a.p1,
          vertex: updates.vertex ?? a.vertex,
          p2: updates.p2 ?? a.p2,
          ...(updates.color !== undefined && { color: updates.color }),
          ...(updates.width !== undefined && { width: updates.width }),
          ...(updates.displayDuration !== undefined && { displayDuration: updates.displayDuration }),
          ...('name' in updates && { name: updates.name || undefined }),
        };
        // Only recalculate angleDeg when points change. Caller-supplied angleDeg uses visual coords for accuracy.
        // Recalculating from normalized coords when only width/color/duration change would give wrong values
        // due to letterboxing/pillarboxing (non-uniform scaling).
        const pointsChanged = updates.p1 !== undefined || updates.vertex !== undefined || updates.p2 !== undefined;
        next.angleDeg = updates.angleDeg !== undefined
          ? updates.angleDeg
          : pointsChanged
            ? calcAngleDeg(next.p1, next.vertex, next.p2)
            : a.angleDeg;
        return next;
      });
      return { ...prev, angles };
    });
  }, []);

  const updateText = useCallback((id: string, updates: Partial<Pick<MarkupText, 'content' | 'size' | 'color' | 'x' | 'y' | 'backgroundColor' | 'boxWidth' | 'displayDuration'>>) => {
    setState((prev) => ({
      ...prev,
      texts: prev.texts.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  }, []);

  const removeItem = useCallback((type: 'line' | 'angle' | 'text', id: string) => {
    setState((prev) => {
      const snap = getSnap(prev);
      return {
        ...prev,
        selected: prev.selected && prev.selected.id === id ? null : prev.selected,
        lines: type === 'line' ? prev.lines.filter((l) => l.id !== id) : prev.lines,
        angles: type === 'angle' ? prev.angles.filter((a) => a.id !== id) : prev.angles,
        texts: type === 'text' ? prev.texts.filter((t) => t.id !== id) : prev.texts,
        undoStack: [...prev.undoStack, snap].slice(-MAX_UNDO),
        redoStack: [],
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState((prev) => {
      const snap = getSnap(prev);
      return {
        ...prev,
        lines: [],
        angles: [],
        texts: [],
        grid: DEFAULT_GRID,
        selected: null,
        undoStack: [...prev.undoStack, snap].slice(-MAX_UNDO),
        redoStack: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      const stack = [...prev.undoStack];
      const snap = stack.pop();
      if (!snap) return prev;
      return {
        ...prev,
        undoStack: stack,
        redoStack: [...prev.redoStack, getSnap(prev)],
        lines: snap.lines,
        angles: snap.angles,
        texts: snap.texts,
        grid: snap.grid,
        hidden: snap.hidden,
        selected: null,
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const redoStack = [...prev.redoStack];
      const snap = redoStack.pop();
      if (!snap) return prev;
      return {
        ...prev,
        redoStack,
        undoStack: [...prev.undoStack, getSnap(prev)],
        lines: snap.lines,
        angles: snap.angles,
        texts: snap.texts,
        grid: snap.grid,
        hidden: snap.hidden,
      };
    });
  }, []);

  const loadSnap = useCallback((snap: MarkupSnap) => {
    setState((prev) => ({
      ...prev,
      lines: snap.lines,
      angles: snap.angles,
      texts: snap.texts,
      grid: snap.grid,
      hidden: snap.hidden,
      selected: null,
      undoStack: [],
      redoStack: [],
    }));
  }, []);

  const setActiveColor = useCallback((color: string) => {
    setState((prev) => ({ ...prev, activeColor: color }));
  }, []);

  const setLineWidth = useCallback((w: number) => {
    setState((prev) => ({ ...prev, lineWidth: w }));
  }, []);

  const setTextSize = useCallback((s: number) => {
    setState((prev) => ({ ...prev, textSize: s }));
  }, []);

  return {
    state,
    setTool,
    setSelected,
    setHidden,
    updateGrid,
    addLine,
    addAngle,
    addText,
    updateLine,
    updateAngle,
    updateText,
    removeItem,
    clearAll,
    undo,
    redo,
    snapshotForUndo,
    loadSnap,
    setActiveColor,
    setLineWidth,
    setTextSize,
  };
}
