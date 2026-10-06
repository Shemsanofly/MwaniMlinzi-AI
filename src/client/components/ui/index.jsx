import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, CloudOff, Database, Eye, EyeOff, FlaskConical, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { usePhone } from '../../hooks/useMediaQuery.js';
import { useDialog } from '../../hooks/useDialog.js';
import { riskStyle } from '../../utils/risk.js';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

const BUTTON = {
  primary: 'bg-ocean-800 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(8_49_64/0.2)] hover:bg-ocean-900 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_8px_20px_-8px_rgb(8_49_64/0.55)] focus-visible:ring-ocean-500/30 disabled:bg-ocean-800/50',
  secondary: 'bg-white text-ocean-800 ring-1 ring-inset ring-slate-300/80 shadow-[0_1px_2px_rgb(8_49_64/0.06)] hover:bg-ocean-50 hover:ring-ocean-300 focus-visible:ring-ocean-500/30',
  ghost: 'text-ocean-800 hover:bg-ocean-50 focus-visible:ring-ocean-500/30',
  accent: 'bg-lagoon-400 text-ocean-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.35)] hover:bg-lagoon-300 focus-visible:ring-lagoon-300/50',
  danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-300',
  success: 'bg-seaweed-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-seaweed-700 focus-visible:ring-seaweed-500/30',
};
const SIZE = { sm: 'min-h-11 px-3 py-1.5 text-sm', md: 'min-h-11 px-4 py-2.5 text-sm', lg: 'min-h-12 px-5 py-3.5 text-base' };

/** Scroll-reveal: marks the element `.is-visible` once it enters the viewport (no-op without IntersectionObserver). */
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

/** Fades and lifts its content into view on scroll. `delay` staggers siblings (ms). */
export function Reveal({ as: Comp = 'div', delay = 0, className, style, children, ...props }) {
  const ref = useReveal();
  return <Comp ref={ref} data-reveal="" className={className} style={{ ...style, '--reveal-delay': `${delay}ms` }} {...props}>{children}</Comp>;
}

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('inline-flex min-w-0 max-w-full select-none items-center justify-center gap-2 rounded-xl text-center font-semibold transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100', BUTTON[variant], SIZE[size], className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return <div className={cx('surface', className)} {...props}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5', className)}>
      <div className="flex min-w-0 flex-[1_1_12rem] items-start gap-3">
        {Icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700 ring-1 ring-inset ring-ocean-100"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>}
        <div className="min-w-0 self-center">
          <h3 className="font-bold tracking-tight text-slate-900">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="min-w-0 max-w-full">{action}</div>}
    </div>
  );
}

export function Badge({ className, children, title }) {
  return <span title={title} className={cx('inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-left text-xs font-semibold ring-1 ring-inset', className || 'bg-slate-100 text-slate-700 ring-slate-200')}>{children}</span>;
}

export function RiskBadge({ level, long = false, size = 'sm' }) {
  const { t } = useI18n();
  if (!level) return <Badge>—</Badge>;
  return (
    <Badge className={cx(riskStyle(level).badge, size === 'lg' && 'px-3 py-1 text-sm')}>
      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', riskStyle(level).bar, (level === 'HIGH' || level === 'CRITICAL') && 'animate-pulse')} aria-hidden />
      {t(long ? `risk.levelLong.${level}` : `risk.level.${level}`)}
    </Badge>
  );
}

/** Data-provenance label: LIVE / CACHED (last saved live reading) / UNAVAILABLE (no environmental reading) / SIMULATION (what-if). */
export function SourceBadge({ source }) {
  const { t } = useI18n();
  if (!source) return null;
  const style = {
    LIVE: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
    CACHED: 'bg-ocean-50 text-ocean-800 ring-ocean-200',
    UNAVAILABLE: 'bg-slate-50 text-slate-600 ring-slate-200',
    SIMULATION: 'bg-amber-50 text-amber-800 ring-amber-200',
  }[source];
  if (!style) return null;
  const Icon = source === 'SIMULATION' ? FlaskConical : source === 'UNAVAILABLE' ? CloudOff : Database;
  return <Badge className={style}><Icon className="h-3 w-3" aria-hidden />{t(`source.${source}`)}</Badge>;
}

export function Spinner({ className }) {
  const { t } = useI18n();
  return <Loader2 className={cx('h-5 w-5 animate-spin text-ocean-600', className)} aria-label={t('actions.loading')} />;
}

export function PageLoader({ label }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[40vh] animate-fade flex-col items-center justify-center gap-4 text-slate-500" role="status">
      <span className="relative flex h-12 w-12 items-center justify-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border-2 border-ocean-100" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-ocean-600 [animation-duration:0.9s]" />
        <span className="h-2 w-2 animate-pulse-ring rounded-full bg-lagoon-400" />
      </span>
      <span className="text-sm font-medium">{label || t('actions.loading')}</span>
    </div>
  );
}

