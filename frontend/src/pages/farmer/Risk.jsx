import { useMutation, useQuery } from '@tanstack/react-query';
import { LineChart as LineIcon, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { farmApi } from '../../api/endpoints.js';
import { Button, Card, CardHeader, EmptyState, ErrorState, FormError, Notice, PageHeader, PageLoader, SourceBadge, Spinner } from '../../components/ui/index.jsx';
import { ModelStatusBadge, RiskCard } from '../../components/risk/RiskComponents.jsx';
import { levelRank } from '../../utils/risk.js';
import { dateTime } from '../../utils/format.js';
import { FarmGate, FarmSwitcher, SectionTitle, sortPredictions, useInvalidateFarm } from './components/shared.jsx';
import RecommendationPanel from './components/RecommendationPanel.jsx';
import RiskHistoryChart from './components/RiskHistoryChart.jsx';

export default function RiskPage() {
  const { t } = useI18n();
  const ff = useFarmerFarm();
  return (
    <div>
      <PageHeader title={t('farmer.risk.title')} subtitle={t('farmer.risk.subtitle')} />
      {ff.farm ? <RiskBody ff={ff} /> : <FarmGate ff={ff} />}
    </div>
  );
}

function RiskBody({ ff }) {
  const { t, lang } = useI18n();
  const { farmId } = ff;
  const invalidate = useInvalidateFarm();
  const risksQ = useQuery({ queryKey: ['risks', farmId], queryFn: () => farmApi.risks(farmId) });
  const histQ = useQuery({ queryKey: ['riskHistory', farmId, 30], queryFn: () => farmApi.riskHistory(farmId, { days: 30 }) });
  const recalc = useMutation({ mutationFn: () => farmApi.runRisks(farmId), onSuccess: () => invalidate(farmId) });

  const risk = risksQ.data;
  const preds = sortPredictions(risk?.predictions);
  const highest = [...preds].sort((a, b) => levelRank(b.riskLevel) - levelRank(a.riskLevel) || b.probability - a.probability)[0];
  const sources = [...new Set(preds.map((p) => p.dataSource).filter(Boolean))];

  return (
    <div>
      <FarmSwitcher ff={ff} />
      {risksQ.isLoading ? <PageLoader />
        : risksQ.error ? <ErrorState error={risksQ.error} onRetry={risksQ.refetch} />
        : (
          <>
            <Card className="p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <ModelStatusBadge label={risk.modelStatus?.label} />
                {sources.map((s) => <SourceBadge key={s} source={s} />)}
                <span>{t('farmer.dashboard.calculated', { time: dateTime(risk.calculatedAt, lang) })}</span>
                <Button variant="secondary" size="sm" icon={RefreshCw} className="min-h-11 sm:ml-auto" loading={recalc.isPending} onClick={() => recalc.mutate()}>{t('actions.recalculate')}</Button>
              </div>
              {recalc.isSuccess && <p className="mt-2 text-sm font-medium text-seaweed-700">{t('farmer.dashboard.recalculated')}</p>}
              <FormError error={recalc.error} />
            </Card>
            {risk.insufficientData && risk.insufficientDataMessage && <Notice tone="warning" className="mt-3">{risk.insufficientDataMessage[lang]}</Notice>}
            {!preds.length ? (
              <div className="mt-4"><EmptyState title={t('farmer.risk.noPredictions')} /></div>
            ) : (
              <div className="mt-4 space-y-4">
                {preds.map((p) => (
                  <div key={p.id}>
                    <RiskCard prediction={p} defaultOpen={p.id === highest?.id} />
                    <RecommendationPanel recommendation={p.recommendation} farmId={farmId} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      <SectionTitle>{t('farmer.risk.historyTitle')}</SectionTitle>
      <Card>
        <CardHeader icon={LineIcon} title={t('farmer.risk.historyTitle')} subtitle={t('farmer.risk.historySubtitle')} />
        <div className="p-3">
          {histQ.isLoading ? <div className="flex justify-center p-6"><Spinner /></div>
            : histQ.error ? <ErrorState error={histQ.error} onRetry={histQ.refetch} compact />
            : histQ.data?.predictions?.length ? <RiskHistoryChart predictions={histQ.data.predictions} thresholds={histQ.data.thresholds} />
            : <EmptyState title={t('farmer.risk.noHistory')} />}
        </div>
      </Card>
    </div>
  );
}
