import { useRef, useCallback, useEffect } from 'react';

const INITIAL_DELAY_MS = 200;
const REPEAT_INTERVAL_MS = 50;

/**
 * Returns handlers to call callback once on press, then repeat after a delay while held.
 * Use onPointerDown; pointerup/pointercancel on document clear the repeat.
 */
export function useRepeatWhilePressed(callback: () => void) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      callback();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        intervalRef.current = setInterval(callback, REPEAT_INTERVAL_MS);
      }, INITIAL_DELAY_MS);
      const onUp = () => {
        clear();
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [callback, clear]
  );

  useEffect(() => () => clear(), [clear]);

  return { onPointerDown };
}
