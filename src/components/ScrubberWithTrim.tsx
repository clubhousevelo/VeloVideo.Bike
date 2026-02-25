import { useRef, useCallback } from 'react';

interface ScrubberWithTrimProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  onScrub: (time: number) => void;
  onTrimStartChange: (time: number) => void;
  onTrimEndChange: (time: number) => void;
  className?: string;
  trackHeight?: string;
}

export default function ScrubberWithTrim({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  onScrub,
  onTrimStartChange,
  onTrimEndChange,
  className = '',
  trackHeight = 'h-5',
}: ScrubberWithTrimProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const positionToTime = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return x * duration;
    },
    [duration]
  );

  const handleTrimStartMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const onMove = (e: MouseEvent) => {
        const time = positionToTime(e.clientX);
        const clamped = Math.max(0, Math.min(time, trimEnd - 0.1));
        onTrimStartChange(clamped);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      onMove(e.nativeEvent);
    },
    [duration, trimEnd, positionToTime, onTrimStartChange]
  );

  const handleTrimEndMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const onMove = (e: MouseEvent) => {
        const time = positionToTime(e.clientX);
        const clamped = Math.max(trimStart + 0.1, Math.min(time, duration));
        onTrimEndChange(clamped);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      onMove(e.nativeEvent);
    },
    [duration, trimStart, positionToTime, onTrimEndChange]
  );

  const trimStartPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
  const trimEndPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;
  const progressInTrim =
    duration > 0 && trimEnd > trimStart
      ? ((currentTime - trimStart) / (trimEnd - trimStart)) * 100
      : 0;
  const trimWidthPercent = trimEndPercent - trimStartPercent;
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`relative w-full ${trackHeight} ${className}`} ref={trackRef}>
      {/* Track background */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 rounded-full bg-slate-700" />

      {/* Trimmed region (between brackets) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-blue-500/30 rounded-full pointer-events-none"
        style={{ left: `${trimStartPercent}%`, width: `${trimWidthPercent}%` }}
      />

      {/* Progress fill within trim */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-blue-500 rounded-full pointer-events-none"
        style={{
          left: `${trimStartPercent}%`,
          width: `${(progressInTrim / 100) * trimWidthPercent}%`,
        }}
      />

      {/* Playhead handle (circle on timeline) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-blue-400 border-2 border-white shadow-md pointer-events-none z-10"
        style={{ left: `${playheadPercent}%` }}
        aria-hidden
      />

      {/* Seek input (invisible, for dragging) */}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={currentTime}
        onChange={(e) => onScrub(parseFloat(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />

      {/* Left bracket [ — trim start */}
      <div
        className="absolute top-1/2 -translate-y-1/2 z-20 w-4 flex items-center justify-center cursor-ew-resize select-none text-slate-300 hover:text-blue-400 font-bold text-sm leading-none"
        style={{ left: `calc(${trimStartPercent}% - 8px)` }}
        onMouseDown={handleTrimStartMouseDown}
        title="Drag to set trim start"
      >
        [
      </div>

      {/* Right bracket ] — trim end (position so bracket sits at trim end) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 z-20 w-4 flex items-center justify-end cursor-ew-resize select-none text-slate-300 hover:text-blue-400 font-bold text-sm leading-none"
        style={{ left: `calc(${trimEndPercent}% - 16px)` }}
        onMouseDown={handleTrimEndMouseDown}
        title="Drag to set trim end"
      >
        ]
      </div>
    </div>
  );
}
