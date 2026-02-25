import { useState, useRef, useEffect } from 'react';
import type { VideoPlayerHandle, VideoTransform } from '../hooks/useVideoPlayer';
import { useRepeatWhilePressed } from '../hooks/useRepeatWhilePressed';
import type { MarkupHandle, GridSettings } from '../hooks/useMarkup';
import type { ToolStripPanel } from './ToolStrip';
import ScrubberWithTrim from './ScrubberWithTrim';
import TransformPanel from './TransformPanel';
import MarkupPopupByType from './MarkupPopupByType';
import MarkupOverlay from './MarkupOverlay';
import ToolStrip from './ToolStrip';
import ActionStrip from './ActionStrip';
import { DEFAULT_TRANSFORM } from '../hooks/useVideoPlayer';
import { isMediaFile } from '../lib/videoFile';

interface VideoPlayerProps {
  label: string;
  handle: VideoPlayerHandle;
  markupHandle: MarkupHandle;
  /** Toolbar on 'left' (toolbar left of video) or 'right' (toolbar right of video) */
  side: 'left' | 'right';
  isActive?: boolean;
  onActivate?: () => void;
  onRemoveVideo?: () => void;
  /** Called when a video file is dropped onto this canvas. Replaces existing video if any. */
  onDropFile?: (file: File) => void;
  onTransformChange?: (t: Partial<VideoTransform>) => void;
  onTransformReset?: () => void;
  syncTransform?: boolean;
  onSyncToggle?: (enabled: boolean, current: VideoTransform) => void;
  syncGrid?: boolean;
  onSyncGridToggle?: (enabled: boolean, current: GridSettings) => void;
  updateGridOverride?: (g: Partial<GridSettings>) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

export default function VideoPlayer({ label, handle, markupHandle, side, isActive, onActivate, onRemoveVideo, onDropFile, onTransformChange, onTransformReset, syncTransform, onSyncToggle, syncGrid, onSyncGridToggle, updateGridOverride }: VideoPlayerProps) {
  const videoAR = handle.state.videoWidth && handle.state.videoHeight ? handle.state.videoWidth / handle.state.videoHeight : 0;
  const { state, videoRef, selectFile, clearVideo, togglePlay, scrub, setTrimStart, setTrimEnd, stepFrame, setTransform, resetTransform } = handle;
  const { src: videoSrc, fileName, duration, currentTime, isPlaying, trimStart, trimEnd, transform } = state;

  const [activePanel, setActivePanel] = useState<ToolStripPanel | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const repeatBack = useRepeatWhilePressed(() => stepFrame(-1));
  const repeatFwd = useRepeatWhilePressed(() => stepFrame(1));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
      setDragOver(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && isMediaFile(file) && onDropFile) onDropFile(file);
  };

  const effectiveSetTransform = onTransformChange ?? setTransform;
  const effectiveResetTransform = onTransformReset ?? resetTransform;

  const transformActive = transform.scale !== DEFAULT_TRANSFORM.scale || transform.translateX !== DEFAULT_TRANSFORM.translateX || transform.translateY !== DEFAULT_TRANSFORM.translateY;
  const gridActive = markupHandle.state.grid.show;
  const lineActive = markupHandle.state.lines.length > 0;
  const angleActive = markupHandle.state.angles.length > 0;
  const textActive = markupHandle.state.texts.length > 0;
  const hasMarkup = lineActive || angleActive || textActive;
  const canUndo = markupHandle.state.undoStack.length > 0;
  const canRedo = markupHandle.state.redoStack.length > 0;

  const isLeft = side === 'left';
  const stripRef = useRef<HTMLDivElement>(null);

