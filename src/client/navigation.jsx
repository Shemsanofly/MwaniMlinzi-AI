'use client';
import { forwardRef, useCallback, useEffect, useMemo } from 'react';
import NextLink from 'next/link';
import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';

/**
 * React Router–compatible navigation on top of next/navigation, so page components keep their code.
 * Navigation `state` (e.g. ProtectedRoute's `from`) is kept in sessionStorage for the target path.
 */
const STATE_KEY = 'mwanimlinzi.navState';
const pathOf = (to) => String(typeof to === 'object' ? to.pathname || '' : to).split(/[?#]/)[0] || '/';
const hrefOf = (to) => (typeof to === 'object' ? `${to.pathname || ''}${to.search || ''}${to.hash || ''}` : to);

export function saveNavState(to, state) {
  try {
    if (state === undefined || state === null) sessionStorage.removeItem(STATE_KEY);
    else sessionStorage.setItem(STATE_KEY, JSON.stringify({ path: pathOf(to), state }));
  } catch { /* storage unavailable */ }
}
function readNavState(pathname) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    return saved && saved.path === pathname ? saved.state : null;
  } catch { return null; }
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
  return useMemo(() => ({ pathname, search: qs ? `?${qs}` : '', hash, state: readNavState(pathname) }), [pathname, qs, hash]);
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
      onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) saveNavState(to, state); }}
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
