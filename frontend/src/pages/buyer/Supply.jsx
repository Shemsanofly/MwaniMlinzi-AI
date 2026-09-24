import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, PackagePlus, Send } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../stores/AuthContext.jsx';
import { buyerApi, metaApi } from '../../api/endpoints.js';
import { Badge, Button, Card, CardHeader, DemoBadge, EmptyState, ErrorState, Field, FormError, Notice, PageHeader, PageLoader, cx } from '../../components/ui/index.jsx';
import { date, isoDate, num, pct } from '../../utils/format.js';
import { tonnesText } from '../extension/components/Portfolio.jsx';
import { DemoSupplyNote, PrivacyNote, UncertaintyNote } from './components/BuyerParts.jsx';
import SupplyFilters, { EMPTY_FILTERS } from './components/SupplyFilters.jsx';

const SORTERS = {
  date: (s) => new Date(s.expectedHarvestDate).getTime(),
  cooperative: (s) => s.cooperative?.name || '',
  district: (s) => s.district || '',
  species: (s) => s.species || '',
  ra: (s) => s.riskAdjustedQuantityKg,
  confidence: (s) => s.confidence,
  grade: (s) => s.expectedGrade || '',
};

function SortHeader({ id, sort, setSort, children, className }) {
  const active = sort.key === id;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={cx('px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500', className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => setSort({ key: id, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}>
        {children}<Icon className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );
}

function SupplyTable({ supply }) {
  const { t, lang } = useI18n();
  const [sort, setSort] = useState({ key: 'date', dir: 'asc' });
  const rows = useMemo(() => {
    const f = SORTERS[sort.key];
    return [...supply].sort((a, b) => {
      const va = f(a); const vb = f(b);
      const c = typeof va === 'string' ? va.localeCompare(vb) : va - vb;
      return sort.dir === 'asc' ? c : -c;
    });
  }, [supply, sort]);
  if (!supply.length) return <EmptyState title={t('buyer.noSupply')} message={t('buyer.forecast.tryWider')} />;
  const total = (k) => supply.reduce((a, s) => a + (s[k] || 0), 0);
  const avgConf = supply.reduce((a, s) => a + (s.confidence || 0), 0) / supply.length;
  const sp = { sort, setSort };
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{t('buyer.supply.tableCaption')}</caption>
        <thead className="bg-slate-50">
          <tr>
            <SortHeader id="date" {...sp}>{t('buyer.supply.expectedDate')}</SortHeader>
            <SortHeader id="cooperative" {...sp}>{t('common.cooperative')}</SortHeader>
            <SortHeader id="district" {...sp}>{t('common.district')}</SortHeader>
            <SortHeader id="species" {...sp}>{t('buyer.supply.species')}</SortHeader>
            <SortHeader id="ra" {...sp} className="text-right">{t('buyer.supply.riskAdjusted')}</SortHeader>
            <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.range')}</th>
            <SortHeader id="confidence" {...sp} className="text-right">{t('risk.confidence')}</SortHeader>
            <SortHeader id="grade" {...sp}>{t('buyer.supply.grade')}</SortHeader>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="whitespace-nowrap px-3 py-2.5">{date(s.expectedHarvestDate, lang)}</td>
              <td className="px-3 py-2.5">{s.cooperative?.name || t('extension.shared.independent')}{s.isDemo && <span className="ml-1 align-middle"><DemoBadge /></span>}</td>
              <td className="px-3 py-2.5">{s.district}</td>
              <td className="px-3 py-2.5">{s.species || '—'}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">{num(s.riskAdjustedQuantityKg, 0)} kg</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-600">{num(s.lowQuantityKg, 0)}–{num(s.highQuantityKg, 0)} kg</td>
              <td className="px-3 py-2.5 text-right">{pct(s.confidence)}</td>
              <td className="px-3 py-2.5">{s.expectedGrade ? <Badge>{s.expectedGrade}</Badge> : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-ocean-50/60 font-semibold text-slate-900">
          <tr>
            <td className="px-3 py-2.5" colSpan={4}>{t('buyer.supply.totals', { n: supply.length })}</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right" data-testid="supply-total">{tonnesText(total('riskAdjustedQuantityKg'))} t</td>
            <td className="whitespace-nowrap px-3 py-2.5 text-right">{tonnesText(total('lowQuantityKg'))}–{tonnesText(total('highQuantityKg'))} t</td>
            <td className="px-3 py-2.5 text-right">{pct(avgConf)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const EMPTY_DEMAND = { speciesId: '', quantityKg: '', pricePerKg: '', neededBy: '', minimumGrade: '', notes: '' };

function PostDemandForm() {
  const { t, tx } = useI18n();
  const qc = useQueryClient();
  const species = useQuery({ queryKey: ['species'], queryFn: metaApi.species, staleTime: 60 * 60 * 1000 });
  const [form, setForm] = useState(EMPTY_DEMAND);
  const [errors, setErrors] = useState({});
  const [done, setDone] = useState(null);
  const m = useMutation({
    mutationFn: (body) => buyerApi.createDemand(body),
    onSuccess: () => {
      setDone(t('buyer.demand.posted'));
      setForm(EMPTY_DEMAND);
      qc.invalidateQueries({ queryKey: ['buyerForecast'] });
    },
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    setDone(null);
    const errs = {};
    if (!(Number(form.quantityKg) >= 1)) errs.quantityKg = t('buyer.demand.errQuantity');
    if (!form.neededBy) errs.neededBy = t('buyer.demand.errDate');
    if (form.pricePerKg !== '' && !(Number(form.pricePerKg) >= 0)) errs.pricePerKg = t('buyer.demand.errPrice');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    m.mutate({
      speciesId: form.speciesId || null,
      quantityKg: Number(form.quantityKg),
      pricePerKg: form.pricePerKg === '' ? null : Number(form.pricePerKg),
      neededBy: form.neededBy,
      minimumGrade: form.minimumGrade || null,
      notes: form.notes.trim() || null,
    });
  };
  return (
    <form onSubmit={submit} noValidate className="space-y-3 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('buyer.supply.species')} htmlFor="dm-species">
          <select id="dm-species" className="input" value={form.speciesId} onChange={set('speciesId')}>
            <option value="">{t('buyer.demand.anySpecies')}</option>
            {(species.data?.species || []).map((s) => <option key={s.id} value={s.id}>{tx(s, 'commonName')}</option>)}
          </select>
        </Field>
        <Field label={t('buyer.demand.quantityKg')} htmlFor="dm-qty" required error={errors.quantityKg}>
          <input id="dm-qty" type="number" min="1" step="1" inputMode="numeric" className="input" value={form.quantityKg} onChange={set('quantityKg')} />
        </Field>
        <Field label={t('buyer.demand.neededBy')} htmlFor="dm-date" required error={errors.neededBy}>
          <input id="dm-date" type="date" className="input" min={isoDate()} value={form.neededBy} onChange={set('neededBy')} />
        </Field>
        <Field label={t('buyer.demand.pricePerKg')} htmlFor="dm-price" error={errors.pricePerKg}>
          <input id="dm-price" type="number" min="0" step="10" inputMode="numeric" className="input" value={form.pricePerKg} onChange={set('pricePerKg')} />
        </Field>
        <Field label={t('buyer.demand.minimumGrade')} htmlFor="dm-grade">
          <select id="dm-grade" className="input" value={form.minimumGrade} onChange={set('minimumGrade')}>
            <option value="">{t('buyer.demand.anyGrade')}</option>
            {['A', 'B', 'C'].map((g) => <option key={g} value={g}>{t('buyer.grade', { g })}</option>)}
          </select>
        </Field>
        <Field label={t('common.notes')} htmlFor="dm-notes">
          <input id="dm-notes" type="text" maxLength={2000} className="input" value={form.notes} onChange={set('notes')} />
        </Field>
      </div>
      <FormError error={m.error} />
      {done && <Notice tone="success">{done}</Notice>}
      <Button type="submit" icon={Send} loading={m.isPending}>{t('buyer.postDemand')}</Button>
    </form>
  );
}

export default function BuyerSupply() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const q = useQuery({ queryKey: ['buyerForecast', filters], queryFn: () => buyerApi.forecast(filters), placeholderData: (p) => p });
  const options = useQuery({ queryKey: ['buyerForecast', {}], queryFn: () => buyerApi.forecast({}) });

  return (
    <div className="space-y-5">
      <PageHeader title={t('buyer.supply.title')} subtitle={t('buyer.supply.subtitle')} />
      <PrivacyNote />
      <SupplyFilters value={filters} onApply={setFilters} options={options.data?.filters || q.data?.filters} />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className={q.isFetching ? 'space-y-4 opacity-70' : 'space-y-4'} aria-busy={q.isFetching}>
          <DemoSupplyNote supply={q.data.supply} />
          <SupplyTable supply={q.data.supply} />
          <UncertaintyNote note={q.data.summary.uncertaintyNote} />
        </div>
      )}
      <Card id="post-demand">
        <CardHeader title={t('buyer.postDemand')} subtitle={t('buyer.demand.formSub')} icon={PackagePlus} />
        {user?.buyerId ? <PostDemandForm /> : <div className="p-4 sm:p-5"><Notice tone="info">{t('buyer.demand.onlyBuyers')}</Notice></div>}
      </Card>
    </div>
  );
}
