import { useState, useEffect } from 'react';

/** Returns true when the viewport is narrower than the given breakpoint (default: 1024px = lg). */
export function useMediaQuery(query: string = '(max-width: 1023px)'): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = () => setMatches(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
