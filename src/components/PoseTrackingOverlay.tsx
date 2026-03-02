import { useEffect, useMemo, useRef, useState } from 'react';
import type { VideoTransform } from '../hooks/useVideoPlayer';
import { usePoseTracking } from '../hooks/usePoseTracking';
import type { DlcFrame } from '../lib/dlcTypes';

export type PoseTrackingPreset = 'race' | 'balanced' | 'stability';

interface PoseTrackingOverlayProps {
  enabled: boolean;
  sideViewMode?: boolean;
  preset?: PoseTrackingPreset;
  externalFrames?: DlcFrame[] | null;
  currentTime: number;
  isPlaying: boolean;
  transform: VideoTransform;
  videoAR: number;
  mediaEl?: HTMLVideoElement | null;
}

interface VideoBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL_BODY_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
];

function computeVideoBox(canvasW: number, canvasH: number, videoAR: number): VideoBox {
  if (videoAR <= 0 || !Number.isFinite(videoAR)) return { x: 0, y: 0, w: canvasW, h: canvasH };
  const width = canvasH * videoAR;
  return { x: (canvasW - width) / 2, y: 0, w: width, h: canvasH };
}

function toVisual(nx: number, ny: number, vBox: VideoBox, W: number, H: number, vt: VideoTransform) {
  const cx = vBox.x + nx * vBox.w;
  const cy = vBox.y + ny * vBox.h;
  return {
    x: W / 2 + vt.translateX + vt.scale * (cx - W / 2),
    y: H / 2 - vt.translateY + vt.scale * (cy - H / 2),
  };
}

