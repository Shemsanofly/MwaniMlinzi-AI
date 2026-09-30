import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, Clock, Info, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { farmApi } from '../../api/endpoints.js';
import { Button, Card, EmptyState, ErrorState, FormError, Notice, PageHeader, PageLoader, SourceBadge, Spinner, cx } from '../../components/ui/index.jsx';
import { ModelStatusBadge, NoLiveDataNote, RISK_ICON, RiskCard } from '../../components/risk/RiskComponents.jsx';
import { levelRank, riskStyle } from '../../utils/risk.js';
import { dateTime } from '../../utils/format.js';
import { ActionRecordedNotice, FarmGate, FarmSwitcher, SectionTitle, sortPredictions, useInvalidateFarm, useRecordAction } from './components/shared.jsx';
import { ValidationBadge } from './components/RecommendationPanel.jsx';
import RiskHistoryChart from './components/RiskHistoryChart.jsx';
import { LEVEL_ICON } from './Dashboard.jsx';

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

/** Collapsible "See details" block used for everything technical. */
function Details({ id, label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-left text-sm font-semibold text-ocean-700 hover:text-ocean-900">
        {label}
        <ChevronDown className={cx('h-4 w-4 shrink-0 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <div id={id} className="mt-2 space-y-3">{children}</div>}
    </div>
  );
}

/**
 * One risk in plain language: what it is, how serious (icon + words, never colour alone),
 * why, and the approved next step with "I did it" / "I could not".
 */
function SimpleRiskCard({ prediction, farmId }) {
  const { t, tx, lang } = useI18n();
  const [recorded, setRecorded] = useState(null);
  const recordAction = useRecordAction(farmId);
  const s = riskStyle(prediction.riskLevel);
  const LevelIcon = LEVEL_ICON[prediction.riskLevel] || Info;
  const TypeIcon = RISK_ICON[prediction.riskType];
  const reasons = (prediction.factors || []).filter((f) => f.direction === 'INCREASES' && f.simpleLabel).slice(0, 3);
  const rec = prediction.recommendation;
  const item = rec?.actionItem;
  const open = rec && ['PENDING', 'ACKNOWLEDGED'].includes(rec.status);
  const isHarvest = prediction.riskType === 'HARVEST_WINDOW';

  return (
    <Card className={cx('overflow-hidden border-2', s.border)} data-testid={`risk-${prediction.riskType}`}>
      <div className={cx('flex items-center gap-3 px-4 py-3', s.badge)}>
        {TypeIcon && <TypeIcon className="h-6 w-6 shrink-0" aria-hidden />}
        <div className="min-w-0 flex-1">
          <h2 className="font-bold leading-tight">{t(`risk.type.${prediction.riskType}`)}</h2>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <LevelIcon className="h-4 w-4 shrink-0" aria-hidden />
            {isHarvest ? t(`farmer.risk.harvestLevel.${prediction.riskLevel}`) : t(`risk.levelLong.${prediction.riskLevel}`)}
          </p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {prediction.insufficientData ? (
          <Notice tone="warning">{t('risk.insufficient')}</Notice>
        ) : reasons.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700">{t('risk.why')}</p>
            <ul className="mt-1 space-y-1 text-base text-slate-700">
              {reasons.map((f) => <li key={f.code} className="flex gap-2"><span aria-hidden>•</span><span>{tx(f, 'simpleLabel')}</span></li>)}
            </ul>
          </div>
        )}

        {item && (
          <div className="rounded-xl bg-ocean-50/70 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ocean-800">{t('farmer.dashboard.nextAction')}</p>
            <p className="mt-1 text-base font-semibold leading-snug text-slate-900">{tx(item, 'action')}</p>
            <p className="mt-1.5 flex items-center gap-2 text-sm text-slate-700">
              <Clock className="h-4 w-4 shrink-0 text-ocean-700" aria-hidden />
              {t('farmer.dashboard.when')}: {t(`urgency.${item.urgency}`)}{rec.dueBy ? ` · ${t('farmer.dashboard.before', { date: dateTime(rec.dueBy, lang) })}` : ''}
            </p>
            {item.escalateToExtension && <Notice tone="warning" className="mt-2">{t('actions.contactExtension')}</Notice>}
            {open ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="success" className="min-h-12" loading={recordAction.isPending && recordAction.variables?.actionTaken} disabled={recordAction.isPending}
                  onClick={() => recordAction.mutate({ recommendationId: rec.id, actionTaken: true }, { onSuccess: (d) => setRecorded(d.action) })}>
                  {t('actions.didIt')}
                </Button>
                <Button variant="secondary" className="min-h-12" loading={recordAction.isPending && recordAction.variables?.actionTaken === false} disabled={recordAction.isPending}
                  onClick={() => recordAction.mutate({ recommendationId: rec.id, actionTaken: false }, { onSuccess: (d) => setRecorded(d.action) })}>
                  {t('actions.couldNot')}
                </Button>
              </div>
            ) : rec.status === 'COMPLETED' && <Notice tone="success" className="mt-3">{t('risk.actionRecorded')}</Notice>}
            <div className="mt-2 space-y-2">
              <FormError error={recordAction.error} />
              <ActionRecordedNotice action={recorded} onClose={() => setRecorded(null)} />
            </div>
          </div>
        )}

        <Details id={`details-${prediction.id}`} label={t('farmer.dashboard.details')}>
          <RiskCard prediction={prediction} defaultOpen />
          {item && (
            <div className="space-y-1.5 text-sm text-slate-600">
              <p>{tx(item, 'explanation')}</p>
              <ValidationBadge validated={item.validated} source={item.source} />
            </div>
          )}
        </Details>
      </div>
    </Card>
  );
}

