import { Link } from 'react-router-dom';

/**
 * Brand mark. `compact` drops the "AI" suffix on very narrow screens; `iconOnlyOnPhone` shows only the
 * icon below 420px (`'xs'`: below 360px), so the name is never cut off mid-word.
 */
export default function Logo({ to = '/', light = false, compact = false, iconOnlyOnPhone = false }) {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-2" aria-label="MwaniMlinzi AI">
      <img src="/favicon.svg" alt="" className="h-8 w-8 shrink-0" />
      <span className={`truncate text-lg font-extrabold tracking-tight ${{ true: 'hidden min-[420px]:inline', xs: 'hidden min-[360px]:inline' }[iconOnlyOnPhone] || ''} ${light ? 'text-white' : 'text-ocean-800'}`}>
        MwaniMlinzi<span className={`${compact ? 'hidden min-[380px]:inline' : ''} ${light ? 'text-teal-300' : 'text-seaweed-600'}`}> AI</span>
      </span>
    </Link>
  );
}
