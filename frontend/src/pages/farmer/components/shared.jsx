import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCircle2, ChevronRight, MapPin, Sprout } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { farmApi, alertApi } from '../../../api/endpoints.js';
import { Badge, Button, DemoBadge, EmptyState, ErrorState, Notice, PageLoader, apiErrorMessage, cx } from '../../../components/ui/index.jsx';
import { RISK_TYPES, riskStyle } from '../../../utils/risk.js';
import { timeAgo } from '../../../utils/format.js';

/** Every query that depends on a farm's records — invalidated after any farmer mutation. */
export function useInvalidateFarm() {
  const qc = useQueryClient();
  return (farmId) => {
    const keys = ['risks', 'riskHistory', 'recommendations', 'actions', 'outcomes', 'history', 'farmAlerts', 'observations', 'harvests', 'losses', 'env', 'farm', 'cycles'];
    keys.forEach((k) => qc.invalidateQueries({ queryKey: [k, farmId] }));
    qc.invalidateQueries({ queryKey: ['farms'] });
    qc.invalidateQueries({ queryKey: ['alerts'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

/** Predictions in a fixed, predictable order (heat, storm, poor growth, harvest). */
export const sortPredictions = (predictions = []) => [...predictions].sort((a, b) => RISK_TYPES.indexOf(a.riskType) - RISK_TYPES.indexOf(b.riskType));

/** Loading / error / no-farm states shared by all farm-specific pages. Returns null when a farm is ready. */
export function FarmGate({ ff }) {
  const { t } = useI18n();
  if (ff.isLoading) return <PageLoader />;
  if (ff.error) return <ErrorState error={ff.error} onRetry={ff.refetch} />;
  if (!ff.farm) {
    return (
      <EmptyState
        icon={Sprout}
        title={t('farmer.noFarm.title')}
        message={t('farmer.noFarm.message')}
        action={<Link to="/farmer/farm" className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-ocean-700 px-5 py-3 font-semibold text-white hover:bg-ocean-800">{t('farmer.noFarm.cta')}</Link>}
      />
    );
  }
  return null;
}

/** Compact farm switcher — only shown when the farmer has more than one farm. */
export function FarmSwitcher({ ff, className }) {
  const { t } = useI18n();
  const { farms, farm, selectFarm } = ff;
  if (!farm) return null;
  return (
    <div className={cx('mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2', className)}>
      <MapPin className="h-4 w-4 shrink-0 text-ocean-600" aria-hidden />
      {farms.length > 1 ? (
        <>
          <label htmlFor="farm-switcher" className="sr-only">{t('farmer.switcher.label')}</label>
          <select
            id="farm-switcher"
            className="min-h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent py-2 pr-8 text-base font-semibold text-slate-900 focus:ring-2 focus:ring-ocean-200"
            value={farm.id}
            onChange={(e) => selectFarm(e.target.value)}
          >
            {farms.map((f) => <option key={f.id} value={f.id}>{f.farmCode} — {f.name}</option>)}
          </select>
        </>
      ) : (
        <p className="min-w-0 flex-1 truncate py-2 text-base font-semibold text-slate-900">{farm.farmCode} — {farm.name}</p>
      )}
      {farm.isDemo && <DemoBadge label={t('common.demoFarm')} />}
    </div>
  );
}

/** Large, touch-friendly navigation button. */
export function BigLink({ to, icon: Icon, children, tone = 'ocean' }) {
  const tones = {
    ocean: 'bg-ocean-700 text-white hover:bg-ocean-800',
    green: 'bg-seaweed-600 text-white hover:bg-seaweed-700',
    light: 'bg-white text-ocean-800 ring-1 ring-inset ring-ocean-200 hover:bg-ocean-50',
  };
  return (
    <Link to={to} className={cx('flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold shadow-sm transition', tones[tone])}>
      {Icon && <Icon className="h-6 w-6 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="h-5 w-5 shrink-0 opacity-70" aria-hidden />
    </Link>
  );
}

/** Records "I did this" / "Could not do it" for a recommendation and refreshes all farm data. */
export function useRecordAction(farmId) {
  const invalidate = useInvalidateFarm();
  return useMutation({
    mutationFn: ({ recommendationId, actionTaken }) => farmApi.addAction(farmId, { recommendationId, actionTaken }),
    onSuccess: () => invalidate(farmId),
  });
}

/** Confirmation shown after an action is recorded, with a prompt to record the outcome later. */
export function ActionRecordedNotice({ action, onClose }) {
  const { t } = useI18n();
  if (!action) return null;
  return (
    <Notice tone="success" icon={CheckCircle2}>
      <p className="font-semibold">{action.actionTaken ? t('farmer.action.recordedDone') : t('farmer.action.recordedNotDone')}</p>
      <p className="mt-1">{t('farmer.action.outcomePrompt')}</p>
      <div className="mt-2 flex flex-wrap gap-3">
        <Link to={`/farmer/history?action=${action.id}#outcomes`} className="inline-flex min-h-11 items-center font-semibold text-ocean-800 underline">{t('farmer.action.recordOutcomeLink')}</Link>
        {onClose && <button type="button" onClick={onClose} className="min-h-11 font-semibold text-slate-600">{t('farmer.action.later')}</button>}
      </div>
    </Notice>
  );
}

/** Farm alerts with severity colour and an acknowledge button. */
export function AlertList({ alerts = [], farmId, limit = 5 }) {
  const { t, tx, lang } = useI18n();
  const invalidate = useInvalidateFarm();
  const ack = useMutation({
    mutationFn: (id) => alertApi.update(id, 'ACKNOWLEDGED'),
    onSuccess: () => invalidate(farmId),
  });
  const active = alerts.filter((a) => a.status === 'ACTIVE').slice(0, limit);
  if (!active.length) return <p className="text-sm text-slate-500">{t('farmer.alerts.none')}</p>;
  return (
    <ul className="space-y-2">
      {active.map((a) => {
        const s = riskStyle(a.severity);
        return (
          <li key={a.id} className={cx('rounded-lg border-l-4 bg-white p-3 shadow-sm ring-1 ring-slate-200', s.border)}>
            <div className="flex items-start gap-2">
              <BellRing className={cx('mt-0.5 h-4 w-4 shrink-0', s.text)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{tx(a, 'title')}</p>
                <p className="mt-0.5 text-sm text-slate-600">{tx(a, 'message')}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge className={s.badge}>{t(`risk.level.${a.severity}`)}</Badge>
                  <span className="text-xs text-slate-500">{timeAgo(a.createdAt, lang)}</span>
                  <Button size="sm" variant="secondary" className="ml-auto min-h-11" loading={ack.isPending && ack.variables === a.id} onClick={() => ack.mutate(a.id)}>
                    {t('actions.acknowledge')}
                  </Button>
                </div>
              </div>
            </div>
          </li>
        );
      })}
      {ack.error && <li><Notice tone="danger">{apiErrorMessage(ack.error, t, lang)}</Notice></li>}
    </ul>
  );
}

/** Section heading used across farmer pages. */
export function SectionTitle({ children, action, id }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-2" id={id}>
      <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">{children}</h2>
      {action}
    </div>
  );
}

/** Helpers for form values → API body. */
export const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
export const numOrUndef = (v) => (v === '' || v == null ? undefined : Number(v));