/**
 * Headline for an API error. Known backend codes are translated (errors.codes.<CODE>); otherwise the
 * backend's own message is shown only in English (it is always English) and a translated generic message in Kiswahili.
 */
export function apiErrorMessage(error, t, lang) {
  if (!error) return t('errors.generic');
  if (error.code) {
    const key = `errors.codes.${error.code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  if (error.status === 0) return t('errors.network');
  if (error.status === 403) return t('errors.forbidden');
  if (error.status === 404) return t('errors.notFound');
  // Server faults never show technical text (e.g. "Request failed with status code 500").
  if (error.status >= 500) return t('errors.generic');
  // No HTTP status: a message built in the browser (already translated), e.g. "Enter your phone number".
  if (error.status == null) return error.message || t('errors.generic');
  if (lang === 'en' && error.message) return error.message;
  return t('errors.generic');
}

/** Hook form of apiErrorMessage: `const errMsg = useApiErrorMessage(); errMsg(error)`. */
export function useApiErrorMessage() {
  const { t, lang } = useI18n();
  return (error) => (error ? apiErrorMessage(error, t, lang) : null);
}

/** One validation detail line: as-is in English; field name + translated hint in Kiswahili. */
function detailLine(d, t, lang) {
  const path = Array.isArray(d?.path) ? d.path.join('.') : d?.path;
  if (lang === 'en') return `${path ? `${path}: ` : ''}${d?.message ?? ''}`;
  return `${path ? `${path}: ` : ''}${t('errors.invalidValue')}`;
}

/** Load failure panel: a friendly sentence + "Try again". Technical details go to the console only. */
export function ErrorState({ error, onRetry, compact = false }) {
  const { t, lang } = useI18n();
  let message = apiErrorMessage(error, t, lang);
  if (message === t('errors.generic')) message = t('errors.loadFailed');
  useEffect(() => { if (error) console.warn('[load failed]', error?.status ?? '', error?.code ?? '', error?.message ?? error); }, [error]);
  return (
    <div role="alert" className={cx('flex animate-rise flex-col items-center gap-3 rounded-2xl border border-red-200/80 bg-red-50/70 text-center text-red-800', compact ? 'p-4' : 'p-8')}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-600 shadow-sm ring-1 ring-red-100"><AlertTriangle className="h-5 w-5" aria-hidden /></span>
      <p className="text-sm font-medium">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>{t('actions.retry')}</Button>}
    </div>
  );
}

export function EmptyState({ title, message, action, icon: Icon = Inbox }) {
  const { t } = useI18n();
  return (
    <div className="flex animate-rise flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-10 text-center">
      <span className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-ocean-50 to-sand-100 text-ocean-600 ring-1 ring-inset ring-ocean-100"><Icon className="h-7 w-7" aria-hidden /></span>
      <p className="font-semibold text-slate-800">{title || t('common.noData')}</p>
      {message && <p className="max-w-md text-sm text-slate-500">{message}</p>}
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'ocean', onClick }) {
  const tones = {
    ocean: 'bg-ocean-50 text-ocean-700 ring-ocean-100', red: 'bg-red-50 text-red-700 ring-red-100', orange: 'bg-orange-50 text-orange-700 ring-orange-100',
    green: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-100', amber: 'bg-amber-50 text-amber-700 ring-amber-100', slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cx('surface group flex w-full items-start gap-3.5 p-4 text-left', onClick && 'lift hover:border-ocean-200')}>
      {Icon && <span className={cx('shrink-0 rounded-xl p-2.5 ring-1 ring-inset transition-transform duration-300 group-hover:scale-105', tones[tone])}><Icon className="h-5 w-5" aria-hidden /></span>}
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-extrabold tabular-nums tracking-tight text-slate-900 sm:text-2xl">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </Comp>
  );
}

export function PageHeader({ title, subtitle, actions, badge }) {
  return (
    <div className="mb-6 flex animate-rise flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.75rem]">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const { t } = useI18n();
  const panel = useRef(null);
  useDialog(open, panel, onClose);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  // Animated/filtered ancestors establish a containing block for position: fixed.
  // Mount at the document level so the dialog always uses the device viewport.
  return createPortal(
    <div className="fixed inset-0 z-[1000] flex animate-fade items-end justify-center bg-ocean-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={panel} tabIndex={-1} className={cx('flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top))] min-w-0 w-full animate-sheet flex-col rounded-t-3xl bg-white shadow-[var(--shadow-float)] outline-none sm:max-h-[calc(100dvh-2rem)] sm:animate-pop sm:rounded-2xl', width)}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="min-w-0 text-lg font-bold tracking-tight text-slate-900 [overflow-wrap:anywhere]">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100" aria-label={t('actions.close')}><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-5">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, error, children, required, htmlFor }) {
  const { t } = useI18n();
  return (
    <div className="min-w-0">
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label} {!required && <span className="font-normal text-slate-400">({t('common.optional')})</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1.5 animate-fade text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function Notice({ tone = 'info', children, icon: Icon, className }) {
  const tones = {
    info: 'border-ocean-200/80 bg-ocean-50/80 text-ocean-900',
    warning: 'border-amber-200 bg-amber-50/80 text-amber-900',
    danger: 'border-red-200 bg-red-50/80 text-red-900',
    success: 'border-seaweed-100 bg-seaweed-50 text-seaweed-700',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  return (
    <div className={cx('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm', tones[tone] || tones.info, className)}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, level, className }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-soft)]', riskStyle(level).bar)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Mutation error helper: shows backend validation details. */
export function FormError({ error }) {
  const { t, lang } = useI18n();
  if (!error) return null;
  return (
    <Notice tone="danger" icon={AlertTriangle} className="animate-pop">
      <p className="font-medium">{apiErrorMessage(error, t, lang)}</p>
      {Array.isArray(error.details) && error.details.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs">
          {error.details.map((d, i) => <li key={`${d?.path}-${d?.message}-${i}`}>{detailLine(d, t, lang)}</li>)}
        </ul>
      )}
    </Notice>
  );
}

/**
 * Password field with an eye button: hidden by default; the eye shows the password, the crossed eye hides it again.
 * Takes the same props as <input> (id, value, onChange, autoComplete, required, aria-invalid…).
 */
export function PasswordInput({ className, ...props }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <div className="relative">
      <input {...props} type={visible ? 'text' : 'password'} className={cx('input pr-11', className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-ocean-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500/40"
      >
        <Icon className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }) {
  return (
    <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
      <span className="relative inline-flex">
        <input id={id} type="checkbox" className="peer sr-only" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors duration-300 peer-checked:bg-ocean-600 peer-focus-visible:ring-4 peer-focus-visible:ring-ocean-500/25" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-[var(--ease-spring)] peer-checked:translate-x-5" />
      </span>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

/**
 * Responsive table: a normal table from the `sm` breakpoint up, and one card per row on phones
 * (first column — or the column marked `primary` — as the card title, the rest as label/value lines).
 * Columns may set `mobile: false` to leave a low-value column out of the phone card.
 */
export function Table({ columns, rows, rowKey = 'id', empty, onRowClick }) {
  const phone = usePhone();
  if (!rows?.length) return empty || <EmptyState />;
  const keyOf = (r) => (typeof rowKey === 'function' ? rowKey(r) : r[rowKey]);
  const cell = (c, r) => (c.render ? c.render(r) : r[c.key]);
  const primary = columns.find((c) => c.primary) || columns[0];
  const rest = columns.filter((c) => c !== primary && c.mobile !== false);
  if (phone) {
    return (
      <ul className="surface stagger divide-y divide-slate-100 overflow-hidden">
        {rows.map((r) => {
          const body = (
            <>
              <div className="table-card-value min-w-0 font-semibold text-slate-900 [overflow-wrap:anywhere]">{cell(primary, r)}</div>
              {rest.length > 0 && (
                <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-sm min-[480px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  {rest.map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="pt-2 text-xs text-slate-500 [overflow-wrap:anywhere] min-[480px]:pt-0 min-[480px]:text-sm">{c.header}</dt>
                      <dd className="table-card-value min-w-0 text-slate-800 [overflow-wrap:anywhere] min-[480px]:text-right">{cell(c, r)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );
          return (
            <li key={keyOf(r)}>
              {onRowClick
                ? <button type="button" onClick={() => onRowClick(r)} className="block w-full px-4 py-3.5 text-left transition-colors hover:bg-ocean-50/60 active:bg-ocean-50">{body}</button>
                : <div className="px-4 py-3.5">{body}</div>}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
      <div className="surface overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200/80 text-sm">
          <thead className="bg-sand-50/80">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx('px-3.5 py-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500', c.className)}>{c.header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={keyOf(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('transition-colors', onRowClick && 'cursor-pointer hover:bg-ocean-50/60')}>
                {columns.map((c) => <td key={c.key} className={cx('px-3.5 py-3 align-top text-slate-700', c.className)}>{cell(c, r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
  );
}

/** Collapsible section ("See more analysis"): keeps long pages short on phones. */
export function Disclosure({ title, subtitle, defaultOpen = false, children, id }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { setOpen(defaultOpen); }, [defaultOpen]);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3.5 text-left shadow-[var(--shadow-soft)] ring-1 ring-slate-200/80 transition hover:ring-ocean-200">
        <span className="min-w-0">
          <span className="block font-semibold text-ocean-800">{title}</span>
          {subtitle && <span className="block text-sm text-slate-500">{subtitle}</span>}
        </span>
        <ChevronDown className={cx('h-5 w-5 shrink-0 text-ocean-700 transition-transform duration-300', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div id={id} className="mt-4 animate-rise space-y-4">{children}</div>}
    </div>
  );
}
