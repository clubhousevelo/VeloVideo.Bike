const btnClass = 'w-9 h-9 flex items-center justify-center rounded border transition-colors shrink-0';

interface ActionStripProps {
  canUndo: boolean;
  canRedo: boolean;
  hasMarkup: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClearAll: () => void;
}

export default function ActionStrip({ canUndo, canRedo, hasMarkup, onUndo, onRedo, onClearAll }: ActionStripProps) {
  return (
    <div className="flex flex-col gap-0.5 p-1 bg-slate-900/80 border border-slate-600/60 rounded-lg">
      {/* Undo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo"
        className={`${btnClass} border-slate-600/70 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400`}
      >
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
        </svg>
      </button>

      {/* Redo */}
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo"
        className={`${btnClass} border-slate-600/70 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400`}
      >
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
        </svg>
      </button>

      {/* Clear all */}
      <button
        onClick={onClearAll}
        disabled={!hasMarkup}
        title="Clear all markups"
        className={`${btnClass} border-slate-600/70 text-slate-400 hover:text-red-400 hover:bg-slate-700/80 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      </button>
    </div>
  );
}
