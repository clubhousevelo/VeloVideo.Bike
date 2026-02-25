export type ToolStripPanel = 'transform' | 'adjust' | 'grid' | 'line' | 'angle' | 'text';

interface ToolStripProps {
  side: 'left' | 'right';
  active: ToolStripPanel | null;
  onActiveChange: (panel: ToolStripPanel | null) => void;
  transformActive?: boolean;
  adjustActive?: boolean;
  gridActive?: boolean;
  lineActive?: boolean;
  angleActive?: boolean;
  textActive?: boolean;
  markupHidden?: boolean;
  onToggleHidden?: () => void;
}

const btnClass = 'w-9 h-9 max-lg:w-7 max-lg:h-7 flex items-center justify-center rounded border transition-colors shrink-0';

function activeClass(active: boolean, selected: boolean) {
  if (selected) return 'bg-blue-600/80 border-blue-500 text-white';
  if (active) return 'border-blue-500/50 text-blue-400 hover:bg-slate-700/80';
  return 'border-slate-600/70 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80';
}

/** Tool colors matching scrubber markers: line=green, angle=amber, text=blue */
function toolClass(tool: 'line' | 'angle' | 'text', active: boolean, selected: boolean) {
  if (selected) {
    if (tool === 'line') return 'bg-green-600/80 border-green-500 text-white';
    if (tool === 'angle') return 'bg-amber-600/80 border-amber-500 text-white';
    return 'bg-blue-600/80 border-blue-500 text-white';
  }
  if (active) {
    if (tool === 'line') return 'border-green-500/50 text-green-400 hover:bg-slate-700/80';
    if (tool === 'angle') return 'border-amber-500/50 text-amber-400 hover:bg-slate-700/80';
    return 'border-blue-500/50 text-blue-400 hover:bg-slate-700/80';
  }
  if (tool === 'line') return 'border-slate-600/70 text-green-500 hover:text-green-400 hover:bg-slate-700/80';
  if (tool === 'angle') return 'border-slate-600/70 text-amber-500 hover:text-amber-400 hover:bg-slate-700/80';
  return 'border-slate-600/70 text-blue-500 hover:text-blue-400 hover:bg-slate-700/80';
}

export default function ToolStrip({
  side,
  active,
  onActiveChange,
  transformActive,
  adjustActive,
  gridActive,
  lineActive,
  angleActive,
  textActive,
  markupHidden,
  onToggleHidden,
}: ToolStripProps) {
  return (
    <div className="flex flex-col gap-0.5 max-lg:gap-0 p-1 max-lg:p-0.5 bg-slate-900/75 border border-slate-600/60 rounded-lg" data-side={side}>
      {/* Transform */}
      <button
        onClick={() => onActiveChange(active === 'transform' ? null : 'transform')}
        className={`${btnClass} ${active === 'transform' ? 'bg-amber-600/80 border-amber-500 text-white' : transformActive ? 'border-amber-500/50 text-amber-400 hover:bg-slate-700/80' : 'border-slate-600/70 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'}`}
        data-tooltip="Transform (Z+↑/↓ scale, X+arrows pan)"
        aria-label="Transform (scale, pan)"
      >
        <svg className="w-4.5 h-4.5 max-lg:w-3.5 max-lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
      </button>

      {/* Image adjust */}
      <button
        onClick={() => onActiveChange(active === 'adjust' ? null : 'adjust')}
        className={`${btnClass} ${active === 'adjust' ? 'bg-violet-600/80 border-violet-500 text-white' : adjustActive ? 'border-violet-500/50 text-violet-400 hover:bg-slate-700/80' : 'border-slate-600/70 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'}`}
        data-tooltip="Image adjust (brightness, contrast, saturation, gamma)"
        aria-label="Image adjust"
      >
        <svg className="w-4.5 h-4.5 max-lg:w-3.5 max-lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
      </button>

      {/* Divider */}
      <div className="w-full h-px bg-slate-700/60 my-0.5" />

      {/* Grid */}
      <button
        onClick={() => onActiveChange(active === 'grid' ? null : 'grid')}
        className={`${btnClass} ${activeClass(!!gridActive, active === 'grid')}`}
        data-tooltip="Grid (G)"
        aria-label="Grid (G)"
      >
        <svg className="w-4.5 h-4.5 max-lg:w-3.5 max-lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
        </svg>
      </button>

      {/* Line */}
      <button
        onClick={() => onActiveChange(active === 'line' ? null : 'line')}
        className={`${btnClass} ${toolClass('line', !!lineActive, active === 'line')}`}
        data-tooltip="Line (L)"
        aria-label="Line (L)"
      >
        <svg className="w-4.5 h-4.5 max-lg:w-3.5 max-lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path d="M4 20L20 4" strokeLinecap="round" />
        </svg>
      </button>

      {/* Angle */}
      <button
        onClick={() => onActiveChange(active === 'angle' ? null : 'angle')}
        className={`${btnClass} ${toolClass('angle', !!angleActive, active === 'angle')}`}
        data-tooltip="Angle (A)"
        aria-label="Angle (A)"
      >
        <svg className="w-4.5 h-4.5 max-lg:w-3.5 max-lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path d="M5 19L12 5L19 19" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Text */}
      <button
        onClick={() => onActiveChange(active === 'text' ? null : 'text')}
        className={`${btnClass} ${toolClass('text', !!textActive, active === 'text')}`}
        data-tooltip="Text (T)"
        aria-label="Text (T)"
      >
        <span className="text-[15px] max-lg:text-[11px] font-bold leading-none tracking-tight select-none">Aa</span>
      </button>

      {/* Divider */}
      <div className="w-full h-px bg-slate-700/60 my-0.5" />

      {/* Hide/Show markups */}
      <button
        onClick={onToggleHidden}
        className={`${btnClass} ${markupHidden ? 'border-slate-600/70 text-slate-600 hover:text-slate-400 hover:bg-slate-700/80' : 'border-slate-600/70 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80'}`}
        data-tooltip={markupHidden ? 'Show markups (H)' : 'Hide markups (H)'}
        aria-label={markupHidden ? 'Show markups (H)' : 'Hide markups (H)'}
      >
        {markupHidden ? (
          /* Eye-slash (hidden state) */
          <svg className="w-4.5 h-4.5 max-lg:w-3.5 max-lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          /* Eye (visible state) */
          <svg className="w-4.5 h-4.5 max-lg:w-3.5 max-lg:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
