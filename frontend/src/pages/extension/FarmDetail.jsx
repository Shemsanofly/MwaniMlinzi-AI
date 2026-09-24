import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Bell, CalendarDays, ClipboardList, Flag, History, Info, ListChecks, MapPin, MessageSquarePlus, RefreshCw, ShieldAlert, ShieldCheck, StickyNote, Thermometer, Waves, Wind,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../stores/AuthContext.jsx';
import { farmApi } from '../../api/endpoints.js';
import FarmMap from '../../components/map/FarmMap.jsx';
import { EnvironmentSummary, NextActionCard, RiskCard, ModelStatusBadge } from '../../components/risk/RiskComponents.jsx';
import {
  Badge, Button, Card, DemoBadge, EmptyState, ErrorState, Field, FormError, Notice, PageHeader, PageLoader, RiskBadge, SourceBadge, Spinner, Table, cx,
} from '../../components/ui/index.jsx';
import { RISK_LEVELS } from '../../utils/risk.js';
import { date, dateTime, isoDate, num, pct, timeAgo, tzs } from '../../utils/format.js';
import { EnvLineChart, SERIES } from './components/charts.jsx';
import { AlertList, FlagPredictionModal, Section, SuccessNote, useStaffBase } from './components/common.jsx';
import { ObservationCard } from './components/ReviewCards.jsx';

const TABS = ['overview', 'risk', 'recommendations', 'observations', 'records', 'alerts', 'notes'];

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children ?? '—'}</dd>
    </div>
  );
}

function Loading({ q, children }) {
  if (q.isLoading) return <div className="flex justify-center p-6"><Spinner /></div>;
  if (q.error) return <ErrorState compact error={q.error} onRetry={q.refetch} />;
  return children;
}

