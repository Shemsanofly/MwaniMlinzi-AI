import { Children, isValidElement, useState } from 'react';
import { __setLocation, ParamsContext, usePathname } from './nextNavigation.jsx';
import { saveNavState } from '../navigation.jsx';

export * from '../navigation.jsx';

/** Test-only replacement for React Router's MemoryRouter/Routes/Route on top of the next/navigation double. */
export function MemoryRouter({ initialEntries = ['/'], children }) {
  useState(() => {
    const entry = initialEntries[initialEntries.length - 1];
    const href = typeof entry === 'object' ? `${entry.pathname || '/'}${entry.search || ''}` : entry;
    if (typeof entry === 'object' && entry.state !== undefined) saveNavState(href, entry.state);
    __setLocation(href);
    return null;
  });
  return children;
}

function match(pattern, pathname) {
  if (pattern === '*') return {};
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  const splat = p[p.length - 1] === '*';
  if (splat ? a.length < p.length - 1 : a.length !== p.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i] === '*') { params['*'] = a.slice(i).join('/'); break; }
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Routes({ children }) {
  const pathname = usePathname();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const params = match(child.props.path ?? '*', pathname);
    if (params) return <ParamsContext.Provider value={params}>{child.props.element}</ParamsContext.Provider>;
  }
  return null;
}

export function Route() { return null; }
