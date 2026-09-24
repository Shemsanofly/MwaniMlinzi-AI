import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, BellRing, CheckCircle2, ClipboardList, Flag, Hand, Sprout, Target, TrendingDown, Truck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useFarmerFarm } from '../../hooks/useFarmerFarm.js';
import { farmApi } from '../../api/endpoints.js';
import { Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Notice, PageHeader, RiskBadge, Spinner, cx } from '../../components/ui/index.jsx';
import { dateTime, date as fmtDate, kg, num, pct } from '../../utils/format.js';
import { riskStyle } from '../../utils/risk.js';
import { FarmGate, FarmSwitcher, SectionTitle, useInvalidateFarm } from './components/shared.jsx';
import { RecStatusBadge, ValidationBadge } from './components/RecommendationPanel.jsx';

const TYPES = ['OBSERVATION', 'HARVEST', 'LOSS', 'ACTION', 'OUTCOME', 'ALERT', 'PLANTING', 'PREDICTION'];
const ICON = { OBSERVATION: ClipboardList, HARVEST: Truck, LOSS: TrendingDown, ACTION: Hand, OUTCOME: Target, ALERT: BellRing, PLANTING: Sprout, PREDICTION: Activity };
const TONE = {
  OBSERVATION: 'bg-ocean-100 text-ocean-800', HARVEST: 'bg-seaweed-100 text-seaweed-700', LOSS: 'bg-red-100 text-red-800', ACTION: 'bg-sky-100 text-sky-800',
  OUTCOME: 'bg-violet-100 text-violet-800', ALERT: 'bg-orange-100 text-orange-800', PLANTING: 'bg-seaweed-100 text-seaweed-700', PREDICTION: 'bg-amber-100 text-amber-800',
};
const OUTCOMES = ['NO_LOSS', 'MINOR_LOSS', 'MAJOR_LOSS', 'TOTAL_LOSS', 'HARVESTED'];

export default function HistoryPage() {
  const { t } = useI18n();
  const ff = useFarmerFarm();
  return (
    <div>
      <PageHeader title={t('farmer.history.title')} subtitle={t('farmer.history.subtitle')} />
      {ff.farm ? <HistoryBody ff={ff} /> : <FarmGate ff={ff} />}
    </div>
  );
}

function HistoryBody({ ff }) {
  const { farmId } = ff;
  return (
    <div>
      <FarmSwitcher ff={ff} />
      <FeedbackLoop farmId={farmId} />
      <Timeline farmId={farmId} />
    </div>
  );
}

/** Human-readable description for each timeline event. */
function useDescribe() {
  const { t, tx } = useI18n();
  const yes = (b, key) => (b ? t(key) : null);
  return (e) => {
    const d = e.data || {};
    switch (e.type) {
      case 'OBSERVATION': {
        const signs = [yes(d.whitening, 'farmer.obs.sign.whitening'), yes(d.breakage, 'farmer.obs.sign.breakage'), yes(d.unusualGrowth, 'farmer.obs.sign.unusualGrowth'), yes(d.epiphytes, 'farmer.obs.sign.epiphytes')].filter(Boolean);
        return { title: t('farmer.history.ev.observation', { cond: t(`farmer.enums.cropCondition.${d.cropCondition}`) }), detail: signs.length ? signs.join(' · ') : t('farmer.obs.noSigns') };
      }
      case 'HARVEST':
        return { title: t('farmer.history.ev.harvest', { qty: kg(d.actualQuantity) }), detail: [d.lossPercent != null && t('farmer.history.ev.lossPct', { n: num(d.lossPercent, 1) }), d.qualityGrade && t(`farmer.enums.grade.${d.qualityGrade}`)].filter(Boolean).join(' · ') };
      case 'LOSS':
        return { title: t('farmer.history.ev.loss', { cause: t(`farmer.enums.cause.${d.cause}`) }), detail: t('farmer.harvest.lostPct', { n: num(d.percentLost, 1) }) };
      case 'ACTION':
        return { title: d.actionTaken ? t('farmer.history.ev.actionDone') : t('farmer.history.ev.actionNotDone'), detail: tx(d, 'description') };
      case 'OUTCOME':
        return { title: t('farmer.history.ev.outcome', { type: t(`farmer.enums.outcome.${d.outcomeType}`) }), detail: d.lossPercent != null ? t('farmer.history.ev.lossPct', { n: num(d.lossPercent, 1) }) : '' };
      case 'ALERT':
        return { title: tx(d, 'title'), detail: tx(d, 'message'), level: d.severity };
      case 'PLANTING':
        return { title: t('farmer.history.ev.planting', { n: d.linesPlanted }), detail: t(`farmer.enums.cycleStatus.${d.status}`) };
      case 'PREDICTION':
        return { title: t('farmer.history.ev.prediction', { type: t(`risk.type.${d.riskType}`), level: t(`risk.level.${d.riskLevel}`), p: pct(d.probability) }), detail: tx(d, 'explanation'), level: d.riskLevel };
      default:
        return { title: e.type, detail: '' };
    }
  };
}