/* ───────── Overview ───────── */
function OverviewTab({ farm, base }) {
  const { t, tx, lang } = useI18n();
  const env = useQuery({ queryKey: ['environment', farm.id, 30], queryFn: () => farmApi.environment(farm.id, { days: 30 }) });
  const c = farm.currentCycle;
  const f = farm.forecast;
  const history = env.data?.history || [];
  const sources = [...new Set(history.map((h) => h.source).filter(Boolean))];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t('extension.farm.profile')} icon={Info} className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Detail label={t('common.farmer')}>{farm.farmer?.fullName}{farm.farmer?.phone && <span className="block text-xs text-slate-500">{farm.farmer.phone}</span>}</Detail>
            <Detail label={t('common.cooperative')}>{farm.cooperative?.name || t('extension.shared.independent')}</Detail>
            <Detail label={t('extension.farm.species')}>{farm.species ? tx(farm.species, 'commonName') : '—'}{farm.species?.scientificName && <span className="block text-xs italic text-slate-500">{farm.species.scientificName}</span>}</Detail>
            <Detail label={t('extension.farm.method')}>{farm.farmingMethod ? t(`extension.farm.methods.${farm.farmingMethod}`) : '—'}</Detail>
            <Detail label={t('extension.farm.exposure')}>{farm.exposure ? t(`extension.farm.exposures.${farm.exposure}`) : '—'}</Detail>
            <Detail label={t('extension.farm.anchoring')}>{farm.anchoringMethod ? t(`extension.farm.anchors.${farm.anchoringMethod}`) : '—'}</Detail>
            <Detail label={t('extension.farm.lines')}>{farm.lineCount != null ? num(farm.lineCount, 0) : '—'}</Detail>
            <Detail label={t('extension.farm.area')}>{farm.areaHectares != null ? `${num(farm.areaHectares, 2)} ha` : '—'}</Detail>
            <Detail label={t('extension.farm.location')}>{[farm.location?.locationName, farm.location?.district, farm.location?.region].filter(Boolean).join(', ') || '—'}</Detail>
          </dl>
          {farm.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{farm.notes}</p>}
        </Section>
        <Section title={t('extension.farm.cycle')} icon={CalendarDays}>
          {c ? (
            <dl className="grid grid-cols-2 gap-4">
              <Detail label={t('common.cropAge')}><span className="text-2xl font-bold">{c.cropAgeDays}</span> {t('extension.farm.daysUnit')}</Detail>
              <Detail label={t('extension.farm.daysToHarvest')}>{c.daysToHarvest != null ? (c.daysToHarvest >= 0 ? t('common.days', { n: c.daysToHarvest }) : t('extension.farm.overdueBy', { n: Math.abs(c.daysToHarvest) })) : '—'}</Detail>
              <Detail label={t('common.plantingDate')}>{date(c.plantingDate, lang)}</Detail>
              <Detail label={t('common.expectedHarvest')}>{date(c.expectedHarvestDate, lang)}</Detail>
              <Detail label={t('extension.farm.linesPlanted')}>{num(c.linesPlanted, 0)}</Detail>
            </dl>
          ) : <p className="text-sm text-slate-500">{t('extension.farm.noCycle')}</p>}
          {f && (
            <div className="mt-4 rounded-lg border border-ocean-100 bg-ocean-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ocean-800">{t('extension.farm.forecast')}</p>
              <p className="text-xl font-bold text-slate-900">{num(f.riskAdjustedQuantityKg, 0)} kg</p>
              <p className="text-xs text-slate-600">{t('common.range')}: {num(f.lowQuantityKg, 0)}–{num(f.highQuantityKg, 0)} kg · {t('risk.confidence')}: {pct(f.confidence)}</p>
              <p className="text-xs text-slate-600">{date(f.expectedHarvestDate, lang)}</p>
            </div>
          )}
        </Section>
      </div>

      <Section title={t('extension.farm.environment')} icon={Thermometer} action={env.data?.current && <SourceBadge source={env.data.current.source} />}>
        <Loading q={env}>
          {env.data?.current ? <EnvironmentSummary env={env.data.current} /> : <EmptyState title={t('extension.farm.noEnvironment')} />}
          {history.length > 1 && (
            <div className="mt-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-semibold text-slate-800">{t('extension.farm.envHistory', { n: history.length })}</h4>
                {sources.map((s) => <SourceBadge key={s} source={s} />)}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="flex items-center gap-1 text-xs font-medium text-slate-600"><Thermometer className="h-3.5 w-3.5" aria-hidden />{t('extension.farm.sstAnomaly')}</p>
                  <EnvLineChart data={history} dataKey="sstAnomalyC" name={t('extension.farm.sstAnomaly')} unit="°C" color="#ea580c" referenceZero />
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs font-medium text-slate-600"><Waves className="h-3.5 w-3.5" aria-hidden />{t('extension.farm.waveHeight')}</p>
                  <EnvLineChart data={history} dataKey="waveHeightM" name={t('extension.farm.waveHeight')} unit="m" color={SERIES.primary} />
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs font-medium text-slate-600"><Wind className="h-3.5 w-3.5" aria-hidden />{t('extension.farm.wind')}</p>
                  <EnvLineChart data={history} dataKey="windSpeedKmh" name={t('extension.farm.wind')} unit="km/h" color={SERIES.secondary} />
                </div>
              </div>
            </div>
          )}
        </Loading>
      </Section>

      <Section title={t('extension.farm.map')} icon={MapPin} bodyClassName="p-2 sm:p-3">
        {farm.location ? <FarmMap farms={[farm]} height={300} key={farm.id} /> : <EmptyState title={t('extension.farm.noLocation')} />}
        <p className="px-1 pt-1 text-xs text-slate-500">
          <Link to={base === '/extension' ? '/extension/risk-map' : '/cooperative/map'} className="font-semibold text-ocean-700 hover:underline">{t('extension.farm.allOnMap')} →</Link>
        </p>
      </Section>
    </div>
  );
}

