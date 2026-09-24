import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertOctagon, CheckCircle2, LineChart, Truck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { buyerApi, farmApi } from '../../api/endpoints.js';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, FormError, Notice, PageHeader, Spinner, Toggle, apiErrorMessage, cx } from '../../components/ui/index.jsx';
import { date as fmtDate, isoDate, kg, num, pct, tzs } from '../../utils/format.js';
import { FarmGate, FarmSwitcher, SectionTitle, numOrNull, useInvalidateFarm } from './components/shared.jsx';

const GRADES = ['A', 'B', 'C', 'REJECT'];
const DRYING = ['RACK', 'TARPAULIN', 'ROPE_HANGING', 'GROUND'];
const CAUSES = ['ICE_ICE', 'STORM', 'EPIPHYTES', 'GRAZING', 'THEFT', 'POOR_GROWTH', 'OTHER'];

export default function HarvestPage() {
  const { t } = useI18n();
  const ff = useFarmerFarm();
  return (
    <div>
      <PageHeader title={t('farmer.harvest.title')} subtitle={t('farmer.harvest.subtitle')} />
      {ff.farm ? <HarvestBody ff={ff} /> : <FarmGate ff={ff} />}
    </div>
  );
}

function HarvestBody({ ff }) {
  const { t } = useI18n();
  const { farmId } = ff;
  const [tab, setTab] = useState('harvest');
  const farmQ = useQuery({ queryKey: ['farm', farmId], queryFn: () => farmApi.get(farmId) });
  return (
    <div>
      <FarmSwitcher ff={ff} />
      <ForecastCard q={farmQ} />
      <div className="my-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {[{ id: 'harvest', label: t('farmer.harvest.tabHarvest') }, { id: 'loss', label: t('farmer.harvest.tabLoss') }].map((tb) => (
          <button key={tb.id} type="button" role="tab" aria-selected={tab === tb.id} onClick={() => setTab(tb.id)}
            className={cx('min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition', tab === tb.id ? 'bg-white text-ocean-800 shadow-sm' : 'text-slate-600')}>{tb.label}</button>
        ))}
      </div>
      {tab === 'harvest' ? <HarvestForm key={farmId} farmId={farmId} hasCycle={!!ff.farm.currentCycle} /> : <LossForm key={farmId} farmId={farmId} />}
      <SectionTitle>{t('farmer.harvest.pastHarvests')}</SectionTitle>
      <HarvestList farmId={farmId} />
      <SectionTitle>{t('farmer.harvest.pastLosses')}</SectionTitle>
      <LossList farmId={farmId} />
    </div>
  );
}

function ForecastCard({ q }) {
  const { t, lang } = useI18n();
  if (q.isLoading) return <Card className="flex justify-center p-4"><Spinner /></Card>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} compact />;
  const fc = q.data?.farm?.forecast;
  return (
    <Card>
      <CardHeader icon={LineChart} title={t('farmer.harvest.forecastTitle')} subtitle={t('farmer.harvest.forecastSub')} action={<Badge className="bg-amber-50 text-amber-800 ring-amber-300">{t('farmer.harvest.estimate')}</Badge>} />
      {fc ? (
        <div className="grid grid-cols-2 gap-3 p-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">{t('common.expectedHarvest')}</p>
            <p className="text-lg font-bold text-slate-900">{fmtDate(fc.expectedHarvestDate, lang)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500">{t('farmer.harvest.expectedKg')}</p>
            <p className="text-lg font-bold text-slate-900">{kg(fc.riskAdjustedQuantityKg)}</p>
            <p className="text-xs text-slate-600">{t('farmer.harvest.range', { low: num(fc.lowQuantityKg, 0), high: num(fc.highQuantityKg, 0) })}</p>
          </div>
          <p className="col-span-2 text-xs text-slate-500">{t('risk.confidence')}: <strong>{pct(fc.confidence)}</strong> · {t('farmer.harvest.forecastNote')}</p>
        </div>
      ) : <p className="p-4 text-sm text-slate-500">{t('farmer.harvest.noForecast')}</p>}
    </Card>
  );
}

