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
export function __reset() { loc = { pathname: '/', search: '' }; }
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => loc;
const useLoc = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export const ParamsContext = createContext(null);
export const usePathname = () => useLoc().pathname;
export function useSearchParams() { const { search } = useLoc(); return useMemo(() => new URLSearchParams(search), [search]); }
export function useParams() { return useContext(ParamsContext) || {}; }
const router = {
  push: (href) => __setLocation(href),
  replace: (href) => __setLocation(href),
  back() {}, forward() {}, refresh() {}, prefetch() {},
};
export const useRouter = () => router;
export function redirect(href) { __setLocation(href); }
export function notFound() {}
