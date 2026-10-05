import { useMutation, useQuery } from '@tanstack/react-query';
import { BrainCircuit, RefreshCw } from 'lucide-react';
import { farmApi } from '../../../api/endpoints.js';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { Button, Card, ErrorState, FormError, Spinner } from '../../../components/ui/index.jsx';
import { dateTime } from '../../../utils/format.js';
import { useInvalidateFarm } from './shared.jsx';

export default function FarmIntelligence({ farmId }) {
  const { t, lang } = useI18n();
  const invalidate = useInvalidateFarm();
  const q = useQuery({ queryKey: ['intelligence', farmId], queryFn: () => farmApi.intelligence(farmId) });
  const refresh = useMutation({ mutationFn: () => farmApi.runRisks(farmId), onSuccess: () => invalidate(farmId) });
  const data = q.data;
  return (
    <Card className="mb-4 border-ocean-200 p-4" data-testid="farm-intelligence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><BrainCircuit className="h-5 w-5 text-ocean-700" aria-hidden />{t('intelligence.title')}</h2>
        <Button size="sm" variant="secondary" icon={RefreshCw} loading={refresh.isPending} onClick={() => refresh.mutate()}>{t('intelligence.refresh')}</Button>
      </div>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} compact /> : data && (
        <div className="mt-3 space-y-2 text-sm text-slate-700" aria-live="polite">
          <p className="font-semibold">{t(data.assessment.mode === 'HYBRID' ? 'intelligence.fieldModel' : 'intelligence.rules')}</p>
          <p>{t('intelligence.estimates')}</p>
          {data.assessment.missingInputs?.length > 0 && <p className="text-amber-800">{t('intelligence.missingInputs', { inputs: data.assessment.missingInputs.map((key) => t(`intelligence.inputs.${key}`)).join(', ') })}</p>}
          {!data.assessment.available && <p className="text-amber-800">{t('intelligence.insufficient')}</p>}
          <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <div>
              <p className="font-semibold">{t('intelligence.sources')}</p>
              <p>{t(`intelligence.${data.environment.status}`)}</p>
              {[['weather', data.environment.weather], ['ocean', data.environment.ocean]].map(([kind, source]) => (
                <p key={kind}>{t(`intelligence.${kind}`)}: {source ? `${source.provider} · ${dateTime(source.observedAt, lang)}` : t('common.noData')}</p>
              ))}
              <p className="mt-1 text-xs text-slate-500">{t('intelligence.externalForecasts')}</p>
            </div>
            <div>
              <p className="font-semibold">{t('intelligence.records')}</p>
              <p>{t('intelligence.recordCounts', data.records)}</p>
              <p>{t('intelligence.harvestHistory', { n: data.harvest.completedCycles, min: data.harvest.minimumCycles })}</p>
              {!data.harvest.available && <p className="mt-1 text-amber-800">{t('intelligence.noYield')}</p>}
            </div>
          </div>
          <details className="pt-1">
            <summary className="cursor-pointer font-semibold text-ocean-700">{t('intelligence.training')}</summary>
            <p className="mt-2">{t('intelligence.trainingNote')}</p>
            <ul className="mt-1 space-y-1">
              {data.training.map((r) => <li key={r.riskType}>{t(`risk.type.${r.riskType}`)}: {t('intelligence.trainingCount', { n: r.records, min: r.minimumRecords })}{r.ready ? ` · ${t('intelligence.ready')}` : ''}</li>)}
            </ul>
            <p className="mt-2">{t(data.assistant.languageModelConfigured ? 'intelligence.chatConfigured' : 'intelligence.chatRecords')}</p>
          </details>
          <p className="text-xs text-slate-500">{t('intelligence.assessed')}: {data.assessment.calculatedAt ? dateTime(data.assessment.calculatedAt, lang) : t('common.noData')}</p>
          {refresh.isSuccess && <p className="text-seaweed-700">{t('intelligence.refreshed')}</p>}
        </div>
      )}
      <FormError error={refresh.error} />
    </Card>
  );
}
