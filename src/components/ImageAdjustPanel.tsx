import type { ImageAdjust } from '../hooks/useVideoPlayer';
import { DEFAULT_IMAGE_ADJUST } from '../hooks/useVideoPlayer';

interface ImageAdjustPanelProps {
  imageAdjust: ImageAdjust;
  onChange: (a: Partial<ImageAdjust>) => void;
  onReset: () => void;
  synced?: boolean;
  onSyncToggle?: (enabled: boolean, current: ImageAdjust) => void;
  compact?: boolean;
  embedded?: boolean;
}

function SliderRow({
  label,
  tooltip,
  value,
  min,
  max,
  step,
  display,
  onChange,
  compact,
}: {
  label: string;
  tooltip?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const labelClass = compact ? 'text-xs text-slate-300 w-4' : 'text-xs text-slate-300 w-5';
  const valueClass = compact ? 'text-xs text-slate-200 font-mono w-14 text-right shrink-0' : 'text-xs text-slate-200 font-mono w-16 text-right shrink-0';

  return (
    <div className="flex items-center gap-2" data-tooltip-side="top">
      <span className={labelClass}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
        {...(tooltip && { 'data-tooltip': tooltip })}
      />
      <span className={valueClass}>{display}</span>
    </div>
  );
}

const isDefault = (a: ImageAdjust) =>
  a.brightness === DEFAULT_IMAGE_ADJUST.brightness &&
  a.contrast === DEFAULT_IMAGE_ADJUST.contrast &&
  a.saturation === DEFAULT_IMAGE_ADJUST.saturation &&
  a.gamma === DEFAULT_IMAGE_ADJUST.gamma;

export default function ImageAdjustPanel({
  imageAdjust,
  onChange,
  onReset,
  synced,
  onSyncToggle,
  compact = false,
  embedded = false,
}: ImageAdjustPanelProps) {
  const active = !isDefault(imageAdjust);
  const panelPad = compact ? 'p-2 space-y-1.5' : 'p-3 space-y-2';
  const labelSize = compact ? 'text-xs' : 'text-xs';

  const panelContent = (
    <div className={`min-w-[260px] bg-slate-900/80 backdrop-blur-sm border border-slate-600 rounded-lg shadow-xl ${panelPad}`}>
      <div className="text-xs text-slate-300 uppercase tracking-wider mb-1">Image adjust</div>
      <SliderRow
        label="☀"
        tooltip="Brightness"
        value={imageAdjust.brightness}
        min={0.5}
        max={2}
        step={0.05}
        display={imageAdjust.brightness.toFixed(2)}
        onChange={(v) => onChange({ brightness: v })}
        compact={compact}
      />
      <SliderRow
        label="◐"
        tooltip="Contrast"
        value={imageAdjust.contrast}
        min={0.5}
        max={2}
        step={0.05}
        display={imageAdjust.contrast.toFixed(2)}
        onChange={(v) => onChange({ contrast: v })}
        compact={compact}
      />
      <SliderRow
        label="◎"
        tooltip="Saturation"
        value={imageAdjust.saturation}
        min={0}
        max={2}
        step={0.05}
        display={imageAdjust.saturation.toFixed(2)}
        onChange={(v) => onChange({ saturation: v })}
        compact={compact}
      />
      <SliderRow
        label="γ"
        tooltip="Gamma"
        value={imageAdjust.gamma}
        min={0.5}
        max={2.5}
        step={0.05}
        display={imageAdjust.gamma.toFixed(2)}
        onChange={(v) => onChange({ gamma: v })}
        compact={compact}
      />
      <div className={`flex items-center justify-between gap-3 pt-0.5 ${labelSize}`}>
        {onSyncToggle && (
          <label className={`flex items-center gap-2 cursor-pointer ${synced ? 'text-blue-400' : 'text-slate-300'} hover:text-slate-200 transition-colors`}>
            <input type="checkbox" checked={!!synced} onChange={(e) => onSyncToggle(e.target.checked, imageAdjust)} className="accent-blue-500 cursor-pointer" />
            Sync Adjust
          </label>
        )}
        {active && <button onClick={onReset} className="text-slate-300 hover:text-slate-200 transition-colors">Reset</button>}
      </div>
    </div>
  );

  if (embedded) return panelContent;

  return panelContent;
}

/** Builds the CSS filter string for the given ImageAdjust. Use with img/video style. */
export function imageAdjustToFilter(adjust: ImageAdjust, gammaFilterId: string): string {
  const parts: string[] = [];
  if (adjust.brightness !== 1) parts.push(`brightness(${adjust.brightness})`);
  if (adjust.contrast !== 1) parts.push(`contrast(${adjust.contrast})`);
  if (adjust.saturation !== 1) parts.push(`saturate(${adjust.saturation})`);
  if (adjust.gamma !== 1) parts.push(`url(#${gammaFilterId})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

/** Renders the SVG filter definition for gamma. Place once per video slot. */
export function GammaFilterSvg({ id, gamma }: { id: string; gamma: number }) {
  if (gamma === 1) return null;
  return (
    <svg aria-hidden className="absolute w-0 h-0" style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <filter id={id}>
          <feComponentTransfer>
            <feFuncR type="gamma" exponent={gamma} />
            <feFuncG type="gamma" exponent={gamma} />
            <feFuncB type="gamma" exponent={gamma} />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}
