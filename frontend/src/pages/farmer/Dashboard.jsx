import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertOctagon, AlertTriangle, BellRing, Bot, BrainCircuit, CalendarClock, ChevronDown, ClipboardList, Clock, Eye,
  Info, RefreshCw, ShieldCheck, Sprout, Truck, Waves,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../stores/AuthContext.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { environmentApi, farmApi } from '../../api/endpoints.js';
import { Button, Card, DemoBadge, ErrorState, FormError, Notice, Spinner, cx } from '../../components/ui/index.jsx';
import { EnvironmentSummary, RISK_ICON } from '../../components/risk/RiskComponents.jsx';
import { dateTime, date as fmtDate, kg, timeAgo } from '../../utils/format.js';
import { levelRank, riskStyle } from '../../utils/risk.js';
import { ActionRecordedNotice, AlertList, BigLink, FarmGate, FarmSwitcher, SectionTitle, useInvalidateFarm, useRecordAction } from './components/shared.jsx';
import RiskTiles from './components/RiskTiles.jsx';

/** Risk is never shown by colour alone: every level has its own icon and words. */
export const LEVEL_ICON = { LOW: ShieldCheck, MEDIUM: Info, HIGH: AlertTriangle, CRITICAL: AlertOctagon };

/** The most important of the crop risks (the harvest window is shown separately as "expected harvest"). */
export function mainRisk(predictions = []) {
  return predictions
    .filter((p) => p.riskType !== 'HARVEST_WINDOW' && !p.insufficientData)
    .sort((a, b) => levelRank(b.riskLevel) - levelRank(a.riskLevel) || b.probability - a.probability)[0] || null;
}

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

