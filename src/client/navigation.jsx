'use client';
import { forwardRef, useCallback, useEffect, useMemo } from 'react';
import NextLink from 'next/link';
import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';

/**
 * React Router–compatible navigation on top of next/navigation, so page components keep their code.
 * Navigation `state` (e.g. ProtectedRoute's `from`) belongs to a history entry, like React Router's.
 * `saveNavState` parks it in sessionStorage as "pending" for the target path; once that path renders,
 * useLocation moves it into window.history.state.__navState (after Next has pushed its own entry) and
 * clears the pending slot. A navigation without state therefore yields `state: null`, and Back/Forward
 * restore whatever the earlier entry carried.
 *
 * Next rewrites the current entry with a fresh state object (replaceState({__NA, tree})) on ordinary
 * navigations and again on later router-state changes, which drops our key. So the last resolved state is
 * also remembered in memory (`current`) together with a navigation epoch; while no navigation of ours
 * (saveNavState/navigate/Link/setSearchParams/popstate) happened since, a dropped key is served from
 * `current` and re-attached to the entry. Limit: if Next rewrites the entry and nothing re-renders a
 * useLocation consumer before the user leaves, the entry stays without state until the next render.
 */
const STATE_KEY = 'mwanimlinzi.navState';
const ENTRY_KEY = '__navState';
const pathOf = (to) => String(typeof to === 'object' ? to.pathname || '' : to).split(/[?#]/)[0] || '/';
const hrefOf = (to) => (typeof to === 'object' ? `${to.pathname || ''}${to.search || ''}${to.hash || ''}` : to);

let epoch = 0;
let current = null; // { pathname, state, epoch } for the entry most recently resolved by useLocation
const bump = () => { epoch += 1; current = null; };
if (typeof window !== 'undefined') window.addEventListener('popstate', bump);

export function saveNavState(to, state) {
  bump();
  try {
    if (state === undefined || state === null) sessionStorage.removeItem(STATE_KEY);
    else sessionStorage.setItem(STATE_KEY, JSON.stringify({ path: pathOf(to), state }));
  } catch { /* storage unavailable */ }
}
function readPending(pathname) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    return saved && saved.path === pathname ? saved : null;
  } catch { return null; }
}
const entryState = () => {
  try { return window.history.state?.[ENTRY_KEY] ?? null; } catch { return null; }
};
function writeEntryState(state) {
  try {
    const { [ENTRY_KEY]: _old, ...rest } = window.history.state || {};
    const next = state === undefined || state === null ? rest : { ...rest, [ENTRY_KEY]: state };
    window.history.replaceState(next, '', window.location.href);
  } catch { /* history unavailable */ }
}
/** Forget every pending and current-entry navigation state (used on explicit logout). */
export function clearNavState() {
  bump();
  try { sessionStorage.removeItem(STATE_KEY); } catch { /* storage unavailable */ }
  if (typeof window !== 'undefined' && entryState() !== null) writeEntryState(null);
}

export function useNavigate() {
  const router = useRouter();
  return useCallback((to, { replace = false, state } = {}) => {
    if (typeof to === 'number') { if (to < 0) router.back(); else router.forward(); return; }
    saveNavState(to, state);
    if (replace) router.replace(hrefOf(to)); else router.push(hrefOf(to));
  }, [router]);
}

export function useLocation() {
  const pathname = usePathname() || '/';
  const sp = useNextSearchParams();
  const qs = sp ? sp.toString() : '';
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const pending = typeof window !== 'undefined' ? readPending(pathname) : null;
  let state = pending ? pending.state : entryState();
  if (state === null && current && current.pathname === pathname && current.epoch === epoch) state = current.state;
  const key = JSON.stringify(state);
  // Attach state to the (by now pushed) history entry, never during render. Runs every render so an entry
  // that Next rewrote without our key gets it back.
  useEffect(() => {
    const p = readPending(pathname);
    const resolved = p ? p.state : (entryState() ?? (current && current.pathname === pathname && current.epoch === epoch ? current.state : null));
    if (resolved === null) return;
    current = { pathname, state: resolved, epoch };
    if (p) { try { sessionStorage.removeItem(STATE_KEY); } catch { /* storage unavailable */ } }
    if (p || entryState() === null) writeEntryState(resolved);
  });
  return useMemo(() => ({ pathname, search: qs ? `?${qs}` : '', hash, state }), [pathname, qs, hash, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useParams() {
  return useNextParams() || {};
}

export function useSearchParams() {
  const sp = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname() || '/';
  const qs = sp ? sp.toString() : '';
  const params = useMemo(() => new URLSearchParams(qs), [qs]);
  const setParams = useCallback((next, { replace = false } = {}) => {
    bump();
    const value = typeof next === 'function' ? next(new URLSearchParams(qs)) : next;
    const search = new URLSearchParams(value).toString();
    const href = search ? `${pathname}?${search}` : pathname;
    if (replace) router.replace(href, { scroll: false }); else router.push(href, { scroll: false });
  }, [qs, pathname, router]);
  return [params, setParams];
}

export const Link = forwardRef(function Link({ to, replace, state, onClick, ...rest }, ref) {
  return (
    <NextLink
      ref={ref}
      href={hrefOf(to)}
      replace={replace}
      onClick={(e) => {
        onClick?.(e);
        const newTab = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
        if (!e.defaultPrevented && !newTab) saveNavState(to, state);
      }}
      {...rest}
    />
  );
});

const isActivePath = (pathname, to, end) => {
  const path = pathOf(to);
  if (pathname === path) return true;
  if (end || path === '/') return false;
  return pathname.startsWith(path.endsWith('/') ? path : `${path}/`);
};

export const NavLink = forwardRef(function NavLink({ to, end = false, className, style, children, ...rest }, ref) {
  const pathname = usePathname() || '/';
  const isActive = isActivePath(pathname, to, end);
  const status = { isActive, isPending: false, isTransitioning: false };
  const cls = typeof className === 'function' ? className(status) : [className, isActive ? 'active' : null].filter(Boolean).join(' ') || undefined;
  return (
    <Link
      ref={ref}
      to={to}
      className={cls}
      style={typeof style === 'function' ? style(status) : style}
      aria-current={isActive ? 'page' : undefined}
      {...rest}
    >
      {typeof children === 'function' ? children(status) : children}
    </Link>
  );
});

export function Navigate({ to, replace = false, state }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to, { replace, state }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
