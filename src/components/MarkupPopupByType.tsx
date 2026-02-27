import { useEffect } from 'react';
import type { MarkupHandle, GridSettings } from '../hooks/useMarkup';
import { DEFAULT_DISPLAY_DURATION } from '../hooks/useMarkup';

interface MarkupPopupByTypeProps {
  markup: MarkupHandle;
  type: 'grid' | 'line' | 'angle' | 'text';
  /** When provided, used instead of markup.updateGrid for grid panel (enables sync) */
  updateGridOverride?: (g: Partial<GridSettings>) => void;
  syncedGrid?: boolean;
  onSyncGridToggle?: (enabled: boolean, current: GridSettings) => void;
}

const panelClass = 'min-w-[240px] max-h-[min(65vh,480px)] overflow-y-auto bg-slate-900/80 backdrop-blur-sm border border-slate-600/50 rounded-lg shadow-xl p-2.5 space-y-2.5';
const sectionLabel = 'text-[11px] text-slate-300 uppercase tracking-wider font-semibold';

const PRESET_COLORS = ['#ffff00', '#ff4444', '#ff8800', '#00ff88', '#00ccff', '#ffffff'];

function DisplayDurationRow({
  value,
  onChange,
  defaultSeconds,
  label = 'Display duration',
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  defaultSeconds: number | null;
  label?: string;
}) {
  const isInfinite = value === null || value === undefined;
  const numVal = isInfinite ? (defaultSeconds ?? 2) : value;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-300">{label}</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={isInfinite}
            onChange={(e) => onChange(e.target.checked ? null : (defaultSeconds ?? 2))}
            className="accent-blue-500 cursor-pointer"
          />
          <span className="text-[11px] text-slate-300">Always on</span>
        </label>
      </div>
      {!isInfinite && (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.1}
            max={60}
            step={0.1}
            value={numVal}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-[11px] text-slate-200 w-12 text-right">{numVal.toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          title={c}
          className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 shrink-0"
          style={{
            backgroundColor: c,
            borderColor: value === c ? 'white' : 'transparent',
            boxShadow: value === c ? '0 0 0 1px #64748b' : undefined,
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent shrink-0"
        title="Custom color"
      />
      <span className="text-[11px] text-slate-300">Color</span>
    </div>
  );
}

export default function MarkupPopupByType({ markup, type, updateGridOverride, syncedGrid, onSyncGridToggle }: MarkupPopupByTypeProps) {
  const { state, setTool, setSelected, updateGrid, setActiveColor, setLineWidth, setTextSize, removeItem, updateLine, updateAngle, updateText } = markup;
  const gridUpdater = (type === 'grid' && updateGridOverride) ? updateGridOverride : updateGrid;

  // Activate drawing tool when popup opens; reset on close/unmount
  useEffect(() => {
    if (type === 'grid') setTool('none');
    else setTool(type as 'line' | 'angle' | 'text');
    return () => { setTool('none'); };
  }, [type, setTool]);

  if (type === 'grid') {
    return (
      <div className={panelClass}>
        <div className={sectionLabel}>Grid</div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-300">Show grid</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={state.grid.show} onChange={(e) => gridUpdater({ show: e.target.checked })} className="accent-blue-500 cursor-pointer" />
          </label>
        </div>
        {state.grid.show && (
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              {(['both', 'horizontal', 'vertical'] as const).map((m) => (
                <button key={m} onClick={() => gridUpdater({ mode: m })} className={`px-2 py-0.5 text-[11px] rounded capitalize ${state.grid.mode === m ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>{m}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300 w-12 shrink-0">Spacing</span>
              <input type="range" min={10} max={200} step={1} value={state.grid.spacingPx} onChange={(e) => gridUpdater({ spacingPx: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-[11px] text-slate-200 w-9 text-right">{state.grid.spacingPx}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300 w-12 shrink-0">Origin X</span>
              <input type="range" min={-300} max={300} step={1} value={state.grid.originX} onChange={(e) => gridUpdater({ originX: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-[11px] text-slate-200 w-9 text-right">{state.grid.originX}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300 w-12 shrink-0">Origin Y</span>
              <input type="range" min={-300} max={300} step={1} value={state.grid.originY} onChange={(e) => gridUpdater({ originY: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-[11px] text-slate-200 w-9 text-right">{state.grid.originY}px</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={state.grid.color} onChange={(e) => gridUpdater({ color: e.target.value })} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
              <span className="text-[11px] text-slate-300">Opacity</span>
              <input type="range" min={0.05} max={1} step={0.05} value={state.grid.opacity} onChange={(e) => gridUpdater({ opacity: parseFloat(e.target.value) })} className="flex-1" />
              <span className="text-[11px] text-slate-200 w-8 text-right">{Math.round(state.grid.opacity * 100)}%</span>
            </div>
          </div>
        )}
        {onSyncGridToggle && (
          <div className="flex items-center pt-1.5 border-t border-slate-700/60 mt-1.5">
            <label className={`flex items-center gap-2 cursor-pointer text-xs ${syncedGrid ? 'text-blue-400' : 'text-slate-500'} hover:text-slate-300 transition-colors`}>
              <input type="checkbox" checked={!!syncedGrid} onChange={(e) => onSyncGridToggle(e.target.checked, state.grid)} className="accent-blue-500 cursor-pointer" />
              Sync Grid
            </label>
          </div>
        )}
      </div>
    );
  }

  if (type === 'line') {
    const selLine = state.selected?.type === 'line' ? state.lines.find((l) => l.id === state.selected!.id) : null;
    return (
      <div className={panelClass}>
        <div className={sectionLabel}>Line</div>
        {selLine ? (
          <p className="text-[11px] text-slate-300">Unselect to add new. Click canvas or Unselect above.</p>
        ) : (
          <p className="text-[11px] text-slate-300">Click two points to draw. <span className="text-slate-400">Shift+Click</span> second point to snap to horizontal, vertical, or 45°.</p>
        )}
        {!selLine && (
          <>
            <ColorRow value={state.activeColor} onChange={setActiveColor} />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300">Width</span>
              <input type="range" min={1} max={8} step={1} value={state.lineWidth} onChange={(e) => setLineWidth(parseInt(e.target.value))} className="flex-1" />
              <span className="text-[11px] text-slate-200 w-5">{state.lineWidth}px</span>
            </div>
          </>
        )}
        {selLine && (
          <div className="border-t border-slate-700/60 pt-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className={sectionLabel}>Edit selected line</span>
              <button onClick={() => setSelected(null)} className="text-[11px] text-slate-300 hover:text-slate-200">Unselect</button>
            </div>
            <ColorRow value={selLine.color} onChange={(c) => updateLine(selLine.id, { color: c })} />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300">Width</span>
              <input type="range" min={1} max={8} step={1} value={selLine.width} onChange={(e) => updateLine(selLine.id, { width: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-[11px] text-slate-200 w-5">{selLine.width}px</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-300">Show angle (0–90°) at center</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={!!selLine.showAngle} onChange={(e) => updateLine(selLine.id, { showAngle: e.target.checked })} className="accent-blue-500 cursor-pointer" />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300 w-14 shrink-0">Name</span>
              <input
                type="text"
                value={selLine.name ?? ''}
                onChange={(e) => updateLine(selLine.id, { name: e.target.value || undefined })}
                placeholder="e.g. Wheelbase"
                className="flex-1 px-2 py-1 text-[11px] bg-slate-700/70 rounded border border-slate-600/60 text-slate-200 placeholder-slate-500"
              />
            </div>
            <DisplayDurationRow
              value={selLine.displayDuration}
              onChange={(v) => updateLine(selLine.id, { displayDuration: v })}
              defaultSeconds={DEFAULT_DISPLAY_DURATION.line}
            />
          </div>
        )}
        {state.lines.length > 0 && (
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {state.lines.map((l, i) => (
              <div key={l.id} onClick={() => setSelected({ type: 'line', id: l.id })} className={`flex items-center justify-between gap-1 px-2 py-1 rounded text-[11px] cursor-pointer ${state.selected?.type === 'line' && state.selected.id === l.id ? 'bg-blue-600/40 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
                <span className="truncate">{l.name?.trim() || `Line ${i + 1}`}</span>
                <button onClick={(e) => { e.stopPropagation(); removeItem('line', l.id); }} className="p-0.5 text-slate-400 hover:text-red-400">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (type === 'angle') {
    const selAngle = state.selected?.type === 'angle' ? state.angles.find((a) => a.id === state.selected!.id) : null;
    return (
      <div className={panelClass}>
        <div className={sectionLabel}>Angle</div>
        {selAngle ? (
          <p className="text-[11px] text-slate-300">Unselect to add new. Click canvas or Unselect above.</p>
        ) : (
          <p className="text-[11px] text-slate-300">Click 3 points: start → vertex → end. <span className="text-slate-400">Shift+Click</span> 2nd or 3rd point to snap to 0° / 45° / 90°.</p>
        )}
        {!selAngle && (
          <>
            <ColorRow value={state.activeColor} onChange={setActiveColor} />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300">Width</span>
              <input type="range" min={1} max={8} step={1} value={state.lineWidth} onChange={(e) => setLineWidth(parseInt(e.target.value))} className="flex-1" />
              <span className="text-[11px] text-slate-200 w-5">{state.lineWidth}px</span>
            </div>
          </>
        )}
        {selAngle && (
          <div className="border-t border-slate-700/60 pt-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className={sectionLabel}>Edit selected angle</span>
              <button onClick={() => setSelected(null)} className="text-[11px] text-slate-300 hover:text-slate-200">Unselect</button>
            </div>
            <ColorRow value={selAngle.color} onChange={(c) => updateAngle(selAngle.id, { color: c })} />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300">Width</span>
              <input type="range" min={1} max={8} step={1} value={selAngle.width ?? 2} onChange={(e) => updateAngle(selAngle.id, { width: parseInt(e.target.value) })} className="flex-1" />
              <span className="text-[11px] text-slate-200 w-5">{selAngle.width ?? 2}px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-300 w-14 shrink-0">Name</span>
              <input
                type="text"
                value={selAngle.name ?? ''}
                onChange={(e) => updateAngle(selAngle.id, { name: e.target.value || undefined })}
                placeholder="e.g. Knee angle"
                className="flex-1 px-2 py-1 text-[11px] bg-slate-700/70 rounded border border-slate-600/60 text-slate-200 placeholder-slate-500"
              />
            </div>
            <DisplayDurationRow
              value={selAngle.displayDuration}
              onChange={(v) => updateAngle(selAngle.id, { displayDuration: v })}
              defaultSeconds={DEFAULT_DISPLAY_DURATION.angle}
            />
          </div>
        )}
        {state.angles.length > 0 && (
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {state.angles.map((a) => (
              <div key={a.id} onClick={() => setSelected({ type: 'angle', id: a.id })} className={`flex items-center justify-between gap-1 px-2 py-1 rounded text-[11px] cursor-pointer ${state.selected?.type === 'angle' && state.selected.id === a.id ? 'bg-blue-600/40 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
                <span className="truncate">{a.name?.trim() || `${a.angleDeg.toFixed(1)}°`}</span>
                <button onClick={(e) => { e.stopPropagation(); removeItem('angle', a.id); }} className="p-0.5 text-slate-400 hover:text-red-400">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Text tool
  const selText = state.selected?.type === 'text' ? state.texts.find((t) => t.id === state.selected!.id) : null;
  return (
    <div className={panelClass}>
      <div className={sectionLabel}>Text</div>
      {selText ? (
        <p className="text-[11px] text-slate-300">Unselect to add new. Click canvas or Unselect above.</p>
      ) : (
        <p className="text-[11px] text-slate-300">Click to place. Double-click to edit content.</p>
      )}
      {!selText && (
        <>
          <ColorRow value={state.activeColor} onChange={setActiveColor} />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-300">Size</span>
            <input type="range" min={10} max={60} step={2} value={state.textSize} onChange={(e) => setTextSize(parseInt(e.target.value))} className="flex-1" />
            <span className="text-[11px] text-slate-200 w-7">{state.textSize}px</span>
          </div>
        </>
      )}
      {selText && (
        <div className="border-t border-slate-700/60 pt-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className={sectionLabel}>Edit selected</span>
            <button onClick={() => setSelected(null)} className="text-[11px] text-slate-300 hover:text-slate-200">Unselect</button>
          </div>
          <input type="text" value={selText.content} onChange={(e) => updateText(selText.id, { content: e.target.value })} className="w-full px-2 py-1 text-xs bg-slate-700/70 rounded border border-slate-600/60 text-white" placeholder="Content" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-300">Size</span>
            <input type="range" min={10} max={60} step={2} value={selText.size} onChange={(e) => updateText(selText.id, { size: parseInt(e.target.value) })} className="flex-1" />
            <span className="text-[11px] text-slate-200 w-7">{selText.size}px</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-300">Color</span>
            <input type="color" value={selText.color} onChange={(e) => updateText(selText.id, { color: e.target.value })} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-300">Background</span>
            <input type="color" value={selText.backgroundColor || '#000000'} onChange={(e) => updateText(selText.id, { backgroundColor: e.target.value || undefined })} className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" title="Background color" />
            <button type="button" onClick={() => updateText(selText.id, { backgroundColor: undefined })} className="text-[11px] text-slate-300 hover:text-white px-1.5 py-0.5 rounded border border-slate-600">None</button>
          </div>
          <DisplayDurationRow
            value={selText.displayDuration}
            onChange={(v) => updateText(selText.id, { displayDuration: v })}
            defaultSeconds={DEFAULT_DISPLAY_DURATION.text}
          />
          <p className="text-[8px] text-slate-400">Drag the <span className="text-slate-300">⊣ handle</span> on the right edge of the text to set wrap width.</p>
        </div>
      )}
      {state.texts.length > 0 && (
        <div className="space-y-1 max-h-28 overflow-y-auto">
          {state.texts.map((t) => (
            <div key={t.id} onClick={() => setSelected({ type: 'text', id: t.id })} className={`flex items-center justify-between gap-1 px-2 py-1 rounded text-[11px] cursor-pointer truncate ${state.selected?.type === 'text' && state.selected.id === t.id ? 'bg-blue-600/40 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
              <span className="truncate">"{t.content || '(empty)'}"</span>
              <button onClick={(e) => { e.stopPropagation(); removeItem('text', t.id); }} className="p-0.5 text-slate-400 hover:text-red-400 shrink-0">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
