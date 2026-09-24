import { useEffect } from 'react';
import { AlertTriangle, Database, FlaskConical, Inbox, Loader2, RefreshCw, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { riskStyle } from '../../utils/risk.js';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

const BUTTON = {
  primary: 'bg-ocean-700 text-white hover:bg-ocean-800 focus-visible:ring-ocean-300 disabled:bg-ocean-700/50',
  secondary: 'bg-white text-ocean-800 ring-1 ring-inset ring-ocean-200 hover:bg-ocean-50 focus-visible:ring-ocean-300',
  ghost: 'text-ocean-800 hover:bg-ocean-50',
  danger: 'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-300',
  success: 'bg-seaweed-600 text-white hover:bg-seaweed-700 focus-visible:ring-seaweed-100',
};
const SIZE = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3.5 text-base' };

export function Button({ variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60', BUTTON[variant], SIZE[size], className)}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return <div className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, icon: Icon, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ocean-600" aria-hidden />}
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function Badge({ className, children, title }) {
  return <span title={title} className={cx('inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-left text-xs font-semibold ring-1 ring-inset', className || 'bg-slate-100 text-slate-700 ring-slate-200')}>{children}</span>;
}

export function RiskBadge({ level, long = false, size = 'sm' }) {
  const { t } = useI18n();
  if (!level) return <Badge>—</Badge>;
  return <Badge className={cx(riskStyle(level).badge, size === 'lg' && 'px-3 py-1 text-sm')}>{t(long ? `risk.levelLong.${level}` : `risk.level.${level}`)}</Badge>;
}

/** Honest data-provenance label: LIVE / CACHED / DEMO / SIMULATION. */
export function SourceBadge({ source }) {
  const { t } = useI18n();
  if (!source) return null;
  const style = {
    LIVE: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
    CACHED: 'bg-sky-50 text-sky-800 ring-sky-300',
    DEMO: 'bg-violet-50 text-violet-800 ring-violet-300',
    SIMULATION: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-300',
  }[source];
  const Icon = source === 'SIMULATION' ? FlaskConical : Database;
  return <Badge className={style}><Icon className="h-3 w-3" aria-hidden />{t(`source.${source}`)}</Badge>;
}

export function DemoBadge({ label }) {
  const { t } = useI18n();
  return <Badge className="bg-violet-50 text-violet-800 ring-violet-300">{label || t('source.demoBadge')}</Badge>;
}

export function Spinner({ className }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-ocean-600', className)} aria-label="Loading" />;
}

export function PageLoader({ label }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-500" role="status">
      <Spinner className="h-8 w-8" />
      <span className="text-sm">{label || t('actions.loading')}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }) {
  const { t } = useI18n();
  const message = error?.status === 0 ? t('errors.network') : error?.status === 403 ? t('errors.forbidden') : error?.status === 404 ? t('errors.notFound') : error?.message || t('errors.generic');
  return (
    <div role="alert" className={cx('flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 text-center text-red-800', compact ? 'p-4' : 'p-8')}>
      <AlertTriangle className="h-6 w-6" aria-hidden />
      <p className="text-sm font-medium">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>{t('actions.retry')}</Button>}
    </div>
  );
}

export function EmptyState({ title, message, action, icon: Icon = Inbox }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <Icon className="h-8 w-8 text-slate-400" aria-hidden />
      <p className="font-medium text-slate-700">{title || t('common.noData')}</p>
      {message && <p className="max-w-md text-sm text-slate-500">{message}</p>}
      {action}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = 'ocean', onClick }) {
  const tones = {
    ocean: 'bg-ocean-50 text-ocean-700', red: 'bg-red-50 text-red-700', orange: 'bg-orange-50 text-orange-700',
    green: 'bg-seaweed-50 text-seaweed-700', amber: 'bg-amber-50 text-amber-700', slate: 'bg-slate-100 text-slate-600',
  };
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={cx('flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm', onClick && 'transition hover:border-ocean-300')}>
      {Icon && <span className={cx('rounded-lg p-2', tones[tone])}><Icon className="h-5 w-5" aria-hidden /></span>}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </Comp>
  );
}

export function PageHeader({ title, subtitle, actions, badge }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', width)}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, required, htmlFor }) {
  const { t } = useI18n();
  return (
    <div>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label} {!required && <span className="font-normal text-slate-400">({t('common.optional')})</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function Notice({ tone = 'info', children, icon: Icon, className }) {
  const tones = {
    info: 'border-ocean-200 bg-ocean-50 text-ocean-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    danger: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-seaweed-100 bg-seaweed-50 text-seaweed-700',
    demo: 'border-violet-200 bg-violet-50 text-violet-900',
  };
  return (
    <div className={cx('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm', tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, level, className }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', riskStyle(level).bar)} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/** Mutation error helper: shows backend validation details. */
export function FormError({ error }) {
  if (!error) return null;
  return (
    <Notice tone="danger" icon={AlertTriangle}>
      <p className="font-medium">{error.message}</p>
      {Array.isArray(error.details) && (
        <ul className="mt-1 list-disc pl-4 text-xs">
          {error.details.map((d) => <li key={`${d.path}-${d.message}`}>{d.path ? `${d.path}: ` : ''}{d.message}</li>)}
        </ul>
      )}
    </Notice>
  );
}

export function Toggle({ checked, onChange, label, id }) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2">
      <span className="relative inline-flex">
        <input id={id} type="checkbox" className="peer sr-only" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-ocean-600 peer-focus-visible:ring-2 peer-focus-visible:ring-ocean-300" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
}

/** Simple responsive table wrapper. */
export function Table({ columns, rows, rowKey = 'id', empty, onRowClick }) {
  if (!rows?.length) return empty || <EmptyState />;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx('px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={typeof rowKey === 'function' ? rowKey(r) : r[rowKey]} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx(onRowClick && 'cursor-pointer hover:bg-ocean-50/50')}>
              {columns.map((c) => <td key={c.key} className={cx('px-3 py-2.5 align-top text-slate-700', c.className)}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