const HARVEST_EMPTY = {
  harvestDate: isoDate(), estimatedQuantity: '', actualQuantity: '', unit: 'KG_DRY', qualityGrade: '', buyerId: '',
  dryingMethod: '', dryingDurationDays: '', pricePerKg: '', moisturePercent: '', groundContact: false, rainDuringDrying: false, notes: '', closeCycle: true,
};

function HarvestForm({ farmId, hasCycle }) {
  const { t, lang } = useI18n();
  const invalidate = useInvalidateFarm();
  const [f, setF] = useState(HARVEST_EMPTY);
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const buyersQ = useQuery({ queryKey: ['buyers'], queryFn: () => buyerApi.list() });
  const save = useMutation({
    mutationFn: () => farmApi.addHarvest(farmId, {
      harvestDate: f.harvestDate,
      estimatedQuantity: numOrNull(f.estimatedQuantity),
      actualQuantity: Number(f.actualQuantity),
      unit: f.unit,
      qualityGrade: f.qualityGrade || null,
      buyerId: f.buyerId || null,
      dryingMethod: f.dryingMethod || null,
      dryingDurationDays: numOrNull(f.dryingDurationDays),
      pricePerKg: numOrNull(f.pricePerKg),
      moisturePercent: numOrNull(f.moisturePercent),
      ...(f.dryingMethod ? { groundContact: f.groundContact, rainDuringDrying: f.rainDuringDrying } : {}),
      notes: f.notes.trim() || null,
      closeCycle: f.closeCycle,
    }),
    onSuccess: () => { invalidate(farmId); setF(HARVEST_EMPTY); },
  });
  const h = save.data?.harvest;

  return (
    <Card className="p-4">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('farmer.harvest.f.date')} htmlFor="h-date" required>
            <input id="h-date" type="date" className="input" required max={isoDate()} value={f.harvestDate} onChange={(e) => set({ harvestDate: e.target.value })} />
          </Field>
          <Field label={t('farmer.harvest.f.unit')} htmlFor="h-unit" required>
            <select id="h-unit" className="input" value={f.unit} onChange={(e) => set({ unit: e.target.value })}>
              {['KG_DRY', 'KG_WET'].map((u) => <option key={u} value={u}>{t(`farmer.enums.unit.${u}`)}</option>)}
            </select>
          </Field>
          <Field label={t('farmer.harvest.f.actual')} htmlFor="h-actual" required>
            <input id="h-actual" type="number" inputMode="decimal" min={0} step="0.1" className="input" required value={f.actualQuantity} onChange={(e) => set({ actualQuantity: e.target.value })} />
          </Field>
          <Field label={t('farmer.harvest.f.estimated')} htmlFor="h-est" hint={t('farmer.harvest.f.estimatedHint')}>
            <input id="h-est" type="number" inputMode="decimal" min={0} step="0.1" className="input" value={f.estimatedQuantity} onChange={(e) => set({ estimatedQuantity: e.target.value })} />
          </Field>
          <Field label={t('farmer.harvest.f.grade')} htmlFor="h-grade">
            <select id="h-grade" className="input" value={f.qualityGrade} onChange={(e) => set({ qualityGrade: e.target.value })}>
              <option value="">—</option>
              {GRADES.map((g) => <option key={g} value={g}>{t(`farmer.enums.grade.${g}`)}</option>)}
            </select>
          </Field>
          <Field label={t('farmer.harvest.f.buyer')} htmlFor="h-buyer" error={buyersQ.error ? apiErrorMessage(buyersQ.error, t, lang) : undefined}>
            <select id="h-buyer" className="input" value={f.buyerId} onChange={(e) => set({ buyerId: e.target.value })} disabled={buyersQ.isLoading}>
              <option value="">{buyersQ.isLoading ? t('actions.loading') : '—'}</option>
              {(buyersQ.data?.buyers || []).map((b) => <option key={b.id} value={b.id}>{b.companyName}{b.district ? ` (${b.district})` : ''}</option>)}
            </select>
          </Field>
          <Field label={t('farmer.harvest.f.price')} htmlFor="h-price">
            <input id="h-price" type="number" inputMode="decimal" min={0} className="input" value={f.pricePerKg} onChange={(e) => set({ pricePerKg: e.target.value })} />
          </Field>
          <Field label={t('farmer.harvest.f.moisture')} htmlFor="h-moist">
            <input id="h-moist" type="number" inputMode="decimal" min={0} max={100} className="input" value={f.moisturePercent} onChange={(e) => set({ moisturePercent: e.target.value })} />
          </Field>
          <Field label={t('farmer.harvest.f.drying')} htmlFor="h-dry">
            <select id="h-dry" className="input" value={f.dryingMethod} onChange={(e) => set({ dryingMethod: e.target.value, groundContact: e.target.value === 'GROUND' })}>
              <option value="">—</option>
              {DRYING.map((d) => <option key={d} value={d}>{t(`farmer.enums.drying.${d}`)}</option>)}
            </select>
          </Field>
          <Field label={t('farmer.harvest.f.dryDays')} htmlFor="h-drydays">
            <input id="h-drydays" type="number" inputMode="numeric" min={0} max={60} className="input" value={f.dryingDurationDays} onChange={(e) => set({ dryingDurationDays: e.target.value })} />
          </Field>
        </div>
        {f.dryingMethod && (
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <Toggle id="h-ground" checked={f.groundContact} onChange={(v) => set({ groundContact: v })} label={t('farmer.harvest.f.groundContact')} />
            <Toggle id="h-rain" checked={f.rainDuringDrying} onChange={(v) => set({ rainDuringDrying: v })} label={t('farmer.harvest.f.rain')} />
          </div>
        )}
        <Field label={t('common.notes')} htmlFor="h-notes">
          <textarea id="h-notes" rows={2} maxLength={2000} className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <div>
          <Toggle id="h-close" checked={f.closeCycle} onChange={(v) => set({ closeCycle: v })} label={t('farmer.harvest.f.closeCycle')} />
          {!hasCycle && <p className="mt-1 text-xs text-slate-500">{t('farmer.harvest.noCycle')}</p>}
        </div>
        <FormError error={save.error} />
        <Button type="submit" size="lg" variant="success" icon={Truck} className="min-h-14 w-full" loading={save.isPending}>{t('farmer.harvest.save')}</Button>
      </form>
      {h && (
        <div className="mt-4">
          <Notice tone="success" icon={CheckCircle2}>
            <p className="font-bold">{t('farmer.harvest.saved')}</p>
          </Notice>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Metric label={t('farmer.harvest.m.expected')} value={h.estimatedQuantity != null ? kg(h.estimatedQuantity) : t('farmer.harvest.m.noEstimate')} />
            <Metric label={t('farmer.harvest.m.actual')} value={kg(h.actualQuantity)} />
            <Metric label={t('farmer.harvest.m.difference')} value={h.differenceQuantity != null ? `${h.differenceQuantity > 0 ? '+' : ''}${num(h.differenceQuantity, 1)} kg` : '—'} />
            <Metric label={t('farmer.harvest.m.loss')} value={h.lossPercent != null ? `${num(h.lossPercent, 1)}%` : '—'} />
            <Metric label={t('farmer.harvest.m.value')} value={h.totalValue != null ? tzs(h.totalValue) : '—'} />
          </dl>
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-base font-bold text-slate-900">{value}</dd>
    </div>
  );
}

const LOSS_EMPTY = { lossDate: isoDate(), cause: 'ICE_ICE', percentLost: '', quantityKg: '', notes: '' };

function LossForm({ farmId }) {
  const { t } = useI18n();
  const invalidate = useInvalidateFarm();
  const [f, setF] = useState(LOSS_EMPTY);
  const set = (patch) => setF((s) => ({ ...s, ...patch }));
  const save = useMutation({
    mutationFn: () => farmApi.addLoss(farmId, {
      lossDate: f.lossDate, cause: f.cause, percentLost: Number(f.percentLost), quantityKg: numOrNull(f.quantityKg), notes: f.notes.trim() || null,
    }),
    onSuccess: () => { invalidate(farmId); setF(LOSS_EMPTY); },
  });
  return (
    <Card className="p-4">
      <p className="mb-3 text-sm text-slate-600">{t('farmer.harvest.lossIntro')}</p>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('farmer.harvest.f.lossDate')} htmlFor="l-date" required>
            <input id="l-date" type="date" className="input" required max={isoDate()} value={f.lossDate} onChange={(e) => set({ lossDate: e.target.value })} />
          </Field>
          <Field label={t('farmer.harvest.f.cause')} htmlFor="l-cause" required>
            <select id="l-cause" className="input" value={f.cause} onChange={(e) => set({ cause: e.target.value })}>
              {CAUSES.map((c) => <option key={c} value={c}>{t(`farmer.enums.cause.${c}`)}</option>)}
            </select>
          </Field>
          <Field label={t('farmer.harvest.f.percentLost')} htmlFor="l-pct" required>
            <input id="l-pct" type="number" inputMode="decimal" min={0} max={100} className="input" required value={f.percentLost} onChange={(e) => set({ percentLost: e.target.value })} />
          </Field>
          <Field label={t('farmer.harvest.f.quantityKg')} htmlFor="l-kg">
            <input id="l-kg" type="number" inputMode="decimal" min={0} className="input" value={f.quantityKg} onChange={(e) => set({ quantityKg: e.target.value })} />
          </Field>
        </div>
        <Field label={t('common.notes')} htmlFor="l-notes">
          <textarea id="l-notes" rows={2} maxLength={2000} className="input" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        {Number(f.percentLost) >= 90 && <Notice tone="warning">{t('farmer.harvest.bigLossWarn')}</Notice>}
        <FormError error={save.error} />
        {save.isSuccess && <Notice tone="success" icon={CheckCircle2}>{t('farmer.harvest.lossSaved')}</Notice>}
        <Button type="submit" size="lg" variant="danger" icon={AlertOctagon} className="min-h-14 w-full" loading={save.isPending}>{t('farmer.harvest.saveLoss')}</Button>
      </form>
    </Card>
  );
}

