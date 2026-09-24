import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, BrainCircuit, CalendarClock, ClipboardList, History as HistoryIcon, RefreshCw, Sprout, Truck, Waves } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../stores/AuthContext.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { environmentApi, farmApi } from '../../api/endpoints.js';
import { Button, Card, DemoBadge, ErrorState, FormError, Notice, Spinner } from '../../components/ui/index.jsx';
import { EnvironmentSummary, NextActionCard } from '../../components/risk/RiskComponents.jsx';
import { dateTime, date as fmtDate } from '../../utils/format.js';
import { ActionRecordedNotice, AlertList, BigLink, FarmGate, FarmSwitcher, SectionTitle, useInvalidateFarm, useRecordAction } from './components/shared.jsx';
import RiskTiles from './components/RiskTiles.jsx';

export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const ff = useFarmerFarm();
  const firstName = user?.fullName?.split(' ')[0] || '';

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('farmer.dashboard.greeting', { name: firstName })}</h1>
      <p className="mb-4 text-sm text-slate-500">{t('farmer.dashboard.subtitle')}</p>
      {ff.farm ? <DashboardBody ff={ff} /> : <FarmGate ff={ff} />}
    </div>
  );
}

function DashboardBody({ ff }) {
  const { t, lang } = useI18n();
  const { farm, farmId } = ff;
  const invalidate = useInvalidateFarm();
  const [recorded, setRecorded] = useState(null);

  const risksQ = useQuery({ queryKey: ['risks', farmId], queryFn: () => farmApi.risks(farmId) });
  const envQ = useQuery({ queryKey: ['env', farmId], queryFn: () => environmentApi.current(farmId) });
  const alertsQ = useQuery({ queryKey: ['farmAlerts', farmId], queryFn: () => farmApi.alerts(farmId) });
  const recordAction = useRecordAction(farmId);
  const recalc = useMutation({ mutationFn: () => farmApi.runRisks(farmId), onSuccess: () => invalidate(farmId) });

  const onRecordAction = (rec, taken) => {
    setRecorded(null);
    recordAction.mutate({ recommendationId: rec.id, actionTaken: taken }, { onSuccess: (data) => setRecorded(data.action) });
  };

  const risk = risksQ.data;
  const cycle = farm.currentCycle;

  return (
    <div>
      <FarmSwitcher ff={ff} />

      {/* Farm summary */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Sprout className="h-5 w-5 text-seaweed-600" aria-hidden />
          <p className="text-lg font-bold text-slate-900">{farm.name}</p>
          <span className="text-sm font-semibold text-slate-500">{farm.farmCode}</span>
          {farm.isDemo && <DemoBadge label={t('common.demoFarm')} />}
        </div>
        {cycle ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-seaweed-50 p-3">
              <p className="text-xs font-semibold text-seaweed-700">{t('common.cropAge')}</p>
              <p className="text-2xl font-bold text-slate-900">{farm.cropAgeDays != null ? t('common.days', { n: farm.cropAgeDays }) : '—'}</p>
            </div>
            <div className="rounded-lg bg-ocean-50 p-3">
              <p className="text-xs font-semibold text-ocean-700">{t('farmer.dashboard.daysToHarvest')}</p>
              <p className="text-2xl font-bold text-slate-900">
                {cycle.daysToHarvest == null ? '—' : cycle.daysToHarvest > 0 ? t('common.days', { n: cycle.daysToHarvest }) : t('farmer.dashboard.harvestNow')}
              </p>
              <p className="text-xs text-slate-500">{fmtDate(cycle.expectedHarvestDate, lang)}</p>
            </div>
          </div>
        ) : (
          <Notice tone="info" className="mt-3" icon={CalendarClock}>
            {t('farmer.dashboard.noCycle')} <Link to="/farmer/farm" className="font-semibold underline">{t('farmer.farm.recordPlanting')}</Link>
          </Notice>
        )}
      </Card>

      {/* Current risks */}
      <SectionTitle>{t('farmer.dashboard.currentRisks')}</SectionTitle>
      {risksQ.isLoading ? <div className="flex justify-center p-6"><Spinner /></div>
        : risksQ.error ? <ErrorState error={risksQ.error} onRetry={risksQ.refetch} compact />
        : (
          <>
            {risk.insufficientData && risk.insufficientDataMessage && <Notice tone="warning" className="mb-2">{risk.insufficientDataMessage[lang]}</Notice>}
            <RiskTiles predictions={risk.predictions} linkTo="/farmer/risk" />
          </>
        )}

      {/* Next action */}
      <SectionTitle>{t('farmer.dashboard.nextAction')}</SectionTitle>
      {risk && (
        <div className="space-y-2">
          <NextActionCard nextAction={risk.nextAction} insufficientDataMessage={risk.insufficientDataMessage} farmId={farmId} onRecordAction={onRecordAction} actionLoading={recordAction.isPending} />
          <FormError error={recordAction.error} />
          <ActionRecordedNotice action={recorded} onClose={() => setRecorded(null)} />
        </div>
      )}

      {/* Quick actions */}
      <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <BigLink to="/farmer/observations" icon={ClipboardList}>{t('actions.recordSymptoms')}</BigLink>
        <BigLink to="/farmer/harvest" icon={Truck} tone="green">{t('actions.recordHarvest')}</BigLink>
        <BigLink to="/farmer/history" icon={HistoryIcon} tone="light">{t('actions.viewHistory')}</BigLink>
        <BigLink to="/farmer/assistant" icon={Bot} tone="light">{t('actions.askAI')}</BigLink>
      </div>

      {/* Model status + recalculate */}
      {risk && (
        <Card className="mt-4 p-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5"><BrainCircuit className="h-4 w-4 text-ocean-600" aria-hidden />{t('farmer.dashboard.model')}: <strong className="text-slate-800">{risk.modelStatus?.label || '—'}</strong></span>
            <span>{t('farmer.dashboard.calculated', { time: dateTime(risk.calculatedAt, lang) })}</span>
            <Button variant="secondary" size="sm" icon={RefreshCw} className="min-h-11 sm:ml-auto" loading={recalc.isPending} onClick={() => recalc.mutate()}>{t('actions.recalculate')}</Button>
          </div>
          {recalc.isSuccess && <p className="mt-2 text-sm font-medium text-seaweed-700">{t('farmer.dashboard.recalculated')}</p>}
          <FormError error={recalc.error} />
        </Card>
      )}

      {/* Environment */}
      <SectionTitle>{t('farmer.dashboard.environment')}</SectionTitle>
      <Card className="p-3">
        {envQ.isLoading ? <div className="flex justify-center p-4"><Spinner /></div>
          : envQ.error ? <ErrorState error={envQ.error} onRetry={envQ.refetch} compact />
          : envQ.data?.current ? <EnvironmentSummary env={envQ.data.current} compact />
          : <p className="flex items-center gap-2 text-sm text-slate-500"><Waves className="h-4 w-4" aria-hidden />{t('common.noData')}</p>}
      </Card>

      {/* Alerts */}
      <SectionTitle>{t('farmer.dashboard.alerts')}</SectionTitle>
      {alertsQ.isLoading ? <div className="flex justify-center p-4"><Spinner /></div>
        : alertsQ.error ? <ErrorState error={alertsQ.error} onRetry={alertsQ.refetch} compact />
        : <AlertList alerts={alertsQ.data?.alerts} farmId={farmId} />}
    </div>
  );
}
