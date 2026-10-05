import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

/** In-memory stand-in for next/navigation used by every client test. */
let loc = { pathname: '/', search: '' };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
export function __setLocation(href) {
  const u = new URL(href, 'http://localhost');
  loc = { pathname: u.pathname, search: u.search };
  emit();
}
export function __reset() {
  loc = { pathname: '/', search: '' };
  delay = 0;
  try { window.history.replaceState(null, '', '/'); } catch { /* no window */ }
}
let delay = 0;
/** Make push/replace complete asynchronously, like a Next transition. */
export function __setDelay(ms) { delay = ms; }
const sync = () => { loc = { pathname: window.location.pathname, search: window.location.search }; emit(); };
if (typeof window !== 'undefined') window.addEventListener('popstate', sync);
const go = (kind, href) => {
  const run = () => {
    const u = new URL(href, 'http://localhost');
    // Next pushes its own state object; entries start without app state.
    window.history[kind](kind === 'pushState' ? { __NA: true } : { ...(window.history.state || {}) }, '', u.pathname + u.search + u.hash);
    __setLocation(href);
  };
  if (delay) setTimeout(run, delay); else run();
};
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => loc;
const useLoc = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export const ParamsContext = createContext(null);
export const usePathname = () => useLoc().pathname;
export function useSearchParams() { const { search } = useLoc(); return useMemo(() => new URLSearchParams(search), [search]); }
export function useParams() { return useContext(ParamsContext) || {}; }
const router = {
  push: (href) => go('pushState', href),
  replace: (href) => go('replaceState', href),
  back() { window.history.back(); },
  forward() { window.history.forward(); },
  refresh() {}, prefetch() {},
};
export const useRouter = () => router;
export function redirect(href) { __setLocation(href); }
export function notFound() {}