export default function PoseTrackingOverlay({
  enabled,
  sideViewMode = false,
  preset = 'race',
  externalFrames,
  currentTime,
  isPlaying,
  transform,
  videoAR,
  mediaEl,
}: PoseTrackingOverlayProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [resolvedMediaEl, setResolvedMediaEl] = useState<HTMLVideoElement | null>(mediaEl ?? null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (mediaEl !== undefined) {
      setResolvedMediaEl(mediaEl ?? null);
      return;
    }
    if (!container) return;
    const parent = container.parentElement;
    if (!parent) return;

    const sync = () => {
      const node = parent.querySelector('video') as HTMLVideoElement | null;
      setResolvedMediaEl(node);
    };
    sync();

    const mo = new MutationObserver(sync);
    mo.observe(parent, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [container, mediaEl]);

  useEffect(() => {
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const next = entries[0].contentRect;
      if (next.width > 0 && next.height > 0) setSize({ w: next.width, h: next.height });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  const hasExternalTrack = !!externalFrames && externalFrames.length > 0;
  const presetConfig = useMemo(() => {
    if (preset === 'stability') return { targetFps: 30, minScore: 0.55, smoothFactor: 0.9 };
    if (preset === 'balanced') return { targetFps: 45, minScore: 0.5, smoothFactor: 0.84 };
    return { targetFps: 60, minScore: 0.45, smoothFactor: 0.78 };
  }, [preset]);

  const { keypoints, loading, error } = usePoseTracking({
    enabled: enabled && !hasExternalTrack,
    currentTime,
    isPlaying,
    mediaEl: resolvedMediaEl,
    targetFps: presetConfig.targetFps,
    minScore: presetConfig.minScore,
    smoothFactor: presetConfig.smoothFactor,
  });

  const externalKeypoints = useMemo(() => {
    if (!hasExternalTrack || !externalFrames) return [];
    let best = externalFrames[0];
    let bestDist = Math.abs(best.timeSec - currentTime);
    for (let i = 1; i < externalFrames.length; i += 1) {
      const dist = Math.abs(externalFrames[i].timeSec - currentTime);
      if (dist < bestDist) {
        best = externalFrames[i];
        bestDist = dist;
      }
    }
    return best.points.map((p) => ({
      index: p.index,
      x: p.x,
      y: p.y,
      score: p.confidence,
    }));
  }, [hasExternalTrack, externalFrames, currentTime]);

  const sourceKeypoints = hasExternalTrack ? externalKeypoints : keypoints;

  const pairs = useMemo(() => FULL_BODY_CONNECTIONS, []);
  const byIndex = useMemo(() => new Map(sourceKeypoints.map((kp) => [kp.index, kp])), [sourceKeypoints]);
  const preferredSideRef = useRef<'left' | 'right' | null>(null);
  const vBox = computeVideoBox(size.w, size.h, videoAR);

  const sideScores = useMemo(() => {
    const left = [11, 13, 15, 23, 25, 27, 29, 31];
    const right = [12, 14, 16, 24, 26, 28, 30, 32];
    const score = (indices: number[]) => indices.reduce((sum, idx) => sum + (byIndex.get(idx)?.score ?? 0), 0);
    return { left: score(left), right: score(right) };
  }, [byIndex]);

  const activeSide = useMemo<'left' | 'right' | null>(() => {
    if (!sideViewMode) return null;
    const prev = preferredSideRef.current;
    const { left, right } = sideScores;
    if (!left && !right) return prev;
    if (!prev) return left >= right ? 'left' : 'right';

    const prevScore = prev === 'left' ? left : right;
    const otherScore = prev === 'left' ? right : left;
    // Keep prior side unless the other side is clearly stronger to reduce flicker.
    if (prevScore >= otherScore * 0.8) return prev;
    return prev === 'left' ? 'right' : 'left';
  }, [sideViewMode, sideScores]);

  useEffect(() => {
    if (!sideViewMode) {
      preferredSideRef.current = null;
      return;
    }
    if (activeSide) preferredSideRef.current = activeSide;
  }, [sideViewMode, activeSide]);

  const sidePairs = useMemo<[number, number][]>(() => {
    if (!activeSide) return [];
    return activeSide === 'left'
      ? [[11, 13], [13, 15], [11, 23], [23, 25], [25, 27], [27, 29], [29, 31]]
      : [[12, 14], [14, 16], [12, 24], [24, 26], [26, 28], [28, 30], [30, 32]];
  }, [activeSide]);

  const renderPairs = sideViewMode ? sidePairs : pairs;
  const renderKeypoints = useMemo(() => {
    if (!sideViewMode || !activeSide) return sourceKeypoints;
    const allowed = activeSide === 'left'
      ? new Set([11, 13, 15, 23, 25, 27, 29, 31])
      : new Set([12, 14, 16, 24, 26, 28, 30, 32]);
    return sourceKeypoints.filter((kp) => allowed.has(kp.index));
  }, [sideViewMode, activeSide, sourceKeypoints]);

  if (!enabled) return null;

  return (
    <div ref={setContainer} className="absolute inset-0 pointer-events-none">
      <svg width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`}>
        {renderPairs.map(([i1, i2]) => {
          const a = byIndex.get(i1);
          const b = byIndex.get(i2);
          if (!a || !b) return null;
          const p1 = toVisual(a.x, a.y, vBox, size.w, size.h, transform);
          const p2 = toVisual(b.x, b.y, vBox, size.w, size.h, transform);
          return (
            <line
              key={`${i1}-${i2}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke="#38bdf8"
              strokeOpacity={0.85}
              strokeWidth={2}
            />
          );
        })}
        {renderKeypoints.map((kp) => {
          const p = toVisual(kp.x, kp.y, vBox, size.w, size.h, transform);
          return <circle key={kp.index} cx={p.x} cy={p.y} r={3} fill="#22d3ee" fillOpacity={0.95} />;
        })}
      </svg>
      {loading && (
        <div className="absolute left-3 bottom-3 rounded bg-black/60 px-2 py-1 text-[11px] text-cyan-200">
          Tracking...
        </div>
      )}
      {hasExternalTrack && (
        <div className="absolute left-3 bottom-3 rounded bg-black/60 px-2 py-1 text-[11px] text-emerald-200">
          DeepLabCut track
        </div>
      )}
      {sideViewMode && (
        <div className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-[11px] text-cyan-200">
          Side View{activeSide ? `: ${activeSide}` : ''}
        </div>
      )}
      {error && (
        <div className="absolute left-3 bottom-3 rounded bg-red-900/60 px-2 py-1 text-[11px] text-red-200">
          Pose error
        </div>
      )}
    </div>
  );
}
