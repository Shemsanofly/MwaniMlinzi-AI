import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Info, Package, TrendingUp } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { forecastApi } from '../../api/endpoints.js';
import { Badge, Button, DemoBadge, EmptyState, ErrorState, FormError, Notice, PageHeader, PageLoader, Table } from '../../components/ui/index.jsx';
import { date, num, pct } from '../../utils/format.js';
import { HarvestWeeklyChart } from '../extension/components/charts.jsx';
import { Section, SuccessNote } from '../extension/components/common.jsx';
import { GroupTable, HorizonCards } from '../extension/components/Portfolio.jsx';

const DAY_OPTIONS = [7, 14, 30, 60, 90];

export default function CooperativeForecast() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [days, setDays] = useState('');
  const [district, setDistrict] = useState('');
  const [success, setSuccess] = useState(null);
  const params = useMemo(() => ({ days, district }), [days, district]);
  const q = useQuery({ queryKey: ['forecasts', params], queryFn: () => forecastApi.harvest(params), placeholderData: (p) => p });
  const all = useQuery({ queryKey: ['forecasts', { days: '', district: '' }], queryFn: () => forecastApi.harvest({}) });
  const districts = useMemo(() => [...new Set((all.data?.forecasts || []).map((f) => f.district))].sort(), [all.data]);
  const regen = useMutation({
    mutationFn: forecastApi.generate,
    onSuccess: (d) => {
      setSuccess(t('coop.forecastsRegenerated', { n: d?.generated ?? 0 }));
      qc.invalidateQueries({ queryKey: ['forecasts'] });
      qc.invalidateQueries({ queryKey: ['coopDashboard'] });
      qc.invalidateQueries({ queryKey: ['farms'] });
    },
  });

  const columns = [
    {
      key: 'farm',
      header: t('common.farm'),
      render: (f) => (
        <div className="min-w-36">
          <Link to={`/cooperative/farms/${f.farmId}`} className="font-semibold text-ocean-700 hover:underline">{f.farm?.farmCode} · {f.farm?.name}</Link>
          <div className="mt-0.5 flex flex-wrap gap-1">{f.isDemo && <DemoBadge />}{f.inputs?.overdue && <Badge className="bg-amber-50 text-amber-800 ring-amber-300">{t('coop.forecast.overdue')}</Badge>}</div>
        </div>
      ),
    },
    { key: 'date', header: t('coop.forecast.expectedDate'), render: (f) => <span className="whitespace-nowrap">{date(f.expectedHarvestDate, lang)}</span> },
    { key: 'exp', header: t('coop.forecast.expectedKg'), className: 'text-right', render: (f) => num(f.expectedQuantityKg, 0) },
    { key: 'ra', header: t('coop.forecast.riskAdjustedKg'), className: 'text-right', render: (f) => <b>{num(f.riskAdjustedQuantityKg, 0)}</b> },
    { key: 'range', header: t('coop.forecast.rangeKg'), className: 'text-right whitespace-nowrap', render: (f) => `${num(f.lowQuantityKg, 0)}–${num(f.highQuantityKg, 0)}` },
    { key: 'conf', header: t('risk.confidence'), className: 'text-right', render: (f) => pct(f.confidence) },
    { key: 'grade', header: t('coop.forecast.grade'), render: (f) => (f.expectedGrade ? <Badge>{f.expectedGrade}</Badge> : '—') },
    { key: 'src', header: t('coop.forecast.yieldSource'), render: (f) => <span className="text-xs" title={f.method}>{f.inputs?.yieldSource ? t(`coop.forecast.yield.${f.inputs.yieldSource}`) : '—'}{f.inputs?.expectedLossFraction != null && <span className="block text-slate-500">{t('coop.forecast.lossFraction', { pct: pct(f.inputs.expectedLossFraction) })}</span>}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('coop.forecast.title')}
        subtitle={t('coop.forecast.subtitle')}
        actions={<Button icon={TrendingUp} loading={regen.isPending} onClick={() => { setSuccess(null); regen.mutate(); }}>{t('coop.regenerate')}</Button>}
      />
      <SuccessNote onClose={() => setSuccess(null)}>{success}</SuccessNote>
      <FormError error={regen.error} />

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="fc-days">{t('coop.forecast.window')}</label>
          <select id="fc-days" className="input" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="">{t('coop.forecast.allUpcoming')}</option>
            {DAY_OPTIONS.map((n) => <option key={n} value={n}>{t('coop.forecast.nextDays', { n })}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fc-district">{t('common.district')}</label>
          <select id="fc-district" className="input" value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <HorizonCards horizons={q.data.summary.horizons} />
          <Notice tone="warning" icon={Info}>
            <p className="font-semibold">{t('common.uncertainty')}</p>
            <p>{q.data.summary.uncertaintyNote}</p>
            <p className="mt-1 text-xs">{t('coop.forecast.unitNote', { unit: q.data.summary.unit })}</p>
          </Notice>
          <Section title={t('extension.shared.charts.harvestByWeek')} subtitle={t('extension.shared.charts.harvestByWeekSub')} icon={BarChart3}>
            {q.data.summary.byWeek.length ? <HarvestWeeklyChart data={q.data.summary.byWeek} /> : <EmptyState title={t('extension.shared.noForecasts')} />}
          </Section>
          {q.data.summary.byDistrict.length > 1 && (
            <Section title={t('coop.forecast.byDistrict')} icon={Package} bodyClassName="p-0 sm:p-0">
              <GroupTable rows={q.data.summary.byDistrict} keyHeader={t('common.district')} />
            </Section>
          )}
          <Section title={t('coop.forecast.perFarm')} subtitle={t('coop.forecast.perFarmSub', { n: q.data.forecasts.length })} icon={Package} bodyClassName="p-0 sm:p-0">
            <Table columns={columns} rows={q.data.forecasts} empty={<div className="p-4"><EmptyState title={t('extension.shared.noForecasts')} message={t('coop.forecast.emptyHint')} /></div>} />
          </Section>
        </>
      )}
    </div>
  );
}