/* ───────── Risk ───────── */
function RiskTab({ farm, canFlag }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [flagging, setFlagging] = useState(null);
  const [message, setMessage] = useState(null);
  const q = useQuery({ queryKey: ['risks', farm.id], queryFn: () => farmApi.risks(farm.id) });
  const run = useMutation({
    mutationFn: () => farmApi.runRisks(farm.id),
    onSuccess: () => {
      setMessage(t('extension.farm.recalculated'));
      ['risks', 'farm', 'farms', 'recommendations', 'farmAlerts', 'coopDashboard', 'extDashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
  const data = q.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          {data?.modelStatus && <ModelStatusBadge label={data.modelStatus.label} />}
          {data?.calculatedAt && <span>{t('common.lastUpdated', { time: dateTime(data.calculatedAt, lang) })}</span>}
        </div>
        <Button icon={RefreshCw} loading={run.isPending} onClick={() => { setMessage(null); run.mutate(); }}>{t('actions.recalculate')}</Button>
      </div>
      <SuccessNote onClose={() => setMessage(null)}>{message}</SuccessNote>
      <FormError error={run.error} />
      <Loading q={q}>
        {data && (
          <>
            {data.predictions.some((p) => p.dataSource === 'DEMO') && <Notice tone="demo">{t('extension.farm.demoDataNote')}</Notice>}
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <NextActionCard nextAction={data.nextAction} insufficientDataMessage={data.insufficientDataMessage} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
                {data.predictions.length === 0 && <EmptyState title={t('extension.farm.noPredictions')} />}
                {data.predictions.map((p) => (
                  <div key={p.id} className="space-y-2">
                    <RiskCard prediction={p} />
                    {canFlag && (
                      <Button size="sm" variant="ghost" icon={Flag} onClick={() => setFlagging(p)} className="w-full">
                        {p.flagged ? t('extension.shared.flag.again') : t('extension.shared.flag.button')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Loading>
      <FlagPredictionModal prediction={flagging} open={!!flagging} onClose={() => setFlagging(null)} onDone={() => setMessage(t('extension.shared.flag.done'))} />
    </div>
  );
}

/* ───────── Recommendations ───────── */
function RecommendationsTab({ farm }) {
  const { t, tx, lang } = useI18n();
  const q = useQuery({ queryKey: ['recommendations', farm.id], queryFn: () => farmApi.recommendations(farm.id) });
  const columns = [
    { key: 'date', header: t('common.date'), render: (r) => <span className="whitespace-nowrap text-xs">{dateTime(r.createdAt, lang)}</span> },
    { key: 'risk', header: t('nav.risk'), render: (r) => <div className="space-y-1"><p className="text-xs">{t(`risk.type.${r.riskType || r.prediction?.riskType}`)}</p><RiskBadge level={r.prediction?.riskLevel} /> <span className="text-xs text-slate-500">{pct(r.prediction?.probability)}</span></div> },
    {
      key: 'action',
      header: t('extension.reviews.recommendedAction'),
      render: (r) => (
        <div className="min-w-56">
          <p className="font-medium text-slate-900">{tx(r.actionItem, 'action')}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {r.actionItem?.validated
              ? <Badge className="bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30"><ShieldCheck className="h-3 w-3" />{t('common.validated')}</Badge>
              : <Badge className="bg-amber-50 text-amber-800 ring-amber-300"><ShieldAlert className="h-3 w-3" />{t('common.pendingValidation')}</Badge>}
            {r.actionItem?.urgency && <Badge>{t(`urgency.${r.actionItem.urgency}`)}</Badge>}
          </div>
        </div>
      ),
    },
    { key: 'status', header: t('common.status'), render: (r) => <Badge className={r.status === 'COMPLETED' ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : undefined}>{t(`extension.shared.recStatus.${r.status}`)}</Badge> },
    { key: 'review', header: t('extension.farm.review'), render: (r) => <span className="text-xs">{t(`extension.shared.reviewStatus.${r.reviewStatus}`)}{r.reviewNote && <span className="block text-slate-500">“{r.reviewNote}”</span>}</span> },
    { key: 'farmer', header: t('extension.farm.farmerResponse'), render: (r) => (r.farmerActions?.length ? <span className="text-xs">{r.farmerActions[0].actionTaken ? t('extension.farm.didIt') : t('extension.farm.couldNot')} · {timeAgo(r.farmerActions[0].performedAt, lang)}</span> : <span className="text-xs text-slate-400">—</span>) },
    { key: 'due', header: t('extension.farm.dueBy'), render: (r) => <span className="whitespace-nowrap text-xs">{dateTime(r.dueBy, lang)}</span> },
  ];
  return (
    <Loading q={q}>
      <Table columns={columns} rows={q.data?.recommendations || []} empty={<EmptyState icon={ListChecks} title={t('extension.farm.noRecommendations')} />} />
    </Loading>
  );
}

/* ───────── Observations ───────── */
function ObservationsTab({ farm, canReview }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ['observations', farm.id], queryFn: () => farmApi.observations(farm.id) });
  const list = q.data?.observations || [];
  return (
    <Loading q={q}>
      {list.length === 0 ? <EmptyState icon={ClipboardList} title={t('extension.reviews.noObservations')} /> : (
        <div className="grid gap-3 lg:grid-cols-2">{list.map((o) => <ObservationCard key={o.id} obs={o} canReview={canReview} />)}</div>
      )}
    </Loading>
  );
}

/* ───────── Harvests, losses, outcomes ───────── */
function RecordsTab({ farm }) {
  const { t, lang } = useI18n();
  const harvests = useQuery({ queryKey: ['harvests', farm.id], queryFn: () => farmApi.harvests(farm.id) });
  const losses = useQuery({ queryKey: ['losses', farm.id], queryFn: () => farmApi.losses(farm.id) });
  const outcomes = useQuery({ queryKey: ['outcomes', farm.id], queryFn: () => farmApi.outcomes(farm.id) });
  const hCols = [
    { key: 'date', header: t('common.date'), render: (h) => <span className="whitespace-nowrap">{date(h.harvestDate, lang)}</span> },
    { key: 'actual', header: t('extension.farm.actual'), className: 'text-right', render: (h) => <b>{num(h.actualQuantity, 0)} {h.unit === 'KG_WET' ? t('extension.farm.kgWet') : t('extension.farm.kgDry')}</b> },
    { key: 'est', header: t('extension.farm.estimated'), className: 'text-right', render: (h) => (h.estimatedQuantity != null ? num(h.estimatedQuantity, 0) : '—') },
    { key: 'grade', header: t('coop.forecast.grade'), render: (h) => (h.qualityGrade ? <Badge>{h.qualityGrade}</Badge> : '—') },
    { key: 'loss', header: t('coop.outcomes.loss'), className: 'text-right', render: (h) => (h.lossPercent != null ? `${num(h.lossPercent, 1)}%` : '—') },
    { key: 'price', header: t('extension.farm.price'), className: 'text-right', render: (h) => (h.pricePerKg != null ? tzs(h.pricePerKg) : '—') },
  ];
  const lCols = [
    { key: 'date', header: t('common.date'), render: (l) => <span className="whitespace-nowrap">{date(l.lossDate, lang)}</span> },
    { key: 'cause', header: t('extension.farm.cause'), render: (l) => t(`extension.shared.lossCause.${l.cause}`) },
    { key: 'pct', header: t('coop.outcomes.loss'), className: 'text-right', render: (l) => `${num(l.percentLost, 1)}%` },
    { key: 'kg', header: 'kg', className: 'text-right', render: (l) => (l.quantityKg != null ? num(l.quantityKg, 0) : '—') },
    { key: 'notes', header: t('common.notes'), render: (l) => <span className="text-xs">{l.notes || '—'}</span> },
  ];
  const oCols = [
    { key: 'date', header: t('common.date'), render: (o) => <span className="whitespace-nowrap">{date(o.outcomeDate, lang)}</span> },
    { key: 'risk', header: t('coop.outcomes.risk'), render: (o) => (o.prediction ? <span className="flex flex-wrap items-center gap-1 text-xs">{t(`risk.type.${o.prediction.riskType}`)} <RiskBadge level={o.prediction.riskLevel} /></span> : '—') },
    { key: 'action', header: t('extension.farm.actionTaken'), render: (o) => <span className="text-xs">{o.farmerAction ? `${o.farmerAction.actionTaken ? t('extension.farm.didIt') : t('extension.farm.couldNot')}${o.farmerAction.notes ? ` — ${o.farmerAction.notes}` : ''}` : '—'}</span> },
    { key: 'type', header: t('coop.outcomes.result'), render: (o) => <Badge>{t(`extension.shared.outcomeType.${o.outcomeType}`)}</Badge> },
    { key: 'loss', header: t('coop.outcomes.loss'), className: 'text-right', render: (o) => (o.lossPercent != null ? `${num(o.lossPercent, 0)}%` : '—') },
    { key: 'mat', header: t('coop.outcomes.materialized'), render: (o) => (o.riskMaterialized == null ? '—' : o.riskMaterialized ? t('actions.yes') : t('actions.no')) },
  ];
  return (
    <div className="space-y-4">
      <Section title={t('extension.farm.harvests')} bodyClassName="p-0 sm:p-0"><Loading q={harvests}><Table columns={hCols} rows={harvests.data?.harvests || []} empty={<div className="p-4 text-sm text-slate-500">{t('extension.farm.noHarvests')}</div>} /></Loading></Section>
      <Section title={t('extension.farm.losses')} bodyClassName="p-0 sm:p-0"><Loading q={losses}><Table columns={lCols} rows={losses.data?.losses || []} empty={<div className="p-4 text-sm text-slate-500">{t('extension.farm.noLosses')}</div>} /></Loading></Section>
      <Section title={t('coop.outcomes.title')} subtitle={t('coop.outcomes.subtitle')} bodyClassName="p-0 sm:p-0"><Loading q={outcomes}><Table columns={oCols} rows={outcomes.data?.outcomes || []} empty={<div className="p-4 text-sm text-slate-500">{t('coop.outcomes.empty')}</div>} /></Loading></Section>
    </div>
  );
}

/* ───────── Alerts ───────── */
function AlertsTab({ farm }) {
  const q = useQuery({ queryKey: ['farmAlerts', farm.id], queryFn: () => farmApi.alerts(farm.id) });
  return <Loading q={q}><AlertList alerts={q.data?.alerts || []} /></Loading>;
}

/* ───────── Extension notes ───────── */
function NotesTab({ farm, canAdd }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notes', farm.id], queryFn: () => farmApi.notes(farm.id) });
  const [form, setForm] = useState({ note: '', visitPriority: '', visitBy: '' });
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const m = useMutation({
    mutationFn: () => farmApi.addNote(farm.id, { note: form.note.trim(), visitPriority: form.visitPriority || null, visitBy: form.visitBy || null }),
    onSuccess: () => {
      setForm({ note: '', visitPriority: '', visitBy: '' });
      setTouched(false);
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['notes', farm.id] });
      qc.invalidateQueries({ queryKey: ['extDashboard'] });
    },
  });
  const noteMissing = !form.note.trim();
  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    setSaved(false);
    if (!noteMissing) m.mutate();
  };
  const notes = q.data?.notes || [];
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {canAdd && (
        <Card className="p-4 lg:col-span-2">
          <form onSubmit={submit} className="space-y-3" noValidate>
            <h3 className="flex items-center gap-2 font-semibold text-slate-900"><MessageSquarePlus className="h-5 w-5 text-ocean-600" aria-hidden />{t('extension.farm.addNote')}</h3>
            <Field label={t('extension.farm.note')} htmlFor="note-text" required error={touched && noteMissing ? t('extension.shared.noteRequired') : null}>
              <textarea id="note-text" className="input min-h-28" maxLength={2000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t('extension.farm.notePlaceholder')} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('extension.farm.visitPriority')} htmlFor="note-prio">
                <select id="note-prio" className="input" value={form.visitPriority} onChange={(e) => setForm({ ...form, visitPriority: e.target.value })}>
                  <option value="">{t('common.none')}</option>
                  {RISK_LEVELS.map((l) => <option key={l} value={l}>{t(`risk.level.${l}`)}</option>)}
                </select>
              </Field>
              <Field label={t('extension.farm.visitBy')} htmlFor="note-visit">
                <input id="note-visit" type="date" className="input" min={isoDate()} value={form.visitBy} onChange={(e) => setForm({ ...form, visitBy: e.target.value })} />
              </Field>
            </div>
            <FormError error={m.error} />
            {saved && <Notice tone="success">{t('extension.farm.noteSaved')}</Notice>}
            <Button type="submit" loading={m.isPending} icon={StickyNote} className="w-full sm:w-auto">{t('extension.farm.saveNote')}</Button>
          </form>
        </Card>
      )}
      <div className={cx(canAdd ? 'lg:col-span-3' : 'lg:col-span-5')}>
        <Loading q={q}>
          {notes.length === 0 ? <EmptyState icon={StickyNote} title={t('extension.farm.noNotes')} /> : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li key={n.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{n.author?.fullName || '—'}</span>
                      <time title={dateTime(n.createdAt, lang)}>{timeAgo(n.createdAt, lang)}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{n.note}</p>
                    {(n.visitPriority || n.visitBy) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        {n.visitPriority && <><span>{t('extension.farm.visitPriority')}:</span><RiskBadge level={n.visitPriority} /></>}
                        {n.visitBy && <span>{t('extension.farm.visitByOn', { date: date(n.visitBy, lang) })}</span>}
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Loading>
      </div>
    </div>
  );
}

const TAB_ICON = { overview: Info, risk: ShieldAlert, recommendations: ListChecks, observations: ClipboardList, records: History, alerts: Bell, notes: StickyNote };

export default function StaffFarmDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { hasRole } = useAuth();
  const base = useStaffBase();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const q = useQuery({ queryKey: ['farm', id], queryFn: () => farmApi.get(id) });
  const canFlag = hasRole('EXTENSION_OFFICER', 'ADMIN');
  const canReview = hasRole('EXTENSION_OFFICER', 'ADMIN');
  const canNote = hasRole('EXTENSION_OFFICER', 'COOPERATIVE_ADMIN', 'ADMIN');

  const back = <Link to={`${base}/farms`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />{t('extension.farm.back')}</Link>;
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <div>{back}<ErrorState error={q.error} onRetry={q.refetch} /></div>;
  const farm = q.data.farm;

  return (
    <div>
      {back}
      <PageHeader
        title={`${farm.farmCode} · ${farm.name}`}
        subtitle={[farm.farmer?.fullName, farm.cooperative?.name, farm.location?.district].filter(Boolean).join(' · ')}
        badge={(
          <>
            <RiskBadge level={farm.overallRiskLevel} long size="lg" />
            {farm.isDemo && <DemoBadge />}
            {farm.status !== 'ACTIVE' && <Badge>{t(`extension.shared.farmStatus.${farm.status}`)}</Badge>}
          </>
        )}
      />
      {farm.isDemo && <Notice tone="demo" className="mb-4">{t('extension.farm.demoFarmNote')}</Notice>}
      <div role="tablist" aria-label={t('extension.farm.sections')} className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((k) => {
          const Icon = TAB_ICON[k];
          return (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams({ tab: k }, { replace: true })}
              className={cx('-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold', tab === k ? 'border-ocean-700 text-ocean-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
              <Icon className="h-4 w-4" aria-hidden />{t(`extension.farm.tabs.${k}`)}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        {tab === 'overview' && <OverviewTab farm={farm} base={base} />}
        {tab === 'risk' && <RiskTab farm={farm} canFlag={canFlag} />}
        {tab === 'recommendations' && <RecommendationsTab farm={farm} />}
        {tab === 'observations' && <ObservationsTab farm={farm} canReview={canReview} />}
        {tab === 'records' && <RecordsTab farm={farm} />}
        {tab === 'alerts' && <AlertsTab farm={farm} />}
        {tab === 'notes' && <NotesTab farm={farm} canAdd={canNote} />}
      </div>
    </div>
  );
}
