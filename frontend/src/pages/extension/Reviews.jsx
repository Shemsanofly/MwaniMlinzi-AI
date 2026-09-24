import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ClipboardList } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { extensionApi } from '../../api/endpoints.js';
import { EmptyState, ErrorState, PageHeader, PageLoader, cx } from '../../components/ui/index.jsx';
import { ObservationCard, RecommendationCard } from './components/ReviewCards.jsx';

const STATUSES = ['PENDING', 'REVIEWED', 'FLAGGED', ''];

function StatusFilter({ id, value, onChange }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{t('extension.reviews.show')}</label>
      <select id={id} className="input w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
        {STATUSES.map((s) => <option key={s || 'all'} value={s}>{s ? t(`extension.shared.reviewStatus.${s}`) : t('common.all')}</option>)}
      </select>
    </div>
  );
}

function ObservationsTab() {
  const { t } = useI18n();
  const [reviewStatus, setReviewStatus] = useState('PENDING');
  const q = useQuery({ queryKey: ['extObservations', reviewStatus], queryFn: () => extensionApi.observations({ reviewStatus }) });
  const list = q.data?.observations || [];
  return (
    <div className="space-y-4">
      <StatusFilter id="obs-status" value={reviewStatus} onChange={setReviewStatus} />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : list.length === 0
        ? <EmptyState icon={ClipboardList} title={t('extension.reviews.noObservations')} />
        : <div className="grid gap-3 lg:grid-cols-2">{list.map((o) => <ObservationCard key={o.id} obs={o} canReview farmLink={`/extension/farms/${o.farm?.id || o.farmId}`} />)}</div>}
    </div>
  );
}

function RecommendationsTab() {
  const { t } = useI18n();
  const [reviewStatus, setReviewStatus] = useState('PENDING');
  const q = useQuery({ queryKey: ['extRecommendations', reviewStatus], queryFn: () => extensionApi.recommendations({ reviewStatus }) });
  const list = q.data?.recommendations || [];
  return (
    <div className="space-y-4">
      <StatusFilter id="rec-status" value={reviewStatus} onChange={setReviewStatus} />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : list.length === 0
        ? <EmptyState icon={ClipboardCheck} title={t('extension.reviews.noRecommendations')} />
        : <div className="grid gap-3 lg:grid-cols-2">{list.map((r) => <RecommendationCard key={r.id} rec={r} farmLink={`/extension/farms/${r.farm?.id || r.farmId}`} />)}</div>}
    </div>
  );
}

export default function ExtensionReviews() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'recommendations' ? 'recommendations' : 'observations';
  const tabs = [
    { id: 'observations', label: t('extension.reviews.tabObservations'), icon: ClipboardList },
    { id: 'recommendations', label: t('extension.reviews.tabRecommendations'), icon: ClipboardCheck },
  ];
  return (
    <div>
      <PageHeader title={t('extension.reviews.title')} subtitle={t('extension.reviews.subtitle')} />
      <div role="tablist" aria-label={t('extension.reviews.title')} className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setParams({ tab: id }, { replace: true })}
            className={cx('-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold', tab === id ? 'border-ocean-700 text-ocean-800' : 'border-transparent text-slate-500 hover:text-slate-800')}
          >
            <Icon className="h-4 w-4" aria-hidden />{label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{tab === 'observations' ? <ObservationsTab /> : <RecommendationsTab />}</div>
    </div>
  );
}
