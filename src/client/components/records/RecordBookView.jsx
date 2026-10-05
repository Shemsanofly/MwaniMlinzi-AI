import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotebookPen, Plus, Trash2 } from 'lucide-react';
import { recordsApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Modal, Spinner, cx } from '../ui/index.jsx';
import { date, isoDate, kg } from '../../utils/format.js';

export const tsh = (n) => `TSh ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const KINDS = ['sales', 'costs', 'work'];
const COST_CATEGORIES = ['SEEDLINGS', 'ROPE_LINES', 'STAKES', 'TYING_MATERIAL', 'LABOUR', 'TRANSPORT', 'DRYING_MATERIALS', 'OTHER'];
const ACTIVITIES = ['PLANTING', 'TYING_SEEDLINGS', 'CLEANING_LINES', 'REPAIRING_LINES', 'HARVESTING', 'DRYING', 'OTHER'];

/**
 * The farmer's record book for one planting cycle: profit summary + sales, costs and work, with add/delete.
 * `readOnly` (admin view) hides the add and delete controls. Every number comes from the farmer's own entries.
 */
export default function RecordBookView({ farmId, readOnly = false }) {
  const { t, lang } = useI18n();
  // The picked planting belongs to one farm: switching farms falls back to that farm's default.
  const [pick, setPick] = useState({ farmId, cycleId: undefined });
  const cycleId = pick.farmId === farmId ? pick.cycleId : undefined;
  const setCycleId = (id) => setPick({ farmId, cycleId: id });
  const [tab, setTab] = useState('sales');
  const [adding, setAdding] = useState(null);
  const summaryQ = useQuery({ queryKey: ['records', 'summary', farmId, cycleId], queryFn: () => recordsApi.summary(farmId, { cycleId }), enabled: !!farmId });
  const selected = cycleId ?? summaryQ.data?.cycle?.id ?? null;
  const listQuery = (kind) => ({ queryKey: ['records', kind, farmId, selected], queryFn: () => recordsApi.list(kind, farmId, { cycleId: selected || undefined }), enabled: !!farmId && summaryQ.isSuccess });
  const lists = { sales: useQuery(listQuery('sales')), costs: useQuery(listQuery('costs')), work: useQuery(listQuery('work')) };

  if (summaryQ.isLoading) return <div className="flex justify-center p-6"><Spinner /></div>;
  if (summaryQ.error) return <ErrorState error={summaryQ.error} onRetry={summaryQ.refetch} />;
  const { summary: s, cycles = [] } = summaryQ.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('records.fromRecords')}</p>
        {cycles.length > 1 && (
          <label className="flex min-w-0 w-full flex-col gap-2 text-sm sm:w-auto sm:flex-row">
            <span className="text-slate-600">{t('records.cycle')}</span>
            <select className="input min-w-0 py-1.5 sm:w-auto" value={selected || ''} onChange={(e) => setCycleId(e.target.value || undefined)}>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>{t('records.cycleLabel', { date: date(c.plantingDate, lang) })}{c.status === 'ACTIVE' ? ` (${t('records.current')})` : ''}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div data-testid="record-summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('records.income')} value={tsh(s.incomeTzs)} />
        <Stat label={t('records.costs')} value={tsh(s.costsTzs)} />
        <Stat label={s.profitTzs < 0 ? t('records.loss') : t('records.profit')} value={tsh(Math.abs(s.profitTzs))} tone={s.profitTzs < 0 ? 'bad' : 'good'} />
        {s.owedTzs > 0 ? <Stat label={t('records.owed')} value={tsh(s.owedTzs)} tone="warn" /> : <Stat label={t('records.avgPrice')} value={s.averagePricePerKg != null ? `${tsh(s.averagePricePerKg)}/kg` : '—'} />}
        <Stat label={t('records.harvested')} value={kg(s.harvestedKg)} small />
        <Stat label={t('records.sold')} value={kg(s.soldKg)} small />
        <Stat label={t('records.unsold')} value={kg(s.unsoldKg)} small />
        <Stat label={t('records.perLine')} value={s.profitPerLine != null ? tsh(s.profitPerLine) : '—'} small />
      </div>

      {Object.keys(s.costsByCategory).length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold text-slate-800">{t('records.costsByCategory')}</p>
          <ul className="space-y-1.5">
            {Object.entries(s.costsByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amount]) => (
              <li key={cat} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
                <span className="min-w-0 text-slate-600 [overflow-wrap:anywhere]">{t(`records.category.${cat}`)}</span>
                <span className="min-w-0 text-right tabular-nums text-slate-800 [overflow-wrap:anywhere]">{tsh(amount)}</span>
                <span className="col-span-2 h-2 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-ocean-600" style={{ width: `${Math.round((amount / s.costsTzs) * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div>
        <div role="tablist" className="grid grid-cols-3 gap-1 border-b border-slate-200">
          {KINDS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cx('-mb-px min-h-11 min-w-0 border-b-2 px-2 py-2 text-sm font-semibold [overflow-wrap:anywhere]', tab === k ? 'border-ocean-700 text-ocean-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              {t(`records.tabs.${k}`)} ({s.counts[k] ?? 0})
            </button>
          ))}
        </div>
        <div className="pt-3">
          {!readOnly && (
            <div className="mb-3 flex justify-end">
              <Button size="sm" icon={Plus} onClick={() => setAdding(tab)}>{t(`records.add.${tab}`)}</Button>
            </div>
          )}
          <RecordList kind={tab} q={lists[tab]} farmId={farmId} readOnly={readOnly} />
        </div>
      </div>

      {adding && <AddRecordModal kind={adding} farmId={farmId} cycleId={selected} onClose={() => setAdding(null)} />}
    </div>
  );
}

