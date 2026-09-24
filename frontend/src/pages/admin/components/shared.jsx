import { ChevronLeft, ChevronRight, CircleDot } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { Badge, Button, cx } from '../../../components/ui/index.jsx';

/** Accessible tab bar. `tabs` = [{ id, label, icon }]. */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div role="tablist" className={cx('mb-5 flex gap-1 overflow-x-auto border-b border-slate-200', className)}>
      {tabs.map(({ id, label, icon: Icon, count }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cx('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition',
            value === id ? 'border-ocean-700 text-ocean-800' : 'border-transparent text-slate-500 hover:text-slate-800')}
        >
          {Icon && <Icon className="h-4 w-4" aria-hidden />}
          {label}
          {count != null && <span className="rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  if (!total) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>{t('admin.common.showing', { from, to, total })}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('admin.common.prev')}</Button>
        <span className="tabular-nums">{page} / {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('admin.common.next')}<ChevronRight className="h-4 w-4" aria-hidden /></Button>
      </div>
    </div>
  );
}

export function JsonBlock({ value, className }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  return (
    <pre className={cx('max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100', className)}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Metric as computed by the backend; never invented. null → "—". */
export function Metric({ label, value, format = 'pct' }) {
  const shown = value == null || Number.isNaN(Number(value)) ? '—' : format === 'pct' ? `${(Number(value) * 100).toFixed(1)}%` : Number(value).toFixed(3);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{shown}</p>
    </div>
  );
}

/** 2×2 confusion matrix grid: rows = actual, columns = predicted. */
export function ConfusionMatrix({ cm }) {
  const { t } = useI18n();
  if (!cm) return <p className="text-sm text-slate-500">{t('admin.models.noMatrix')}</p>;
  const cell = (label, v, tone) => (
    <div className={cx('rounded-lg p-2.5 text-center', tone)}>
      <p className="text-xl font-bold tabular-nums">{v ?? '—'}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
    </div>
  );
  return (
    <div className="inline-grid grid-cols-[auto_1fr_1fr] items-center gap-1.5 text-xs">
      <span />
      <span className="text-center font-semibold text-slate-500">{t('admin.models.predYes')}</span>
      <span className="text-center font-semibold text-slate-500">{t('admin.models.predNo')}</span>
      <span className="pr-1 text-right font-semibold text-slate-500">{t('admin.models.actualYes')}</span>
      {cell(t('admin.models.tp'), cm.tp, 'bg-seaweed-50 text-seaweed-700')}
      {cell(t('admin.models.fn'), cm.fn, 'bg-red-50 text-red-800')}
      <span className="pr-1 text-right font-semibold text-slate-500">{t('admin.models.actualNo')}</span>
      {cell(t('admin.models.fp'), cm.fp, 'bg-amber-50 text-amber-800')}
      {cell(t('admin.models.tn'), cm.tn, 'bg-slate-100 text-slate-700')}
    </div>
  );
}

const isLiveName = (name) => !!name && !/^(simulated|template|demo)/i.test(String(name));

/** Provider rows from a `providers` object as returned by /health and /admin/settings. */
export function ProviderList({ providers }) {
  const { t } = useI18n();
  if (!providers) return null;
  const rows = [
    { k: 'weather', label: t('admin.system.weather'), name: providers.weather?.live || providers.weather?.demo, live: !!providers.weather?.live },
    { k: 'ocean', label: t('admin.system.ocean'), name: providers.ocean?.live || providers.ocean?.demo, live: !!providers.ocean?.live },
    { k: 'llm', label: t('admin.system.llm'), name: providers.llm, live: isLiveName(providers.llm) },
    { k: 'sms', label: 'SMS', name: providers.sms, live: isLiveName(providers.sms) },
    { k: 'ussd', label: 'USSD', name: providers.ussd, live: isLiveName(providers.ussd) },
  ];
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.k} className="py-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-600">{r.label}</span>
            <Badge className={r.live ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-violet-50 text-violet-800 ring-violet-300'}>
              <CircleDot className="h-3 w-3" aria-hidden />{r.live ? t('admin.system.live') : t('admin.system.demo')}
            </Badge>
          </div>
          <p className="mt-0.5 break-all font-mono text-xs text-slate-800">{r.name || '—'}</p>
        </li>
      ))}
    </ul>
  );
}

export function YesNo({ value }) {
  const { t } = useI18n();
  return (
    <Badge className={value ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-slate-100 text-slate-600 ring-slate-200'}>
      {value ? t('actions.yes') : t('actions.no')}
    </Badge>
  );
}