function Timeline({ farmId }) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('ALL');
  const [limit, setLimit] = useState(30);
  const describe = useDescribe();
  const q = useQuery({ queryKey: ['history', farmId], queryFn: () => farmApi.history(farmId) });
  const events = useMemo(() => (q.data?.events || []).filter((e) => filter === 'ALL' || e.type === filter), [q.data, filter]);

  return (
    <section aria-labelledby="timeline-title">
      <SectionTitle id="timeline-title">{t('farmer.history.timeline')}</SectionTitle>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={t('actions.filter')}>
        {['ALL', ...TYPES].map((ty) => (
          <button key={ty} type="button" aria-pressed={filter === ty} onClick={() => { setFilter(ty); setLimit(30); }}
            className={cx('min-h-11 shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 ring-inset', filter === ty ? 'bg-ocean-700 text-white ring-ocean-700' : 'bg-white text-slate-700 ring-slate-300')}>
            {ty === 'ALL' ? t('common.all') : t(`farmer.enums.event.${ty}`)}
          </button>
        ))}
      </div>
      {q.isLoading ? <div className="flex justify-center p-6"><Spinner /></div>
        : q.error ? <ErrorState error={q.error} onRetry={q.refetch} compact />
        : !events.length ? <EmptyState title={t('farmer.history.noEvents')} />
        : (
          <>
            <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
              {events.slice(0, limit).map((e) => {
                const Icon = ICON[e.type] || Activity;
                const d = describe(e);
                return (
                  <li key={`${e.type}-${e.id}`} className="relative">
                    <span className={cx('absolute -left-[33px] top-2 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-sand-50', TONE[e.type])}>
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <Card className={cx('p-3', d.level && `border-l-4 ${riskStyle(d.level).border}`)}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge className={cx(TONE[e.type], 'ring-transparent')}>{t(`farmer.enums.event.${e.type}`)}</Badge>
                        <time className="text-xs text-slate-500" dateTime={e.date}>{dateTime(e.date, lang)}</time>
                      </div>
                      <p className="mt-1.5 font-semibold text-slate-900">{d.title}</p>
                      {d.detail && <p className="mt-0.5 text-sm text-slate-600">{d.detail}</p>}
                    </Card>
                  </li>
                );
              })}
            </ol>
            {events.length > limit && (
              <Button variant="secondary" className="mt-3 min-h-11 w-full" onClick={() => setLimit((l) => l + 30)}>{t('farmer.history.showMore', { n: events.length - limit })}</Button>
            )}
          </>
        )}
    </section>
  );
}