  // Close popup when clicking outside the strip
  useEffect(() => {
    if (!activePanel) return;
    const onMouseDown = (e: MouseEvent) => {
      if (stripRef.current?.contains(e.target as Node)) return;
      setActivePanel(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [activePanel]);

  const handleRemove = () => {
    clearVideo();
    onRemoveVideo?.();
  };

  const popupContent = activePanel === 'transform' ? (
    <TransformPanel embedded transform={transform} onChange={effectiveSetTransform} onReset={effectiveResetTransform} synced={syncTransform} onSyncToggle={onSyncToggle} />
  ) : (activePanel === 'grid' || activePanel === 'line' || activePanel === 'angle' || activePanel === 'text') ? (
    <MarkupPopupByType
      markup={markupHandle}
      type={activePanel}
      updateGridOverride={activePanel === 'grid' ? updateGridOverride : undefined}
      syncedGrid={syncGrid}
      onSyncGridToggle={activePanel === 'grid' ? onSyncGridToggle : undefined}
    />
  ) : null;

  const activeRing = isActive ? 'ring-2 ring-blue-400/60 ring-offset-1 ring-offset-slate-950' : '';

  const stripColumn = (
    <div ref={stripRef} className={`relative shrink-0 flex flex-col h-full gap-1 rounded-lg ${activeRing} transition-shadow`}>
      <ToolStrip
        side={side}
        active={activePanel}
        onActiveChange={setActivePanel}
        transformActive={transformActive}
        gridActive={gridActive}
        lineActive={lineActive}
        angleActive={angleActive}
        textActive={textActive}
        markupHidden={markupHandle.state.hidden}
        onToggleHidden={() => markupHandle.setHidden(!markupHandle.state.hidden)}
      />
      <div className="flex-1 min-h-0" />
      <ActionStrip
        canUndo={canUndo}
        canRedo={canRedo}
        hasMarkup={hasMarkup}
        onUndo={markupHandle.undo}
        onRedo={markupHandle.redo}
        onClearAll={markupHandle.clearAll}
      />
      {activePanel && (
        <div className={`absolute top-0 ${isLeft ? 'left-full ml-1' : 'right-full mr-1'} z-50`}>
          {popupContent}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="flex flex-col h-full min-h-0 overflow-visible"
      onClick={onActivate}
    >
      {videoSrc ? (
        <div className="flex flex-1 min-h-0 gap-2 items-stretch">
          {isLeft && stripColumn}

          <div
            className={`relative flex-1 min-h-0 bg-black rounded-lg overflow-hidden ${dragOver ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {handle.state.mediaType === 'image' ? (
              <img
                src={videoSrc}
                alt=""
                className="w-full h-full object-contain"
                style={{
                  transform: `translate(${transform.translateX}px, ${-transform.translateY}px) scale(${transform.scale})`,
                  transformOrigin: 'center center',
                }}
              />
            ) : (
              <video
                ref={videoRef}
                src={videoSrc}
                className="w-full h-full object-contain"
                style={{
                  transform: `translate(${transform.translateX}px, ${-transform.translateY}px) scale(${transform.scale})`,
                  transformOrigin: 'center center',
                }}
                playsInline
                preload="auto"
              />
            )}
            <MarkupOverlay handle={markupHandle} transform={transform} videoAR={videoAR} />
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-xs font-semibold text-white px-2.5 py-1 rounded-md pointer-events-none">
              {label}
            </div>
            {fileName && (
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-xs text-slate-300 px-2.5 py-1 rounded-md max-w-[200px] truncate pointer-events-none">
                {fileName}
              </div>
            )}
          </div>

          {!isLeft && stripColumn}
        </div>
      ) : (
        <div
          className={`relative flex-1 min-h-0 flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-colors bg-black cursor-pointer ${dragOver ? 'border-blue-400 ring-2 ring-blue-400/50' : 'border-slate-600 hover:border-blue-400'}`}
          onClick={(e) => { e.stopPropagation(); selectFile(); }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <svg className="w-12 h-12 text-slate-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-2.625 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0 1 18 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 0 1 6 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125m1.5 3.75c-.621 0-1.125-.504-1.125-1.125v-1.5c0-.621.504-1.125 1.125-1.125" />
          </svg>
          <span className="text-slate-400 text-sm font-medium">{dragOver ? 'Drop video here' : `Click to select ${label}`}</span>
        </div>
      )}

      {videoSrc && (
        <div className="mt-1.5 space-y-1 px-1 shrink-0">
          {handle.state.mediaType === 'video' ? (
            <>
              <ScrubberWithTrim
                duration={duration}
                currentTime={currentTime}
                trimStart={trimStart}
                trimEnd={trimEnd}
                onScrub={scrub}
                onTrimStartChange={setTrimStart}
                onTrimEndChange={setTrimEnd}
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{formatTime(Math.max(0, currentTime - trimStart))}</span>
                <span className="text-slate-500">/ {formatTime(Math.max(0, trimEnd - trimStart))}</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onPointerDown={(e) => { e.stopPropagation(); repeatBack.onPointerDown(e); }}
                  className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800 select-none"
                  title="Previous frame (hold to scrub)"
                >
                  <svg className="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors shadow-lg shadow-blue-600/20">
                  {isPlaying ? (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  ) : (
                    <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
                <button
                  onPointerDown={(e) => { e.stopPropagation(); repeatFwd.onPointerDown(e); }}
                  className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800 select-none"
                  title="Next frame (hold to scrub)"
                >
                  <svg className="w-4 h-4 pointer-events-none" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                </button>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 py-0.5">Image</div>
          )}
          <div className="flex items-center justify-center gap-3">
            <button onClick={(e) => { e.stopPropagation(); selectFile(); }} className="text-xs text-slate-500 hover:text-slate-300 py-0.5 transition-colors">
              {handle.state.mediaType === 'video' ? 'Change video' : 'Change image'}
            </button>
            <span className="text-slate-700">|</span>
            <button onClick={(e) => { e.stopPropagation(); handleRemove(); }} className="text-xs text-slate-600 hover:text-red-400 py-0.5 transition-colors">
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