function RiskBody({ ff }) {
  const { t, lang } = useI18n();
  const { farmId } = ff;
  const invalidate = useInvalidateFarm();
  const risksQ = useQuery({ queryKey: ['risks', farmId], queryFn: () => farmApi.risks(farmId) });
  const [showHistory, setShowHistory] = useState(false);
  const histQ = useQuery({ queryKey: ['riskHistory', farmId, 30], queryFn: () => farmApi.riskHistory(farmId, { days: 30 }), enabled: showHistory });
  const recalc = useMutation({ mutationFn: () => farmApi.runRisks(farmId), onSuccess: () => invalidate(farmId) });

  const risk = risksQ.data;
  // Most serious first, so the farmer reads what matters before scrolling.
  const preds = sortPredictions(risk?.predictions).sort((a, b) => (a.riskType === 'HARVEST_WINDOW') - (b.riskType === 'HARVEST_WINDOW') || levelRank(b.riskLevel) - levelRank(a.riskLevel));
  const sources = [...new Set(preds.map((p) => p.dataSource).filter(Boolean))];

  return (
    <div>
      <FarmSwitcher ff={ff} />
      {risksQ.isLoading ? <PageLoader label={t('farmer.risk.loading')} />
        : risksQ.error ? <ErrorState error={risksQ.error} onRetry={risksQ.refetch} />
        : (
          <>
            {risk.insufficientData && risk.insufficientDataMessage && <Notice tone="warning" className="mb-3">{risk.insufficientDataMessage[lang]}</Notice>}
            <NoLiveDataNote predictions={preds} className="mb-3" />
            {!preds.length ? (
              <EmptyState title={t('farmer.risk.noPredictions')} message={t('farmer.risk.noPredictionsText')} />
            ) : (
              <div className="space-y-4">
                {preds.map((p) => <SimpleRiskCard key={p.id} prediction={p} farmId={farmId} />)}
              </div>
            )}

            <Card className="mt-4 p-4">
              <p className="text-sm text-slate-600">{t('farmer.dashboard.calculated', { time: dateTime(risk.calculatedAt, lang) })}</p>
              <Button variant="secondary" icon={RefreshCw} className="mt-2 min-h-11 w-full sm:w-auto" loading={recalc.isPending} onClick={() => recalc.mutate()}>
                {recalc.isPending ? t('farmer.risk.checking') : t('farmer.risk.checkAgain')}
              </Button>
              {recalc.isSuccess && <p className="mt-2 text-sm font-medium text-seaweed-700" role="status">{t('farmer.dashboard.recalculated')}</p>}
              <div className="mt-2"><FormError error={recalc.error} /></div>
              <div className="mt-2 border-t border-slate-100 pt-2">
                <Details id="risk-technical" label={t('farmer.risk.technical')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <ModelStatusBadge status={risk.modelStatus} />
                    {sources.map((s) => <SourceBadge key={s} source={s} />)}
                  </div>
                </Details>
              </div>
            </Card>
          </>
        )}

      <SectionTitle>{t('farmer.risk.historyTitle')}</SectionTitle>
      <Card className="p-3">
        {!showHistory ? (
          <Button variant="ghost" className="min-h-11 w-full" onClick={() => setShowHistory(true)}>{t('farmer.risk.showHistory')}</Button>
        ) : (
          <>
            <p className="mb-2 px-1 text-sm text-slate-500">{t('farmer.risk.historySubtitle')}</p>
            {histQ.isLoading ? <div className="flex justify-center p-6"><Spinner /></div>
              : histQ.error ? <ErrorState error={histQ.error} onRetry={histQ.refetch} compact />
              : histQ.data?.predictions?.length ? <RiskHistoryChart predictions={histQ.data.predictions} thresholds={histQ.data.thresholds} />
              : <EmptyState title={t('farmer.risk.noHistory')} />}
          </>
        )}
      </Card>
    </div>
  );
}
