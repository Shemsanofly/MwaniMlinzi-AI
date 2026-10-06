import { useId } from 'react';
import { Link } from '../navigation.jsx';

/** The mark: a seaweed frond rising out of a wave, inside a rounded tile. Inline so it inherits no extra request. */
export function LogoMark({ className = 'h-8 w-8' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={`shrink-0 ${className}`} aria-hidden>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10566a" />
          <stop offset="1" stopColor="#051f29" />
        </linearGradient>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b3f0e4" />
          <stop offset="1" stopColor="#45cfb6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}t)`} />
      <path d="M33 11c-9 9-13 17-12.5 25 .4 6.6 5.3 11 11.5 11s11.1-4.4 11.5-11C44 28 41 20 33 11z" fill={`url(#${id}f)`} />
      <path d="M32 22v24" stroke="#083140" strokeWidth="2.4" strokeLinecap="round" opacity=".55" />
      <path d="M11 47.5c5.5-3 10-3 15.5 0s10 3 15.5 0 8-3 11 -1" stroke="#eff8f9" strokeWidth="3.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Brand mark. `compact` drops the "AI" suffix on very narrow screens; `iconOnlyOnPhone` shows only the
 * icon below 420px (`'xs'`: below 360px), so the name is never cut off mid-word.
 */
export default function Logo({ to = '/', light = false, compact = false, iconOnlyOnPhone = false }) {
  return (
    <Link to={to} className="group flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lagoon-300/40" aria-label="MwaniMlinzi AI">
      <span className="transition-transform duration-500 ease-[var(--ease-spring)] group-hover:-rotate-6 group-hover:scale-105"><LogoMark /></span>
      <span className={`truncate text-[1.1rem] font-extrabold tracking-[-0.03em] ${{ true: 'hidden min-[420px]:inline', xs: 'hidden min-[360px]:inline' }[iconOnlyOnPhone] || ''} ${light ? 'text-white' : 'text-ocean-900'}`}>
        MwaniMlinzi<span className={`${compact ? 'hidden min-[380px]:inline' : ''} ml-1 font-semibold ${light ? 'text-lagoon-300' : 'text-ocean-500'}`}>AI</span>
      </span>
    </Link>
  );
}
