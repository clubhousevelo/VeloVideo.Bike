import { useEffect, useMemo, useRef, useState } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export interface TrackedKeypoint {
  index: number;
  x: number;
  y: number;
  score: number;
}

interface UsePoseTrackingOptions {
  enabled: boolean;
  currentTime: number;
  isPlaying: boolean;
  mediaEl?: HTMLVideoElement | null;
  targetFps?: number;
  minScore?: number;
  smoothFactor?: number;
}

interface UsePoseTrackingResult {
  keypoints: TrackedKeypoint[];
  loading: boolean;
  error: string | null;
}

const MEDIAPIPE_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const POSE_HEAVY_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task';

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;

async function getPoseLandmarker() {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: POSE_HEAVY_MODEL_PATH,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })();
  }
  return poseLandmarkerPromise;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function usePoseTracking({
  enabled,
  currentTime,
  isPlaying,
  mediaEl,
  targetFps = 60,
  minScore = 0.45,
  smoothFactor = 0.78,
}: UsePoseTrackingOptions): UsePoseTrackingResult {
  const [keypoints, setKeypoints] = useState<TrackedKeypoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rafRef = useRef<number>(0);
  const videoFrameCbRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const previousRef = useRef<Map<number, TrackedKeypoint>>(new Map());
  const runningRef = useRef(false);
  const detectRef = useRef<(() => Promise<void>) | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  const frameIntervalMs = useMemo(() => Math.max(1000 / targetFps, 8), [targetFps]);

  useEffect(() => {
    if (!enabled || !mediaEl) {
      setKeypoints([]);
      setLoading(false);
      setError(null);
      previousRef.current = new Map();
      inFlightRef.current = false;
      pendingRef.current = false;
      return;
    }
    if (mediaEl.readyState < 2 || mediaEl.videoWidth === 0 || mediaEl.videoHeight === 0) return;

    let cancelled = false;
    runningRef.current = true;

    const detectOnce = async () => {
      if (cancelled || !runningRef.current) return;
      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }
      inFlightRef.current = true;
      setLoading(true);
      try {
        const detector = await getPoseLandmarker();
        if (cancelled || !runningRef.current) return;
        const result = detector.detectForVideo(mediaEl, performance.now());
        if (cancelled || !runningRef.current) return;
        const landmarks = result.landmarks?.[0];
        if (!landmarks || landmarks.length === 0) {
          setKeypoints([]);
          return;
        }

        const prevMap = previousRef.current;
        const nextMap = new Map<number, TrackedKeypoint>();
        const next: TrackedKeypoint[] = [];

        for (let i = 0; i < landmarks.length; i += 1) {
          const kp = landmarks[i];
          const score = kp.visibility ?? 1;
          if (score < minScore) continue;
          const rawPoint: TrackedKeypoint = {
            index: i,
            x: kp.x,
            y: kp.y,
            score,
          };
          const prev = prevMap.get(i);
          let smoothed = rawPoint;
          if (prev) {
            // For high-cadence pedaling, reduce smoothing lag during rapid movement.
            const motion = Math.hypot(rawPoint.x - prev.x, rawPoint.y - prev.y);
            const motionBoost = Math.max(0, Math.min(0.18, (motion - 0.01) * 3.5));
            const confidenceBoost = rawPoint.score > 0.8 ? 0.04 : 0;
            const alpha = Math.min(0.96, smoothFactor + motionBoost + confidenceBoost);
            smoothed = {
              ...rawPoint,
              x: lerp(prev.x, rawPoint.x, alpha),
              y: lerp(prev.y, rawPoint.y, alpha),
            };
          }
          next.push(smoothed);
          nextMap.set(i, smoothed);
        }

        previousRef.current = nextMap;
        setKeypoints(next);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run pose tracking');
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setLoading(false);
        if (!cancelled && runningRef.current && pendingRef.current) {
          pendingRef.current = false;
          void detectOnce();
        }
      }
    };

    detectRef.current = detectOnce;

    const tick = (ts: number) => {
      if (cancelled || !runningRef.current) return;
      if (ts - lastTsRef.current >= frameIntervalMs) {
        lastTsRef.current = ts;
        void detectOnce();
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    void detectOnce();
    if (isPlaying) {
      if ('requestVideoFrameCallback' in mediaEl) {
        const next = (_now: number, _meta: VideoFrameCallbackMetadata) => {
          if (cancelled || !runningRef.current) return;
          const ts = performance.now();
          if (ts - lastTsRef.current >= frameIntervalMs) {
            lastTsRef.current = ts;
            void detectOnce();
          }
          videoFrameCbRef.current = mediaEl.requestVideoFrameCallback(next);
        };
        videoFrameCbRef.current = mediaEl.requestVideoFrameCallback(next);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    return () => {
      cancelled = true;
      runningRef.current = false;
      detectRef.current = null;
      cancelAnimationFrame(rafRef.current);
      if (videoFrameCbRef.current != null && 'cancelVideoFrameCallback' in mediaEl) {
        mediaEl.cancelVideoFrameCallback(videoFrameCbRef.current);
      }
      videoFrameCbRef.current = null;
      inFlightRef.current = false;
      pendingRef.current = false;
    };
  }, [enabled, mediaEl, isPlaying, frameIntervalMs, minScore, smoothFactor]);

  useEffect(() => {
    if (!enabled || isPlaying) return;
    void detectRef.current?.();
  }, [enabled, isPlaying, currentTime]);

  return { keypoints, loading, error };
}
