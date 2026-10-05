import { useEffect, useState } from 'react';

const query = (q) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);

/** True while the media query matches (false where matchMedia is unavailable, e.g. tests). */
export function useMediaQuery(q) {
  const [matches, setMatches] = useState(() => !!query(q)?.matches);
  useEffect(() => {
    const m = query(q);
    if (!m) return undefined;
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, [q]);
  return matches;
}

/** Phone layout: below Tailwind's `sm` breakpoint (640px). */
export const usePhone = () => useMediaQuery('(max-width: 639.98px)');
/** Desktop layout: Tailwind's `lg` breakpoint (1024px) and up. */
export const useDesktop = () => useMediaQuery('(min-width: 1024px)');
