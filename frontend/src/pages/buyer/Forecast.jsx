import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Building2, MapPin } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { buyerApi } from '../../api/endpoints.js';
import { EmptyState, ErrorState, PageHeader, PageLoader } from '../../components/ui/index.jsx';
import { HarvestWeeklyChart } from '../extension/components/charts.jsx';
import { Section } from '../extension/components/common.jsx';
import { GroupTable } from '../extension/components/Portfolio.jsx';
import { DemoSupplyNote, PrivacyNote, SupplyHorizonCards, UncertaintyNote } from './components/BuyerParts.jsx';
import SupplyFilters, { EMPTY_FILTERS } from './components/SupplyFilters.jsx';

export default function BuyerForecast() {
  const { t } = useI18n();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const q = useQuery({ queryKey: ['buyerForecast', filters], queryFn: () => buyerApi.forecast(filters), placeholderData: (p) => p });
  const options = useQuery({ queryKey: ['buyerForecast', {}], queryFn: () => buyerApi.forecast({}) });
  const d = q.data;

  return (
    <div className="space-y-5">
      <PageHeader title={t('buyer.forecast.title')} subtitle={t('buyer.forecast.subtitle')} />
      <PrivacyNote />
      <SupplyFilters value={filters} onApply={setFilters} options={options.data?.filters || d?.filters} />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <div className={q.isFetching ? 'space-y-5 opacity-70 transition-opacity' : 'space-y-5'} aria-busy={q.isFetching}>
          <SupplyHorizonCards horizons={d.summary.horizons} />
          <p className="text-sm text-slate-600">{t('buyer.forecast.matching', { n: d.supply.length })}</p>
          <UncertaintyNote note={d.summary.uncertaintyNote} />
          <DemoSupplyNote supply={d.supply} />
          <Section title={t('buyer.dashboard.weekly')} subtitle={t('buyer.dashboard.weeklySub')} icon={BarChart3}>
            {d.summary.byWeek.length ? <HarvestWeeklyChart data={d.summary.byWeek} unit="t" /> : <EmptyState title={t('buyer.noSupply')} message={t('buyer.forecast.tryWider')} />}
          </Section>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title={t('buyer.byCooperative')} icon={Building2} bodyClassName="p-0 sm:p-0">
              <GroupTable rows={d.summary.byCooperative} keyHeader={t('common.cooperative')} unit="t" />
            </Section>
            <Section title={t('buyer.byDistrict')} icon={MapPin} bodyClassName="p-0 sm:p-0">
              <GroupTable rows={d.summary.byDistrict} keyHeader={t('common.district')} unit="t" />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