function Stat({ label, value, tone, small }) {
  const color = { good: 'text-seaweed-700', bad: 'text-red-700', warn: 'text-amber-700' }[tone] || 'text-slate-900';
  return (
    <div className={cx('min-w-0 rounded-xl bg-white p-3 ring-1 ring-slate-200 [overflow-wrap:anywhere]', small && 'bg-slate-50')}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={cx('font-bold tabular-nums', small ? 'text-base' : 'text-lg', color)}>{value}</p>
    </div>
  );
}

function RecordList({ kind, q, farmId, readOnly }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(null);
  const del = useMutation({
    mutationFn: (id) => recordsApi.remove(kind, farmId, id),
    onSuccess: () => { setConfirming(null); qc.invalidateQueries({ queryKey: ['records'] }); },
  });
  if (q.isLoading) return <div className="flex justify-center p-4"><Spinner /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} compact />;
  const rows = q.data?.[kind] || [];
  if (!rows.length) return <EmptyState icon={NotebookPen} title={t(`records.empty.${kind}`)} message={t('records.emptyHint')} />;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
          <span className="w-24 shrink-0 text-slate-500">{date(r.saleDate || r.costDate || r.workDate, lang)}</span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {kind === 'sales' && (
              <>
                <span className="font-semibold text-slate-900">{tsh(r.totalTzs)}</span>
                <span className="text-slate-500"> · {kg(r.quantityKg)} × {tsh(r.pricePerKg)}</span>
                {r.buyerName && <span className="block text-slate-700">{r.buyerName}</span>}
              </>
            )}
            {kind === 'costs' && (
              <>
                <span className="font-semibold text-slate-900">{tsh(r.amountTzs)}</span>
                <span className="text-slate-500"> · {t(`records.category.${r.category}`)}</span>
              </>
            )}
            {kind === 'work' && <span className="font-medium text-slate-900">{t(`records.activity.${r.activity}`)}</span>}
            {r.notes && <span className="block text-xs text-slate-500">{r.notes}</span>}
          </span>
          {kind === 'sales' && (
            <Badge className={r.paymentStatus === 'PENDING' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30'}>
              {r.paymentStatus === 'PENDING' ? t('records.pending') : t('records.paid')}
            </Badge>
          )}
          {r.channel === 'USSD' && <span className="text-xs text-slate-400">{t('records.viaUssd')}</span>}
          {!readOnly && (confirming === r.id ? (
            <span className="flex gap-1">
              <Button size="sm" variant="danger" loading={del.isPending} onClick={() => del.mutate(r.id)}>{t('records.confirmDelete')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>{t('records.cancel')}</Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirming(r.id)}>{t('records.delete')}</Button>
          ))}
        </li>
      ))}
      {del.error && <li className="px-3 py-2"><FormError error={del.error} /></li>}
    </ul>
  );
}

const positive = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
const shillings = (v, t) => (!positive(v) ? t('records.positive') : !Number.isInteger(Number(v)) ? t('records.wholeShillings') : null);

