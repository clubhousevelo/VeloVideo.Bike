import { useRef, useState, useEffect, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

export interface VideoTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export const DEFAULT_TRANSFORM: VideoTransform = { scale: 1, translateX: 0, translateY: 0 };

export interface ImageAdjust {
  brightness: number;
  contrast: number;
  saturation: number;
  gamma: number;
}

export const DEFAULT_IMAGE_ADJUST: ImageAdjust = { brightness: 1, contrast: 1, saturation: 1, gamma: 1 };

export type MediaType = 'video' | 'image';

export interface VideoState {
  src: string | null;
  fileName: string;
  mediaType: MediaType;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  currentTime: number;
  isPlaying: boolean;
  trimStart: number;
  trimEnd: number;
  playbackRate: number;
  transform: VideoTransform;
  imageAdjust: ImageAdjust;
}

export interface PersistedVideoMeta {
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  playbackRate: number;
  transform: VideoTransform;
  imageAdjust?: ImageAdjust;
}

export interface VideoPlayerHandle {
  state: VideoState;
  videoRef: React.RefCallback<HTMLVideoElement | null>;
  selectFile: () => void;
  clearVideo: () => void;
  loadFromPersisted: (blob: Blob, fileName: string, meta?: Partial<PersistedVideoMeta>) => void;
  togglePlay: () => void;
  scrub: (time: number) => void;
  setTrimStart: (val: number) => void;
  setTrimEnd: (val: number) => void;
  stepFrame: (dir: number) => void;
  setPlaybackRate: (rate: number) => void;
  setTransform: (t: Partial<VideoTransform>) => void;
  resetTransform: () => void;
  setImageAdjust: (a: Partial<ImageAdjust>) => void;
  resetImageAdjust: () => void;
  play: () => void;
  pause: () => void;
}

const INITIAL_STATE: VideoState = {
  src: null,
  fileName: '',
  mediaType: 'video',
  duration: 0,
  videoWidth: 0,
  videoHeight: 0,
  currentTime: 0,
  isPlaying: false,
  trimStart: 0,
  trimEnd: 0,
  playbackRate: 1,
  transform: DEFAULT_TRANSFORM,
  imageAdjust: DEFAULT_IMAGE_ADJUST,
};

function isImageBlob(blob: Blob): boolean {
  return blob.type.startsWith('image/');
}

function setStateFromImageUrl(
  setState: Dispatch<SetStateAction<VideoState>>,
  url: string,
  fileName: string,
  playbackRate: number,
  extra?: Partial<VideoState>
) {
  const img = new Image();
  img.onload = () => {
    setState(() => ({
      ...INITIAL_STATE,
      src: url,
      fileName,
      mediaType: 'image',
      duration: 1,
      videoWidth: img.naturalWidth,
      videoHeight: img.naturalHeight,
      trimStart: 0,
      trimEnd: 1,
      currentTime: 0,
      playbackRate,
      ...extra,
    }));
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setState(INITIAL_STATE);
  };
  img.src = url;
}

export function useVideoPlayer(): VideoPlayerHandle {
  // Track the actual DOM element via callback ref so we detect remounts (mode switches).
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const [state, setState] = useState<VideoState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  const animRef = useRef<number>(0);

  // Callback ref: called by React whenever the <video> element mounts/unmounts.
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    setVideoEl(el);
  }, []);

  const syncTime = useCallback(() => {
    const video = videoElRef.current;
    if (!video) return;
    const st = stateRef.current;

    setState((prev) => ({ ...prev, currentTime: video.currentTime }));

    // Loop: when we reach trim end, seek back to trim start and keep playing
    if (video.currentTime >= st.trimEnd && st.trimEnd > 0) {
      video.currentTime = st.trimStart;
      setState((prev) => ({ ...prev, currentTime: st.trimStart }));
    }

    if (!video.paused) {
      animRef.current = requestAnimationFrame(syncTime);
    }
  }, []);

  // Re-attach event listeners whenever the video element OR src changes.
  // This ensures listeners work after mode switches that remount the <video> element.
  useEffect(() => {
    if (!videoEl || !state.src) return;

    // Sync isPlaying with actual DOM state. When switching SBS/Overlay, the old video
    // unmounts (playback stops) but cleanup removes our pause listener before it fires,
    // leaving state stuck at isPlaying: true. The new element mounts paused, so we sync.
    setState((prev) => (prev.isPlaying !== !videoEl.paused ? { ...prev, isPlaying: !videoEl.paused } : prev));

    const onLoaded = () => {
      const dur = videoEl.duration;
      const st = stateRef.current;
      setState((prev) => ({
        ...prev,
        duration: dur,
        videoWidth: videoEl.videoWidth,
        videoHeight: videoEl.videoHeight,
        trimEnd: prev.trimEnd === 0 || prev.trimEnd > dur ? dur : prev.trimEnd,
      }));
      videoEl.playbackRate = st.playbackRate;
      if (st.currentTime > 0 && st.currentTime <= dur) {
        videoEl.currentTime = st.currentTime;
      }
    };

    const onPlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }));
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(syncTime);
    };

    const onPause = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
      cancelAnimationFrame(animRef.current);
    };

    const onEnded = () => {
      const st = stateRef.current;
      videoEl.currentTime = st.trimStart;
      setState((prev) => ({ ...prev, currentTime: st.trimStart }));
      videoEl.play(); // loop
    };

    videoEl.addEventListener('loadedmetadata', onLoaded);
    videoEl.addEventListener('play', onPlay);
    videoEl.addEventListener('pause', onPause);
    videoEl.addEventListener('ended', onEnded);

    // If the element already has metadata (remount with same blob URL), apply state now.
    if (videoEl.readyState >= 1) {
      const st = stateRef.current;
      videoEl.playbackRate = st.playbackRate;
      if (st.currentTime > 0) videoEl.currentTime = st.currentTime;
    }

    return () => {
      videoEl.removeEventListener('loadedmetadata', onLoaded);
      videoEl.removeEventListener('play', onPlay);
      videoEl.removeEventListener('pause', onPause);
      videoEl.removeEventListener('ended', onEnded);
      cancelAnimationFrame(animRef.current);
    };
  }, [videoEl, state.src, syncTime]);

  useEffect(() => {
    const video = videoElRef.current;
    if (video && video.readyState > 0) {
      video.playbackRate = state.playbackRate;
    }
  }, [state.playbackRate]);

  const clearVideo = useCallback(() => {
    const currentSrc = stateRef.current.src;
    if (currentSrc) URL.revokeObjectURL(currentSrc);
    setState(INITIAL_STATE);
  }, []);

  const selectFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const currentSrc = stateRef.current.src;
      if (currentSrc) URL.revokeObjectURL(currentSrc);
      const url = URL.createObjectURL(file);
      const rate = stateRef.current.playbackRate;
      if (file.type.startsWith('image/')) {
        setStateFromImageUrl(setState, url, file.name, rate);
      } else {
        setState({ ...INITIAL_STATE, src: url, fileName: file.name, playbackRate: rate });
      }
    };
    input.click();
  }, []);

  const loadFromPersisted = useCallback((blob: Blob, fileName: string, meta?: Partial<PersistedVideoMeta>) => {
    const currentSrc = stateRef.current.src;
    if (currentSrc) URL.revokeObjectURL(currentSrc);
    const url = URL.createObjectURL(blob);
    const rate = stateRef.current.playbackRate;
    if (isImageBlob(blob)) {
      const extra: Partial<VideoState> = {};
      if (meta?.transform != null) extra.transform = meta.transform;
      if (meta?.imageAdjust != null) extra.imageAdjust = meta.imageAdjust;
      setStateFromImageUrl(setState, url, fileName, rate, extra);
    } else {
      const base = { ...INITIAL_STATE, src: url, fileName, playbackRate: rate };
      if (meta) {
        if (meta.trimStart != null) base.trimStart = meta.trimStart;
        if (meta.trimEnd != null) base.trimEnd = meta.trimEnd;
        if (meta.currentTime != null) base.currentTime = meta.currentTime;
        if (meta.playbackRate != null) base.playbackRate = meta.playbackRate;
        if (meta.transform != null) base.transform = meta.transform;
        if (meta.imageAdjust != null) base.imageAdjust = meta.imageAdjust;
      }
      setState(base);
    }
  }, []);

  const play = useCallback(() => {
    const video = videoElRef.current;
    if (!video || !video.src) return;
    const st = stateRef.current;
    if (video.currentTime >= st.trimEnd || video.currentTime < st.trimStart) {
      video.currentTime = st.trimStart;
    }
    video.play();
  }, []);

  const pause = useCallback(() => {
    videoElRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoElRef.current;
    if (!video) return;
    if (video.paused) {
      play();
    } else {
      pause();
    }
  }, [play, pause]);

  const scrub = useCallback((time: number) => {
    const video = videoElRef.current;
    if (!video) return;
    video.currentTime = time;
    setState((prev) => ({ ...prev, currentTime: time }));
  }, []);

  const setTrimStart = useCallback((val: number) => {
    setState((prev) => {
      const clamped = Math.min(val, prev.trimEnd - 0.1);
      const video = videoElRef.current;
      if (video && video.currentTime < clamped) {
        video.currentTime = clamped;
      }
      return { ...prev, trimStart: clamped };
    });
  }, []);

  const setTrimEnd = useCallback((val: number) => {
    setState((prev) => {
      const clamped = Math.max(val, prev.trimStart + 0.1);
      const video = videoElRef.current;
      if (video && video.currentTime > clamped) {
        video.currentTime = clamped;
      }
      return { ...prev, trimEnd: clamped };
    });
  }, []);

  const stepFrame = useCallback((dir: number) => {
    const video = videoElRef.current;
    if (!video || !video.paused) return;
    if (video.seeking) return;
    const st = stateRef.current;
    const step = dir * (1 / 60); // 1 frame at 60fps
    const newTime = Math.max(st.trimStart, Math.min(st.trimEnd, video.currentTime + step));
    video.currentTime = newTime;
    setState((prev) => ({ ...prev, currentTime: newTime }));
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    setState((prev) => ({ ...prev, playbackRate: rate }));
  }, []);

  const setTransform = useCallback((t: Partial<VideoTransform>) => {
    setState((prev) => ({ ...prev, transform: { ...prev.transform, ...t } }));
  }, []);

  const resetTransform = useCallback(() => {
    setState((prev) => ({ ...prev, transform: DEFAULT_TRANSFORM }));
  }, []);

  const setImageAdjust = useCallback((a: Partial<ImageAdjust>) => {
    setState((prev) => ({ ...prev, imageAdjust: { ...prev.imageAdjust, ...a } }));
  }, []);

  const resetImageAdjust = useCallback(() => {
    setState((prev) => ({ ...prev, imageAdjust: DEFAULT_IMAGE_ADJUST }));
  }, []);

  return {
    state,
    videoRef,
    selectFile,
    clearVideo,
    loadFromPersisted,
    togglePlay,
    scrub,
    setTrimStart,
    setTrimEnd,
    stepFrame,
    setPlaybackRate,
    setTransform,
    resetTransform,
    setImageAdjust,
    resetImageAdjust,
    play,
    pause,
  };
}
