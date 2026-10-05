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
 * restore whatever the earlier entry carried. Next's own history writes keep unknown keys when they
 * spread the current state, but a Next-initiated replaceState that builds a fresh object would drop it
 * (the state then reads as null, never as another entry's state).
 */
const STATE_KEY = 'mwanimlinzi.navState';
const ENTRY_KEY = '__navState';
const pathOf = (to) => String(typeof to === 'object' ? to.pathname || '' : to).split(/[?#]/)[0] || '/';
const hrefOf = (to) => (typeof to === 'object' ? `${to.pathname || ''}${to.search || ''}${to.hash || ''}` : to);

export function saveNavState(to, state) {
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
  const state = pending ? pending.state : entryState();
  const key = JSON.stringify(state);
  // Attach pending state to the (by now pushed) history entry, never during render.
  useEffect(() => {
    const p = readPending(pathname);
    if (!p) return;
    writeEntryState(p.state);
    try { sessionStorage.removeItem(STATE_KEY); } catch { /* storage unavailable */ }
  }, [pathname, qs, key]);
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
