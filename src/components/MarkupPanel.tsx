import { useState, useRef, useEffect } from 'react';
import type { MarkupHandle, MarkupTool } from '../hooks/useMarkup';

interface MarkupPanelProps {
  markup: MarkupHandle;
  compact?: boolean;
  direction?: 'up' | 'down';
  /** When true, render only the panel body (for sidebar next to ToolStrip) */
  embedded?: boolean;
}

export default function MarkupPanel({ markup, compact = false, direction = 'up', embedded = false }: MarkupPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    state,
    setTool,
    setSelected,
    setHidden,
    updateGrid,
    setActiveColor,
    setLineWidth,
    setTextSize,
    clearAll,
    undo,
    redo,
    removeItem,
    updateText,
  } = markup;

  const hasMarkup = state.lines.length > 0 || state.angles.length > 0 || state.texts.length > 0;
  const isActive = state.tool !== 'none' || state.grid.show || hasMarkup;
  const labelSize = compact ? 'text-xs' : 'text-xs';

  useEffect(() => {
    if (!open || embedded) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, embedded]);

  const ToolBtn = ({ tool, label, icon }: { tool: MarkupTool; label: string; icon: React.ReactNode }) => (
    <button
      onClick={() => setTool(state.tool === tool ? 'none' : tool)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
        state.tool === tool ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const positionClass = direction === 'down' ? 'top-full mt-1' : 'bottom-full mb-1';

  const panelContent = (
    <div className="min-w-[280px] max-h-[min(70vh,600px)] overflow-y-auto bg-slate-900/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-xl p-3 space-y-3">
      {/* Draw tools */}
      <div>
        <div className="text-xs text-slate-300 uppercase tracking-wider mb-1.5">Draw</div>
        <div className="flex flex-wrap gap-1.5">
          <ToolBtn
            tool="line"
            label="Line"
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M4 20L20 4" strokeLinecap="round" /></svg>}
          />
          <ToolBtn
            tool="angle"
            label="Angle"
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M5 19L12 5L19 19" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          />
          <ToolBtn
            tool="text"
            label="Text"
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" d="M4 7V5h16v2M9 5v14m6-14v14M9 19h6" /></svg>}
          />
        </div>
        {state.tool === 'line' && <p className="text-xs text-slate-300 mt-1.5">Click two points to draw</p>}
        {state.tool === 'angle' && <p className="text-xs text-slate-300 mt-1.5">Click 3 points: start → vertex → end</p>}
        {state.tool === 'text' && <p className="text-xs text-slate-300 mt-1.5">Click to place, type, Enter. Double-click text to edit.</p>}
      </div>

      {/* Color + tool settings */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-300">Color</span>
        <input type="color" value={state.activeColor} onChange={(e) => setActiveColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent" />
        {state.tool === 'line' && (
          <>
            <span className="text-xs text-slate-300 ml-1">Width</span>
            <input type="range" min={1} max={8} step={1} value={state.lineWidth} onChange={(e) => setLineWidth(parseInt(e.target.value))} className="w-20" />
            <span className="text-xs text-slate-200 w-6 shrink-0">{state.lineWidth}px</span>
          </>
        )}
        {state.tool === 'text' && (
          <>
            <span className="text-xs text-slate-300 ml-1">Size</span>
            <input type="range" min={10} max={60} step={2} value={state.textSize} onChange={(e) => setTextSize(parseInt(e.target.value))} className="w-20" />
            <span className="text-xs text-slate-200 w-8 shrink-0">{state.textSize}px</span>
          </>
        )}
      </div>

      {/* Selected text edit */}
      {state.selected?.type === 'text' && (() => {
        const t = state.texts.find((x) => x.id === state.selected!.id);
        if (!t) return null;
        return (
          <div className="border-t border-slate-700 pt-2 space-y-1">
            <div className="text-xs text-slate-300 uppercase">Edit text</div>
            <input
              type="text"
              value={t.content}
              onChange={(e) => updateText(t.id, { content: e.target.value })}
              className="w-full px-2 py-1 text-xs bg-slate-700 rounded border border-slate-600 text-white"
              placeholder="Content"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Size</span>
              <input type="range" min={10} max={60} step={2} value={t.size} onChange={(e) => updateText(t.id, { size: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-xs text-slate-200 w-8">{t.size}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">Color</span>
              <input type="color" value={t.color} onChange={(e) => updateText(t.id, { color: e.target.value })} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
            </div>
          </div>
        );
      })()}

      {/* Markup list: undo, redo, hide, delete all, and items */}
      <div className="border-t border-slate-700 pt-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300 uppercase tracking-wider">Markups</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={!state.hidden} onChange={(e) => setHidden(!e.target.checked)} className="accent-blue-500 cursor-pointer" />
            <span className="text-xs text-slate-300">Show</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={undo} disabled={state.undoStack.length === 0} className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Undo">
            Undo
          </button>
          <button onClick={redo} disabled={state.redoStack.length === 0} className="px-2 py-0.5 text-xs rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed" title="Redo">
            Redo
          </button>
          {hasMarkup && (
            <button onClick={clearAll} className="px-2 py-0.5 text-xs rounded text-red-400 hover:bg-slate-700" title="Delete all">
              Delete all
            </button>
          )}
        </div>
        {(state.lines.length > 0 || state.angles.length > 0 || state.texts.length > 0) && (
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {state.lines.map((l) => (
              <div
                key={l.id}
                onClick={() => setSelected({ type: 'line', id: l.id })}
                className={`flex items-center justify-between gap-1 px-2 py-1 rounded text-xs cursor-pointer ${state.selected?.type === 'line' && state.selected.id === l.id ? 'bg-blue-600/40 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}
              >
                <span>{l.referenceLength != null ? `Ref ${l.referenceLength} ${l.unit ?? ''}` : l.isMeasurement ? 'Measure' : 'Line'}</span>
                <button onClick={(e) => { e.stopPropagation(); removeItem('line', l.id); }} className="p-0.5 text-slate-400 hover:text-red-400" title="Delete">×</button>
              </div>
            ))}
            {state.angles.map((a) => (
              <div
                key={a.id}
                onClick={() => setSelected({ type: 'angle', id: a.id })}
                className={`flex items-center justify-between gap-1 px-2 py-1 rounded text-xs cursor-pointer ${state.selected?.type === 'angle' && state.selected.id === a.id ? 'bg-blue-600/40 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}
              >
                <span>Angle {a.angleDeg.toFixed(0)}°</span>
                <button onClick={(e) => { e.stopPropagation(); removeItem('angle', a.id); }} className="p-0.5 text-slate-400 hover:text-red-400" title="Delete">×</button>
              </div>
            ))}
            {state.texts.map((t) => (
              <div
                key={t.id}
                onClick={() => setSelected({ type: 'text', id: t.id })}
                className={`flex items-center justify-between gap-1 px-2 py-1 rounded text-xs cursor-pointer truncate ${state.selected?.type === 'text' && state.selected.id === t.id ? 'bg-blue-600/40 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}
              >
                <span className="truncate">"{t.content || '(empty)'}"</span>
                <button onClick={(e) => { e.stopPropagation(); removeItem('text', t.id); }} className="p-0.5 text-slate-400 hover:text-red-400 shrink-0" title="Delete">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="border-t border-slate-700 pt-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300 uppercase tracking-wider">Grid</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={state.grid.show} onChange={(e) => updateGrid({ show: e.target.checked })} className="accent-blue-500 cursor-pointer" />
            <span className="text-xs text-slate-300">Show</span>
          </label>
        </div>
        {state.grid.show && (
          <div className="space-y-2 pl-0.5">
            <div className="flex items-center gap-1">
              {(['both', 'horizontal', 'vertical'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => updateGrid({ mode: m })}
                  className={`px-2 py-0.5 text-xs rounded capitalize transition-colors ${state.grid.mode === m ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 w-11 shrink-0">Spacing</span>
              <input type="range" min={10} max={200} step={5} value={state.grid.spacingPx} onChange={(e) => updateGrid({ spacingPx: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-xs text-slate-200 w-10 shrink-0 text-right">{state.grid.spacingPx}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 w-8 shrink-0">Origin X</span>
              <input type="range" min={-300} max={300} step={5} value={state.grid.originX} onChange={(e) => updateGrid({ originX: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-xs text-slate-200 w-10 shrink-0 text-right">{state.grid.originX}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 w-8 shrink-0">Origin Y</span>
              <input type="range" min={-300} max={300} step={5} value={state.grid.originY} onChange={(e) => updateGrid({ originY: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-xs text-slate-200 w-10 shrink-0 text-right">{state.grid.originY}px</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={state.grid.color} onChange={(e) => updateGrid({ color: e.target.value })} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
              <span className="text-xs text-slate-300 ml-1">Opacity</span>
              <input type="range" min={0.05} max={1} step={0.05} value={state.grid.opacity} onChange={(e) => updateGrid({ opacity: parseFloat(e.target.value) })} className="flex-1" />
              <span className="text-xs text-slate-200 w-8 shrink-0 text-right">{Math.round(state.grid.opacity * 100)}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return panelContent;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 ${labelSize} transition-colors ${isActive ? 'text-blue-400 hover:text-blue-300' : 'text-slate-300 hover:text-slate-200'}`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
        </svg>
        Markup
        {isActive && <span className="text-[11px] bg-blue-500/20 text-blue-400 rounded px-1">active</span>}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className={`absolute left-0 ${positionClass} z-50`}>{panelContent}</div>}
    </div>
  );
}
