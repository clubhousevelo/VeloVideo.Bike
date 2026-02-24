import { useState, useRef, useEffect } from 'react';
import type { VideoTransform } from '../hooks/useVideoPlayer';
import { DEFAULT_TRANSFORM } from '../hooks/useVideoPlayer';

interface TransformPanelProps {
  transform: VideoTransform;
  onChange: (t: Partial<VideoTransform>) => void;
  onReset: () => void;
  synced?: boolean;
  /** called with (true, currentTransform) when enabling, (false) when disabling */
  onSyncToggle?: (enabled: boolean, current: VideoTransform) => void;
  compact?: boolean;
  /** 'up' = popup opens upward (default), 'down' = popup opens downward */
  direction?: 'up' | 'down';
  /** When true, render only the panel body (for sidebar next to ToolStrip) */
  embedded?: boolean;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  compact,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const labelClass = compact ? 'text-[10px] text-slate-500 w-4' : 'text-xs text-slate-500 w-5';
  const valueClass = compact ? 'text-[10px] text-slate-300 font-mono w-14 text-right shrink-0' : 'text-xs text-slate-300 font-mono w-16 text-right shrink-0';

  return (
    <div className="flex items-center gap-2">
      <span className={labelClass}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className={valueClass}>{display}</span>
    </div>
  );
}

const isDefault = (t: VideoTransform) =>
  t.scale === DEFAULT_TRANSFORM.scale &&
  t.translateX === DEFAULT_TRANSFORM.translateX &&
  t.translateY === DEFAULT_TRANSFORM.translateY;

export default function TransformPanel({ transform, onChange, onReset, synced, onSyncToggle, compact = false, direction = 'up', embedded = false }: TransformPanelProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = !isDefault(transform);

  const labelSize = compact ? 'text-[10px]' : 'text-xs';
  const panelPad = compact ? 'p-2 space-y-1.5' : 'p-3 space-y-2';
  const positionClass = direction === 'down' ? 'top-full mt-1' : 'bottom-full mb-1';

  useEffect(() => {
    if (!open || embedded) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, embedded]);

  const panelContent = (
    <div className={`min-w-[260px] bg-slate-800 border border-slate-600 rounded-lg shadow-xl ${panelPad}`}>
      <SliderRow label="⊕" value={transform.scale} min={0.25} max={4} step={0.01} display={`${transform.scale.toFixed(2)}×`} onChange={(v) => onChange({ scale: v })} compact={compact} />
      <SliderRow label="X" value={transform.translateX} min={-500} max={500} step={1} display={`${transform.translateX >= 0 ? '+' : ''}${transform.translateX} px`} onChange={(v) => onChange({ translateX: v })} compact={compact} />
      <SliderRow label="Y" value={transform.translateY} min={-500} max={500} step={1} display={`${transform.translateY >= 0 ? '+' : ''}${transform.translateY} px`} onChange={(v) => onChange({ translateY: v })} compact={compact} />
      <div className={`flex items-center justify-between gap-3 pt-0.5 ${labelSize}`}>
        {onSyncToggle && (
          <label className={`flex items-center gap-2 cursor-pointer ${synced ? 'text-blue-400' : 'text-slate-500'} hover:text-slate-300 transition-colors`}>
            <input type="checkbox" checked={!!synced} onChange={(e) => onSyncToggle(e.target.checked, transform)} className="accent-blue-500 cursor-pointer" />
            Sync Transform
          </label>
        )}
        {active && <button onClick={onReset} className="text-slate-500 hover:text-slate-300 transition-colors">Reset</button>}
      </div>
    </div>
  );

  if (embedded) return panelContent;

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 ${labelSize} transition-colors ${
          active ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-slate-300'
        }`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
        Transform
        {active && <span className="text-[9px] bg-amber-500/20 text-amber-400 rounded px-1">active</span>}
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && <div className={`absolute left-0 ${positionClass} z-50`}>{panelContent}</div>}
    </div>
  );
}
