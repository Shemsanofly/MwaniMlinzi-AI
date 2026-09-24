import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, BarChart3, Building2, ClipboardList, MapPin, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../stores/AuthContext.jsx';
import { buyerApi } from '../../api/endpoints.js';
import { Button, EmptyState, ErrorState, PageHeader, PageLoader } from '../../components/ui/index.jsx';
import { num, pct } from '../../utils/format.js';
import { HarvestWeeklyChart, SimpleBarChart } from '../extension/components/charts.jsx';
import { Section } from '../extension/components/common.jsx';
import { GroupTable, tonnesText } from '../extension/components/Portfolio.jsx';
import { DemandVsSupply, DemoSupplyNote, PrivacyNote, SupplyHorizonCards, UncertaintyNote } from './components/BuyerParts.jsx';

export default function BuyerDashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['buyerForecast', {}], queryFn: () => buyerApi.forecast({}) });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const { summary, supply = [], demand = [], qualityHistory = [] } = q.data;
  const totalQ = qualityHistory.reduce((a, g) => a + g.kg, 0);
  const quality = [...qualityHistory].sort((a, b) => a.grade.localeCompare(b.grade)).map((g) => ({ ...g, label: t('buyer.grade', { g: g.grade }), tonnes: g.kg / 1000 }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('buyer.dashboard.title')}
        subtitle={t('buyer.dashboard.subtitle')}
        actions={(
          <>
            <Button variant="secondary" icon={RefreshCw} loading={q.isFetching} onClick={() => q.refetch()}>{t('actions.refresh')}</Button>
            <Link to="/buyer/supply" className="inline-flex items-center justify-center gap-2 rounded-lg bg-ocean-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ocean-800">{t('buyer.dashboard.viewSupply')}</Link>
          </>
        )}
      />
      <PrivacyNote />
      <SupplyHorizonCards horizons={summary.horizons} />
      <UncertaintyNote note={summary.uncertaintyNote} />
      <DemoSupplyNote supply={supply} />

      <Section title={t('buyer.dashboard.weekly')} subtitle={t('buyer.dashboard.weeklySub')} icon={BarChart3}>
        {summary.byWeek.length ? <HarvestWeeklyChart data={summary.byWeek} unit="t" /> : <EmptyState title={t('buyer.noSupply')} />}
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('buyer.byCooperative')} icon={Building2} bodyClassName="p-0 sm:p-0">
          <GroupTable rows={summary.byCooperative} keyHeader={t('common.cooperative')} unit="t" />
        </Section>
        <Section title={t('buyer.byDistrict')} icon={MapPin} bodyClassName="p-0 sm:p-0">
          <GroupTable rows={summary.byDistrict} keyHeader={t('common.district')} unit="t" />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Section title={t('buyer.dashboard.quality')} subtitle={t('buyer.dashboard.qualitySub')} icon={Award} className="lg:col-span-2">
          {quality.length ? (
            <>
              <SimpleBarChart data={quality} xKey="label" yKey="tonnes" name={t('buyer.tonnesShort')} valueFormatter={(v) => `${num(v, 1)} t`} height={200} />
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {quality.map((g) => <li key={g.grade}>{g.label}: {t('buyer.dashboard.qualityRow', { t: tonnesText(g.kg), harvests: g.harvests, share: pct(totalQ ? g.kg / totalQ : 0) })}</li>)}
              </ul>
            </>
          ) : <EmptyState title={t('buyer.dashboard.noQuality')} />}
        </Section>
        <Section
          title={t('buyer.dashboard.demand')}
          subtitle={t('buyer.dashboard.demandSub')}
          icon={ClipboardList}
          className="lg:col-span-3"
          action={user?.buyerId ? <Link to="/buyer/supply#post-demand" className="text-sm font-semibold text-ocean-700 hover:underline">{t('buyer.postDemand')} →</Link> : null}
        >
          {demand.length ? <DemandVsSupply demand={demand} supply={supply} /> : <EmptyState title={t('buyer.dashboard.noDemand')} message={user?.buyerId ? t('buyer.dashboard.noDemandHint') : t('buyer.demand.onlyBuyers')} />}
        </Section>
      </div>
    </div>
  );
}