function CurrentRiskCard({ risk }) {
  const { t, tx, lang } = useI18n();
  const main = mainRisk(risk.predictions);
  if (!main) {
    return (
      <Card className="border-l-4 border-slate-300 p-4" data-testid="current-risk">
        <p className="text-sm font-semibold text-slate-500">{t('farmer.dashboard.currentRisk')}</p>
        <p className="mt-1 text-lg font-semibold text-slate-800">{risk.insufficientDataMessage?.[lang] || t('farmer.dashboard.insufficient')}</p>
        <Link to="/farmer/observations" className="mt-2 inline-block font-semibold text-ocean-700">{t('actions.recordSymptoms')} →</Link>
      </Card>
    );
  }
  const s = riskStyle(main.riskLevel);
  const LevelIcon = LEVEL_ICON[main.riskLevel] || Info;
  const TypeIcon = RISK_ICON[main.riskType];
  const reasons = (main.factors || []).filter((f) => f.direction === 'INCREASES' && f.simpleLabel).slice(0, 3);
  return (
    <Card className={cx('overflow-hidden border-2', s.border)} data-testid="current-risk">
      <div className={cx('flex items-center gap-3 px-4 py-3', s.badge)}>
        <LevelIcon className="h-8 w-8 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider">{t('farmer.dashboard.currentRisk')}</p>
          <p className="text-2xl font-extrabold leading-tight">{t(`risk.levelLong.${main.riskLevel}`)}</p>
        </div>
      </div>
      <div className="space-y-2 p-4">
        <p className="flex items-center gap-2 font-semibold text-slate-800">
          {TypeIcon && <TypeIcon className={cx('h-5 w-5', s.text)} aria-hidden />}{t(`risk.type.${main.riskType}`)}
        </p>
        {reasons.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700">{t('risk.why')}</p>
            <ul className="mt-1 space-y-1 text-base text-slate-700">
              {reasons.map((f) => <li key={f.code} className="flex gap-2"><span aria-hidden>•</span><span>{tx(f, 'simpleLabel')}</span></li>)}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function NextActionSimple({ risk, onRecordAction, actionLoading }) {
  const { t, tx, lang } = useI18n();
  const next = risk.nextAction;
  if (!next) {
    return (
      <Card className="p-4">
        <p className="text-slate-700">{risk.insufficientDataMessage?.[lang] || t('farmer.dashboard.keepChecking')}</p>
      </Card>
    );
  }
  const item = next.recommendation.actionItem;
  const done = next.recommendation.status === 'COMPLETED';
  return (
    <Card className="p-4" data-testid="next-action">
      <p className="text-lg font-semibold leading-snug text-slate-900">{tx(item, 'action')}</p>
      <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        <Clock className="h-4 w-4 text-ocean-700" aria-hidden />
        {t('farmer.dashboard.when')}: {t(`urgency.${item.urgency}`)}{next.recommendation.dueBy ? ` · ${t('farmer.dashboard.before', { date: dateTime(next.recommendation.dueBy, lang) })}` : ''}
      </p>
      {item.escalateToExtension && <Notice tone="warning" className="mt-2">{t('actions.contactExtension')}</Notice>}
      {!done && onRecordAction && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={actionLoading} onClick={() => onRecordAction(next.recommendation, true)} className="min-h-12 rounded-lg bg-seaweed-600 px-3 py-2 font-semibold text-white hover:bg-seaweed-700 disabled:opacity-60">{t('actions.didIt')}</button>
          <button type="button" disabled={actionLoading} onClick={() => onRecordAction(next.recommendation, false)} className="min-h-12 rounded-lg px-3 py-2 font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60">{t('actions.couldNot')}</button>
        </div>
      )}
      {done && <Notice tone="success" className="mt-3">{t('risk.actionRecorded')}</Notice>}
    </Card>
  );
}

function ImportantAlert({ alerts = [] }) {
  const { t, tx, lang } = useI18n();
  const open = alerts
    .filter((a) => a.status !== 'RESOLVED' && ['HIGH', 'CRITICAL'].includes(a.severity))
    .sort((a, b) => levelRank(b.severity) - levelRank(a.severity) || new Date(b.createdAt) - new Date(a.createdAt))[0];
  if (!open) return null;
  const Icon = LEVEL_ICON[open.severity] || BellRing;
  return (
    <Card className={cx('mt-4 flex gap-3 border-2 p-4', riskStyle(open.severity).border)} role="alert">
      <Icon className={cx('mt-0.5 h-6 w-6 shrink-0', riskStyle(open.severity).text)} aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('farmer.dashboard.importantAlert')} · {t(`risk.levelLong.${open.severity}`)}</p>
        <p className="font-semibold text-slate-900">{tx(open, 'title')}</p>
        <p className="text-sm text-slate-700">{tx(open, 'message')}</p>
        <p className="mt-1 text-xs text-slate-500">{timeAgo(open.createdAt, lang)}</p>
      </div>
    </Card>
  );
}

const CONDITION = { GOOD: 'good', FAIR: 'fair', POOR: 'poor' };

function DashboardBody({ ff }) {
  const { t, lang } = useI18n();
  const { farm, farmId } = ff;
  const invalidate = useInvalidateFarm();
  const [recorded, setRecorded] = useState(null);

  const risksQ = useQuery({ queryKey: ['risks', farmId], queryFn: () => farmApi.risks(farmId) });
  const alertsQ = useQuery({ queryKey: ['farmAlerts', farmId], queryFn: () => farmApi.alerts(farmId) });
  const recordAction = useRecordAction(farmId);

  const onRecordAction = (rec, taken) => {
    setRecorded(null);
    recordAction.mutate({ recommendationId: rec.id, actionTaken: taken }, { onSuccess: (data) => setRecorded(data.action) });
  };

  const risk = risksQ.data;
  const cycle = farm.currentCycle;
  const forecast = farm.forecast;
  const lastObs = farm.lastObservation;

  return (
    <div>
      <FarmSwitcher ff={ff} />

      {/* Farm, crop age, expected harvest */}
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
              <p className="text-xs font-semibold text-ocean-700">{t('common.expectedHarvest')}</p>
              <p className="text-lg font-bold leading-tight text-slate-900">
                {cycle.daysToHarvest != null && cycle.daysToHarvest <= 0 ? t('farmer.dashboard.harvestNow') : fmtDate(forecast?.expectedHarvestDate || cycle.expectedHarvestDate, lang)}
              </p>
              {forecast && <p className="text-sm text-slate-600">{t('farmer.dashboard.about', { kg: kg(forecast.riskAdjustedQuantityKg) })}</p>}
            </div>
          </div>
        ) : (
          <Notice tone="info" className="mt-3" icon={CalendarClock}>
            {t('farmer.dashboard.noCycle')} <Link to="/farmer/farm" className="font-semibold underline">{t('farmer.farm.recordPlanting')}</Link>
          </Notice>
        )}
      </Card>

      {/* Current risk + why (the card carries its own heading) */}
      <div className="mt-4" />
      {risksQ.isLoading ? <div className="flex justify-center p-6"><Spinner /></div>
        : risksQ.error ? <ErrorState error={risksQ.error} onRetry={risksQ.refetch} compact />
        : <CurrentRiskCard risk={risk} />}

      {/* Next action + when */}
      <SectionTitle>{t('farmer.dashboard.nextAction')}</SectionTitle>
      {risk && (
        <div className="space-y-2">
          <NextActionSimple risk={risk} onRecordAction={onRecordAction} actionLoading={recordAction.isPending} />
          <FormError error={recordAction.error} />
          <ActionRecordedNotice action={recorded} onClose={() => setRecorded(null)} />
        </div>
      )}

      {/* The single most important open alert */}
      {alertsQ.data && <ImportantAlert alerts={alertsQ.data.alerts} />}

      {/* Main actions */}
      <div className="mt-6 grid grid-cols-2 gap-2.5">
        <BigLink to="/farmer/risk" icon={Eye}>{t('actions.inspectFarm')}</BigLink>
        <BigLink to="/farmer/observations" icon={ClipboardList}>{t('actions.recordSymptoms')}</BigLink>
        <BigLink to="/farmer/harvest" icon={Truck} tone="green">{t('actions.recordHarvest')}</BigLink>
        <BigLink to="/farmer/assistant" icon={Bot} tone="light">{t('actions.askAI')}</BigLink>
      </div>

      {/* Recent observation */}
      <SectionTitle>{t('farmer.dashboard.recentObservation')}</SectionTitle>
      <Card className="p-4">
        {lastObs ? (
            <p className="text-slate-800">
              <span className="font-semibold">{t(`farmer.dashboard.condition.${CONDITION[lastObs.cropCondition] || 'fair'}`)}</span>
              {' · '}{timeAgo(lastObs.observedAt, lang)}
              {[lastObs.whitening && t('farmer.dashboard.symptom.whitening'), lastObs.breakage && t('farmer.dashboard.symptom.breakage'), lastObs.epiphytes && t('farmer.dashboard.symptom.epiphytes')].filter(Boolean).map((s) => <span key={s} className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-sm text-amber-800">{s}</span>)}
            </p>
          ) : (
            <p className="text-slate-600">{t('farmer.dashboard.noObservation')} <Link to="/farmer/observations" className="font-semibold text-ocean-700">{t('actions.recordSymptoms')} →</Link></p>
          )}
      </Card>

      {/* Technical details — hidden by default */}
      {risk && <DetailsSection risk={risk} farmId={farmId} alertsQ={alertsQ} onRecalculated={() => invalidate(farmId)} />}
    </div>
  );
}

function DetailsSection({ risk, farmId, alertsQ, onRecalculated }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const envQ = useQuery({ queryKey: ['env', farmId], queryFn: () => environmentApi.current(farmId), enabled: open });
  const recalc = useMutation({ mutationFn: () => farmApi.runRisks(farmId), onSuccess: onRecalculated });
  return (
    <div className="mt-6">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="dashboard-details"
        className="flex min-h-12 w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left font-semibold text-ocean-800 ring-1 ring-slate-200 hover:bg-slate-50">
        {t('farmer.dashboard.details')}
        <ChevronDown className={cx('h-5 w-5 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id="dashboard-details" className="mt-3 space-y-4">
          <div>
            <SectionTitle>{t('farmer.dashboard.currentRisks')}</SectionTitle>
            <RiskTiles predictions={risk.predictions} linkTo="/farmer/risk" />
          </div>
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5"><BrainCircuit className="h-4 w-4 text-ocean-600" aria-hidden />{t('farmer.dashboard.model')}: <strong className="text-slate-800">{risk.modelStatus?.label || '—'}</strong></span>
              <span>{t('farmer.dashboard.calculated', { time: dateTime(risk.calculatedAt, lang) })}</span>
              <Button variant="secondary" size="sm" icon={RefreshCw} className="min-h-11 sm:ml-auto" loading={recalc.isPending} onClick={() => recalc.mutate()}>{t('actions.recalculate')}</Button>
            </div>
            {recalc.isSuccess && <p className="mt-2 text-sm font-medium text-seaweed-700">{t('farmer.dashboard.recalculated')}</p>}
            <FormError error={recalc.error} />
          </Card>
          <div>
            <SectionTitle>{t('farmer.dashboard.environment')}</SectionTitle>
            <Card className="p-3">
              {envQ.isLoading ? <div className="flex justify-center p-4"><Spinner /></div>
                : envQ.error ? <ErrorState error={envQ.error} onRetry={envQ.refetch} compact />
                : envQ.data?.current ? <EnvironmentSummary env={envQ.data.current} compact />
                : <p className="flex items-center gap-2 text-sm text-slate-500"><Waves className="h-4 w-4" aria-hidden />{t('common.noData')}</p>}
            </Card>
          </div>
          <div>
            <SectionTitle>{t('farmer.dashboard.alerts')}</SectionTitle>
            {alertsQ.isLoading ? <div className="flex justify-center p-4"><Spinner /></div>
              : alertsQ.error ? <ErrorState error={alertsQ.error} onRetry={alertsQ.refetch} compact />
              : <AlertList alerts={alertsQ.data?.alerts} farmId={farmId} />}
          </div>
        </div>
      )}
    </div>
  );
}