function AddRecordModal({ kind, farmId, cycleId, onClose }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [f, setF] = useState({ date: isoDate(), quantityKg: '', pricePerKg: '', buyerName: '', paymentStatus: 'PAID', category: 'SEEDLINGS', amountTzs: '', activity: 'PLANTING', notes: '' });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: (body) => recordsApi.create(kind, farmId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['records'] }); onClose(); },
  });

  const submit = (e) => {
    e.preventDefault();
    const errs = {};
    const common = { notes: f.notes.trim() || null, cycleId: cycleId || null };
    let body;
    if (kind === 'sales') {
      if (!positive(f.quantityKg)) errs.quantityKg = t('records.positive');
      if (shillings(f.pricePerKg, t)) errs.pricePerKg = shillings(f.pricePerKg, t);
      body = { saleDate: f.date, quantityKg: Number(f.quantityKg), pricePerKg: Number(f.pricePerKg), buyerName: f.buyerName.trim() || null, paymentStatus: f.paymentStatus, ...common };
    } else if (kind === 'costs') {
      if (shillings(f.amountTzs, t)) errs.amountTzs = shillings(f.amountTzs, t);
      body = { costDate: f.date, category: f.category, amountTzs: Number(f.amountTzs), ...common };
    } else {
      body = { workDate: f.date, activity: f.activity, ...common };
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate(body);
  };

  const total = positive(f.quantityKg) && positive(f.pricePerKg) ? Number(f.quantityKg) * Number(f.pricePerKg) : null;
  return (
    <Modal open onClose={onClose} title={t(`records.add.${kind}`)}>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <Field label={t('records.f.date')} htmlFor="rb-date" required>
          <input id="rb-date" type="date" className="input" value={f.date} max={isoDate()} onChange={set('date')} required />
        </Field>
        {kind === 'sales' && (
          <>
            <Field label={t('records.f.kg')} htmlFor="rb-kg" required error={errors.quantityKg}>
              <input id="rb-kg" type="number" inputMode="decimal" min={0} step="0.1" className="input" value={f.quantityKg} onChange={set('quantityKg')} />
            </Field>
            <Field label={t('records.f.price')} htmlFor="rb-price" required error={errors.pricePerKg}>
              <input id="rb-price" type="number" inputMode="numeric" min={0} step="1" className="input" value={f.pricePerKg} onChange={set('pricePerKg')} />
            </Field>
            {total != null && <p className="text-sm font-semibold text-slate-800">{t('records.f.total', { total: tsh(total) })}</p>}
            <Field label={t('records.f.buyer')} htmlFor="rb-buyer">
              <input id="rb-buyer" className="input" maxLength={120} value={f.buyerName} onChange={set('buyerName')} />
            </Field>
            <Field label={t('records.f.payment')} htmlFor="rb-pay" required>
              <select id="rb-pay" className="input" value={f.paymentStatus} onChange={set('paymentStatus')}>
                <option value="PAID">{t('records.paid')}</option>
                <option value="PENDING">{t('records.pending')}</option>
              </select>
            </Field>
          </>
        )}
        {kind === 'costs' && (
          <>
            <Field label={t('records.f.category')} htmlFor="rb-cat" required>
              <select id="rb-cat" className="input" value={f.category} onChange={set('category')}>
                {COST_CATEGORIES.map((c) => <option key={c} value={c}>{t(`records.category.${c}`)}</option>)}
              </select>
            </Field>
            <Field label={t('records.f.amount')} htmlFor="rb-amount" required error={errors.amountTzs}>
              <input id="rb-amount" type="number" inputMode="numeric" min={0} step="1" className="input" value={f.amountTzs} onChange={set('amountTzs')} />
            </Field>
          </>
        )}
        {kind === 'work' && (
          <Field label={t('records.f.activity')} htmlFor="rb-act" required>
            <select id="rb-act" className="input" value={f.activity} onChange={set('activity')}>
              {ACTIVITIES.map((a) => <option key={a} value={a}>{t(`records.activity.${a}`)}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('records.f.notes')} htmlFor="rb-notes">
          <input id="rb-notes" className="input" maxLength={500} value={f.notes} onChange={set('notes')} />
        </Field>
        <FormError error={m.error} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>{t('records.cancel')}</Button>
          <Button type="submit" loading={m.isPending}>{t('records.save')}</Button>
        </div>
      </form>
    </Modal>
  );
}