function HarvestList({ farmId }) {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['harvests', farmId], queryFn: () => farmApi.harvests(farmId) });
  if (q.isLoading) return <div className="flex justify-center p-4"><Spinner /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} compact />;
  const list = q.data?.harvests || [];
  if (!list.length) return <EmptyState title={t('farmer.harvest.noHarvests')} />;
  return (
    <ul className="space-y-2">
      {list.map((h) => (
        <li key={h.id}>
          <Card className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{fmtDate(h.harvestDate, lang)}</p>
              <div className="flex flex-wrap gap-1.5">
                {h.qualityGrade && <Badge className="bg-ocean-50 text-ocean-800 ring-ocean-200">{t(`farmer.enums.grade.${h.qualityGrade}`)}</Badge>}
                {h.isDemo && <Badge className="bg-violet-50 text-violet-800 ring-violet-300">{t('source.demoBadge')}</Badge>}
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-700">
              {kg(h.actualQuantity)} {t(`farmer.enums.unitShort.${h.unit}`)}
              {h.estimatedQuantity != null && <span className="text-slate-500"> · {t('farmer.harvest.m.expected')}: {kg(h.estimatedQuantity)}</span>}
            </p>
            <p className="text-sm text-slate-600">
              {t('farmer.harvest.m.loss')}: <strong>{h.lossPercent != null ? `${num(h.lossPercent, 1)}%` : '—'}</strong>
              {' · '}{t('farmer.harvest.m.value')}: <strong>{h.totalValue != null ? tzs(h.totalValue) : '—'}</strong>
              {h.buyer?.companyName && <> · {h.buyer.companyName}</>}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function LossList({ farmId }) {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['losses', farmId], queryFn: () => farmApi.losses(farmId) });
  if (q.isLoading) return <div className="flex justify-center p-4"><Spinner /></div>;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} compact />;
  const list = q.data?.losses || [];
  if (!list.length) return <EmptyState title={t('farmer.harvest.noLosses')} />;
  return (
    <ul className="space-y-2">
      {list.map((l) => (
        <li key={l.id}>
          <Card className="border-l-4 border-red-300 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{t(`farmer.enums.cause.${l.cause}`)}</p>
              <span className="text-sm text-slate-500">{fmtDate(l.lossDate, lang)}</span>
            </div>
            <p className="text-sm text-slate-700">{t('farmer.harvest.lostPct', { n: num(l.percentLost, 1) })}{l.quantityKg != null && ` · ${kg(l.quantityKg)}`}</p>
            {l.notes && <p className="mt-0.5 text-sm text-slate-600">{l.notes}</p>}
          </Card>
        </li>
      ))}
    </ul>
  );
}