function FeedbackLoop({ farmId }) {
  const { t, tx, lang } = useI18n();
  const [params] = useSearchParams();
  const focusAction = params.get('action');
  const recsQ = useQuery({ queryKey: ['recommendations', farmId], queryFn: () => farmApi.recommendations(farmId) });
  const actionsQ = useQuery({ queryKey: ['actions', farmId], queryFn: () => farmApi.actions(farmId) });
  const outcomesQ = useQuery({ queryKey: ['outcomes', farmId], queryFn: () => farmApi.outcomes(farmId) });

  useEffect(() => {
    if (focusAction && actionsQ.data) document.getElementById(`action-${focusAction}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [focusAction, actionsQ.data]);

  const actions = actionsQ.data?.actions || [];
  const pending = actions.filter((a) => !a.outcomes?.length);

  return (
    <section aria-labelledby="feedback-title">
      <SectionTitle id="feedback-title">{t('farmer.history.feedback')}</SectionTitle>
      <Notice tone="info" icon={Target} className="mb-3">{t('farmer.history.feedbackWhy')}</Notice>

      {/* Actions needing an outcome */}
      <h3 className="mb-2 mt-4 font-semibold text-slate-800" id="outcomes">{t('farmer.history.actionsTitle')}</h3>
      {actionsQ.isLoading ? <div className="flex justify-center p-4"><Spinner /></div>
        : actionsQ.error ? <ErrorState error={actionsQ.error} onRetry={actionsQ.refetch} compact />
        : !actions.length ? <EmptyState title={t('farmer.history.noActions')} />
        : (
          <ul className="space-y-2">
            {pending.length === 0 && <li><p className="text-sm text-seaweed-700">{t('farmer.history.allOutcomes')}</p></li>}
            {actions.slice(0, 15).map((a) => (
              <li key={a.id} id={`action-${a.id}`}>
                <ActionItem action={a} farmId={farmId} autoOpen={a.id === focusAction} />
              </li>
            ))}
          </ul>
        )}

      {/* Outcomes */}
      <h3 className="mb-2 mt-5 font-semibold text-slate-800">{t('farmer.history.outcomesTitle')}</h3>
      {outcomesQ.isLoading ? <div className="flex justify-center p-4"><Spinner /></div>
        : outcomesQ.error ? <ErrorState error={outcomesQ.error} onRetry={outcomesQ.refetch} compact />
        : !(outcomesQ.data?.outcomes || []).length ? <EmptyState title={t('farmer.history.noOutcomes')} />
        : (
          <ul className="space-y-2">
            {outcomesQ.data.outcomes.slice(0, 15).map((o) => (
              <li key={o.id}>
                <Card className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{t(`farmer.enums.outcome.${o.outcomeType}`)}{o.lossPercent != null && <span className="font-normal text-slate-600"> · {t('farmer.history.ev.lossPct', { n: num(o.lossPercent, 1) })}</span>}</p>
                    <span className="text-xs text-slate-500">{fmtDate(o.outcomeDate, lang)}</span>
                  </div>
                  {o.recommendation?.actionLibrary && <p className="mt-0.5 text-sm text-slate-600">{tx(o.recommendation.actionLibrary, 'action')}</p>}
                  {o.prediction ? (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      {t('farmer.history.predicted')}: {t(`risk.type.${o.prediction.riskType}`)} <RiskBadge level={o.prediction.riskLevel} /> {pct(o.prediction.probability)}
                    </p>
                  ) : <p className="mt-1 text-xs text-slate-500">{t('farmer.history.noLinkedPrediction')}</p>}
                  {o.notes && <p className="mt-1 text-sm text-slate-700">{o.notes}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}

      {/* Recommendations */}
      <h3 className="mb-2 mt-5 font-semibold text-slate-800">{t('farmer.history.recsTitle')}</h3>
      {recsQ.isLoading ? <div className="flex justify-center p-4"><Spinner /></div>
        : recsQ.error ? <ErrorState error={recsQ.error} onRetry={recsQ.refetch} compact />
        : !(recsQ.data?.recommendations || []).length ? <EmptyState title={t('farmer.history.noRecs')} />
        : (
          <ul className="space-y-2">
            {recsQ.data.recommendations.slice(0, 10).map((r) => (
              <li key={r.id}>
                <Card className="p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {r.riskType && <span className="text-xs font-semibold text-slate-500">{t(`risk.type.${r.riskType}`)}</span>}
                    {r.prediction?.riskLevel && <RiskBadge level={r.prediction.riskLevel} />}
                    <RecStatusBadge status={r.status} />
                    {r.actionItem && <ValidationBadge validated={r.actionItem.validated} source={r.actionItem.source} />}
                  </div>
                  <p className="mt-1 font-medium text-slate-900">{r.actionItem ? tx(r.actionItem, 'action') : '—'}</p>
                  <p className="text-xs text-slate-500">{dateTime(r.createdAt, lang)}</p>
                  {r.reviewNote && <p className="mt-1 text-sm text-ocean-900"><Flag className="mr-1 inline h-3.5 w-3.5" aria-hidden />{r.reviewNote}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

function ActionItem({ action, farmId, autoOpen }) {
  const { t, tx, lang } = useI18n();
  const [open, setOpen] = useState(autoOpen);
  const done = action.outcomes?.length > 0;
  const text = action.recommendation?.actionLibrary ? tx(action.recommendation.actionLibrary, 'action') : action.description;
  return (
    <Card className={cx('p-3', autoOpen && 'ring-2 ring-ocean-400')}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={action.actionTaken ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-slate-100 text-slate-700 ring-slate-200'}>
          {action.actionTaken ? t('farmer.history.ev.actionDone') : t('farmer.history.ev.actionNotDone')}
        </Badge>
        <span className="text-xs text-slate-500">{dateTime(action.performedAt, lang)}</span>
        {done && <Badge className="ml-auto bg-violet-50 text-violet-800 ring-violet-300"><CheckCircle2 className="h-3 w-3" aria-hidden />{t(`farmer.enums.outcome.${action.outcomes[0].outcomeType}`)}</Badge>}
      </div>
      <p className="mt-1 text-sm font-medium text-slate-900">{text}</p>
      {!done && !open && (
        <Button variant="secondary" icon={Target} className="mt-2 min-h-11" onClick={() => setOpen(true)}>{t('farmer.history.recordOutcome')}</Button>
      )}
      {!done && open && <OutcomeForm farmId={farmId} actionId={action.id} onCancel={() => setOpen(false)} />}
    </Card>
  );
}

function OutcomeForm({ farmId, actionId, onCancel }) {
  const { t } = useI18n();
  const invalidate = useInvalidateFarm();
  const [outcomeType, setOutcomeType] = useState('');
  const [lossPercent, setLossPercent] = useState('');
  const [notes, setNotes] = useState('');
  const needsPct = ['MINOR_LOSS', 'MAJOR_LOSS'].includes(outcomeType);
  const save = useMutation({
    mutationFn: () => farmApi.addOutcome(farmId, {
      farmerActionId: actionId,
      outcomeType,
      ...(lossPercent !== '' ? { lossPercent: Number(lossPercent) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    }),
    onSuccess: () => invalidate(farmId),
  });
  return (
    <form className="mt-3 space-y-3 border-t border-slate-100 pt-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <fieldset>
        <legend className="label">{t('farmer.history.whatHappened')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OUTCOMES.map((o) => (
            <button key={o} type="button" aria-pressed={outcomeType === o} onClick={() => setOutcomeType(o)}
              className={cx('min-h-12 rounded-lg px-3 py-2 text-left text-sm font-semibold ring-1 ring-inset', outcomeType === o ? 'bg-ocean-700 text-white ring-ocean-700' : 'bg-white text-slate-800 ring-slate-300 hover:bg-slate-50')}>
              {t(`farmer.enums.outcome.${o}`)}
            </button>
          ))}
        </div>
      </fieldset>
      {outcomeType && outcomeType !== 'NO_LOSS' && outcomeType !== 'HARVESTED' && (
        <Field label={t('farmer.history.lossPercent')} htmlFor={`op-${actionId}`} required={needsPct}>
          <input id={`op-${actionId}`} type="number" inputMode="decimal" min={0} max={100} className="input" value={lossPercent} required={needsPct} onChange={(e) => setLossPercent(e.target.value)} />
        </Field>
      )}
      <Field label={t('common.notes')} htmlFor={`on-${actionId}`}>
        <textarea id={`on-${actionId}`} rows={2} maxLength={2000} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <FormError error={save.error} />
      {save.isSuccess && <Notice tone="success" icon={CheckCircle2}>{t('farmer.history.outcomeSaved')}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="success" className="min-h-11" loading={save.isPending} disabled={!outcomeType}>{t('actions.save')}</Button>
        <Button variant="ghost" className="min-h-11" onClick={onCancel}>{t('actions.cancel')}</Button>
      </div>
    </form>
  );
}
