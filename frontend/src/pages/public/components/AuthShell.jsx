import { cx } from '../../../components/ui/index.jsx';

/**
 * Login / registration layout: the form card, with a page-specific panel (`aside`) beside it from the
 * `lg` breakpoint up. `tone` tints the page behind the card to match that panel.
 */
export default function AuthShell({ title, subtitle, children, aside, wide = false, tone = 'night' }) {
  return (
    <div className={cx('relative overflow-clip px-4 py-10 sm:py-16', tone === 'night' ? 'bg-sand-50' : 'bg-gradient-to-br from-lagoon-200/25 via-sand-50 to-sand-100')}>
      <div className={cx('pointer-events-none absolute inset-x-0 top-0 h-80', tone === 'night' ? 'bg-gradient-to-b from-ocean-100/50 to-transparent' : 'bg-[radial-gradient(40rem_20rem_at_10%_0%,rgb(126_227_208/0.25),transparent)]')} aria-hidden />
      <div className={cx(
        'relative mx-auto grid w-full animate-pop items-stretch overflow-clip rounded-[1.75rem] bg-white shadow-[var(--shadow-lift)] ring-1 ring-slate-200/80',
        aside ? (wide ? 'max-w-6xl lg:grid-cols-[0.85fr_1.6fr]' : 'max-w-4xl lg:grid-cols-[1fr_1.1fr]') : 'max-w-md',
      )}>
        {aside}
        <div className="p-6 sm:p-10">
          <h1 className="text-[1.75rem] font-extrabold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-slate-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
