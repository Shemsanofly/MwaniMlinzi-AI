import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CheckCircle2, CloudLightning, CloudRain, FlaskConical, Play, RotateCcw, Thermometer,
} from 'lucide-react';
import { environmentApi, farmApi, riskApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import {
  Badge, Button, Card, CardHeader, DemoBadge, EmptyState, ErrorState, FormError, Notice, PageHeader, PageLoader, RiskBadge, SourceBadge, Spinner, cx,
} from '../../components/ui/index.jsx';
import { EnvironmentSummary, FactorList, ModelStatusBadge, NextActionCard, RISK_ICON, RiskCard } from '../../components/risk/RiskComponents.jsx';
import { RISK_TYPES, levelRank, riskStyle } from '../../utils/risk.js';
import { pct } from '../../utils/format.js';
import SimControls, { PRESETS, SIM_FIELDS, valuesFromEnv } from './components/SimControls.jsx';

function SimLabel() {
  const { t } = useI18n();
  return <Badge className="bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-300"><FlaskConical className="h-3 w-3" aria-hidden />{t('demo.sim.label')}</Badge>;
}

/** Before → after for one risk type. */
function CompareRow({ type, before, after }) {
  const { t } = useI18n();
  const Icon = RISK_ICON[type];
  const delta = after && before ? after.probability - before.probability : null;
  const levelChange = after && before ? levelRank(after.riskLevel) - levelRank(before.riskLevel) : 0;
  const DeltaIcon = delta == null || Math.abs(delta) < 0.005 ? ArrowRight : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = delta == null || Math.abs(delta) < 0.005 ? 'text-slate-500' : delta > 0 ? 'text-orange-700' : 'text-seaweed-700';
  return (
    <li className={cx('grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-[1.3fr_1fr_auto_1fr] sm:items-center', levelChange > 0 ? 'border-orange-200 bg-orange-50/50' : levelChange < 0 ? 'border-seaweed-100 bg-seaweed-50/50' : 'border-slate-200')} data-testid={`compare-${type}`}>
      <p className="flex items-center gap-2 font-semibold text-slate-900">{Icon && <Icon className="h-4 w-4 text-ocean-600" aria-hidden />}{t(`risk.type.${type}`)}</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 sm:hidden">{t('demo.sim.before')}:</span>
        {before ? <><RiskBadge level={before.riskLevel} /><span className="tabular-nums text-slate-700">{pct(before.probability)}</span></> : <span className="text-slate-400">—</span>}
      </div>
      <span className={cx('flex items-center gap-1 text-sm font-bold tabular-nums', tone)} aria-label={t('demo.sim.change')}>
        <DeltaIcon className="h-5 w-5" aria-hidden />
        {delta != null && `${delta > 0 ? '+' : ''}${Math.round(delta * 100)} pp`}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 sm:hidden">{t('demo.sim.after')}:</span>
        {after ? <><RiskBadge level={after.riskLevel} /><span className={cx('text-lg font-bold tabular-nums', riskStyle(after.riskLevel).text)}>{pct(after.probability)}</span></> : <span className="text-slate-400">—</span>}
      </div>
    </li>
  );
}

function PipelineSteps({ result, overrides }) {
  const { t, tx } = useI18n();
  const preds = result.predictions || [];
  const featureCount = preds[0]?.features ? Object.keys(preds[0].features).filter((k) => !k.startsWith('__')).length : 0;
  const top = [...preds].sort((a, b) => levelRank(b.riskLevel) - levelRank(a.riskLevel) || b.probability - a.probability)[0];
  const code = result.nextAction?.recommendation?.actionItem?.code;
  const steps = [
    { k: 'receive', detail: SIM_FIELDS.map((f) => `${f.key}=${overrides[f.key]}`).join(', ') },
    { k: 'features', detail: t('demo.sim.steps.featuresDetail', { n: featureCount }) },
    { k: 'engine', detail: result.modelStatus?.label || '—' },
    { k: 'probability', detail: preds.map((p) => `${t(`risk.type.${p.riskType}`)} ${pct(p.probability)}`).join(' · ') },
    { k: 'level', detail: preds.map((p) => `${t(`risk.type.${p.riskType}`)}: ${t(`risk.level.${p.riskLevel}`)}`).join(' · ') },
    { k: 'explanation', detail: top ? tx(top, 'explanation') : '—' },
    { k: 'recommendation', detail: code ? `${code} — ${tx(result.nextAction.recommendation.actionItem, 'action')}` : (result.insufficientDataMessage ? tx({ m: result.insufficientDataMessage.en, mSw: result.insufficientDataMessage.sw }, 'm') : t('demo.sim.noAction')) },
    { k: 'alert', detail: t('demo.sim.steps.alertDetail', { n: result.alerts?.length || 0 }) },
  ];
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.k} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-seaweed-600 text-white"><CheckCircle2 className="h-4 w-4" aria-hidden /></span>
          <div className="min-w-0 pb-1">
            <p className="text-sm font-semibold text-slate-900">{i + 1}. {t(`demo.sim.steps.${s.k}`)}</p>
            <p className="break-words text-xs text-slate-600">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Results({ result, overrides }) {
  const { t, tx } = useI18n();
  const before = Object.fromEntries((result.baseline?.predictions || []).map((p) => [p.riskType, p]));
  const after = Object.fromEntries((result.predictions || []).map((p) => [p.riskType, p]));
  const types = RISK_TYPES.filter((rt) => before[rt] || after[rt]);
  const [factorType, setFactorType] = useState(result.nextAction?.riskType || types[0]);
  const selected = after[factorType];

  return (
    <div className="space-y-5" aria-live="polite">
      <Notice tone="demo" icon={FlaskConical}>
        <p className="font-bold uppercase tracking-wide">{t('demo.sim.banner')}</p>
        <p>{t('demo.sim.bannerText')}</p>
      </Notice>

      <Card>
        <CardHeader
          title={t('demo.sim.compareTitle')}
          subtitle={t('demo.sim.compareSubtitle')}
          action={<div className="flex flex-wrap gap-1.5"><SimLabel /><ModelStatusBadge label={result.modelStatus?.label} /></div>}
        />
        <div className="p-4 sm:p-5">
          <div className="mb-2 hidden grid-cols-[1.3fr_1fr_auto_1fr] gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
            <span>{t('demo.sim.riskType')}</span><span>{t('demo.sim.before')}</span><span className="w-16">{t('demo.sim.change')}</span><span>{t('demo.sim.after')}</span>
          </div>
          <ul className="space-y-2">{types.map((rt) => <CompareRow key={rt} type={rt} before={before[rt]} after={after[rt]} />)}</ul>
          {!result.baseline?.predictions?.length && <p className="mt-2 text-xs text-slate-500">{t('demo.sim.noBaseline')}</p>}
        </div>
      </Card>

      <div className="grid gap-5 2xl:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">{t('demo.sim.recBefore')}</p>
          <NextActionCard nextAction={result.baseline?.nextAction} insufficientDataMessage={result.baseline?.insufficientDataMessage} />
        </div>
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">{t('demo.sim.recAfter')} <SimLabel /></p>
          <NextActionCard nextAction={result.nextAction} insufficientDataMessage={result.insufficientDataMessage} />
        </div>
      </div>

      <div className="grid gap-5 2xl:grid-cols-2">
        <Card>
          <CardHeader title={t('demo.sim.factorsTitle')} subtitle={t('demo.sim.factorsSubtitle')} />
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('demo.sim.riskType')}>
              {types.filter((rt) => after[rt]).map((rt) => (
                <button key={rt} type="button" onClick={() => setFactorType(rt)} aria-pressed={factorType === rt} className={cx('rounded-full px-3 py-1 text-xs font-semibold ring-1', factorType === rt ? 'bg-ocean-700 text-white ring-ocean-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>
                  {t(`risk.type.${rt}`)}
                </button>
              ))}
            </div>
            {selected ? (
              <>
                <p className="text-sm text-slate-700">{tx(selected, 'explanation')}</p>
                {selected.factors?.length ? <FactorList factors={selected.factors} /> : <p className="text-sm text-slate-500">{t('demo.sim.noFactors')}</p>}
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2"><SourceBadge source="SIMULATION" /><ModelStatusBadge modelType={selected.modelType} version={selected.modelVersion} /></div>
              </>
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader icon={Bell} title={t('demo.sim.alertsTitle')} subtitle={t('demo.sim.alertsSubtitle')} />
          <div className="p-4 sm:p-5">
            {result.alerts?.length ? (
              <ul className="space-y-2">
                {result.alerts.map((a) => (
                  <li key={a.id} className={cx('rounded-lg border-l-4 bg-slate-50 p-3', riskStyle(a.severity).border)}>
                    <div className="flex flex-wrap items-center gap-2"><RiskBadge level={a.severity} /><SimLabel /></div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{tx(a, 'title')}</p>
                    <p className="text-sm text-slate-600">{tx(a, 'message')}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">{t('demo.sim.noAlerts')}</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('demo.sim.pipelineTitle')} subtitle={t('demo.sim.pipelineSubtitle')} />
        <div className="p-4 sm:p-5"><PipelineSteps result={result} overrides={overrides} /></div>
      </Card>

      {result.environment && (
        <Card>
          <CardHeader title={t('demo.sim.simEnvTitle')} />
          <div className="p-4 sm:p-5"><EnvironmentSummary env={result.environment} /></div>
        </Card>
      )}
    </div>
  );
}

function Workbench({ farm, env }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const initial = valuesFromEnv(env);
  const [values, setValues] = useState(initial);
  const [ran, setRan] = useState(null);
  const run = useMutation({
    mutationFn: (overrides) => riskApi.predict(farm.id, overrides),
    onSuccess: (data, overrides) => {
      setRan({ data, overrides });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
  const preset = (p) => setValues((v) => ({ ...v, ...PRESETS[p] }));

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
      <Card className="h-fit xl:sticky xl:top-4">
        <CardHeader title={t('demo.sim.controlsTitle')} subtitle={t('demo.sim.controlsSubtitle')} action={<SimLabel />} />
        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <p className="label">{t('demo.sim.presets')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Thermometer} onClick={() => preset('heatwave')}>{t('demo.sim.preset.heatwave')}</Button>
              <Button size="sm" variant="secondary" icon={CloudLightning} onClick={() => preset('storm')}>{t('demo.sim.preset.storm')}</Button>
              <Button size="sm" variant="secondary" icon={CloudRain} onClick={() => preset('rain')}>{t('demo.sim.preset.rain')}</Button>
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setValues(initial)}>{t('demo.sim.preset.reset')}</Button>
            </div>
          </div>
          <SimControls values={values} onChange={setValues} disabled={run.isPending} />
          <Button size="lg" className="w-full" icon={Play} loading={run.isPending} onClick={() => run.mutate(values)}>{t('demo.sim.run')}</Button>
          <FormError error={run.error} />
          <p className="text-xs text-slate-500">{t('demo.sim.neverOverwrite')}</p>
        </div>
      </Card>
      <div>
        {run.isPending && <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600"><Spinner />{t('demo.sim.running')}</div>}
        {!run.isPending && ran && <Results key={ran.data.calculatedAt} result={ran.data} overrides={ran.overrides} />}
        {!run.isPending && !ran && <EmptyState icon={FlaskConical} title={t('demo.sim.readyTitle')} message={t('demo.sim.readyText')} />}
      </div>
    </div>
  );
}

export default function Simulation() {
  const { t } = useI18n();
  const farms = useQuery({ queryKey: ['farms', {}], queryFn: () => farmApi.list() });
  const [picked, setPicked] = useState('');
  const list = farms.data?.farms || [];
  const farmId = picked || list[0]?.id || '';
  const farm = list.find((f) => f.id === farmId);
  const risks = useQuery({ queryKey: ['risks', farmId], queryFn: () => farmApi.risks(farmId), enabled: !!farmId });
  const env = useQuery({ queryKey: ['environment', 'current', farmId], queryFn: () => environmentApi.current(farmId), enabled: !!farmId });

  if (farms.isLoading) return <PageLoader />;
  if (farms.error) return <ErrorState error={farms.error} onRetry={farms.refetch} />;

  return (
    <div className="space-y-6">
      <PageHeader title={t('demo.sim.title')} subtitle={t('demo.sim.subtitle')} badge={<SimLabel />} />
      {!list.length ? <EmptyState title={t('demo.sim.noFarms')} /> : (
        <>
          <Card>
            <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-end">
              <div className="md:w-96">
                <label htmlFor="sim-farm" className="label">{t('common.farm')}</label>
                <select id="sim-farm" className="input" value={farmId} onChange={(e) => setPicked(e.target.value)}>
                  {list.map((f) => <option key={f.id} value={f.id}>{f.farmCode} — {f.name}{f.demoScenario ? ` (${f.demoScenario})` : ''}</option>)}
                </select>
              </div>
              {farm && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  {farm.isDemo && <DemoBadge />}
                  <span>{farm.location?.locationName}</span>
                  {farm.cropAgeDays != null && <span>· {t('common.cropAge')}: {t('common.days', { n: farm.cropAgeDays })}</span>}
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('demo.sim.currentRisks')} subtitle={t('demo.sim.currentRisksSub')} action={risks.data?.modelStatus && <ModelStatusBadge label={risks.data.modelStatus.label} />} />
              <div className="p-4 sm:p-5">
                {risks.isLoading ? <Spinner /> : risks.error ? <ErrorState error={risks.error} onRetry={risks.refetch} compact /> : risks.data?.predictions?.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">{risks.data.predictions.map((p) => <RiskCard key={p.id} prediction={p} compact />)}</div>
                ) : <p className="text-sm text-slate-500">{t('common.noData')}</p>}
              </div>
            </Card>
            <Card>
              <CardHeader title={t('demo.sim.currentEnv')} subtitle={t('demo.sim.currentEnvSub')} />
              <div className="p-4 sm:p-5">
                {env.isLoading ? <Spinner /> : env.error ? <ErrorState error={env.error} onRetry={env.refetch} compact /> : <EnvironmentSummary env={env.data?.current} />}
              </div>
            </Card>
          </div>

          {env.data?.current && <Workbench key={farmId} farm={farm} env={env.data.current} />}
          {env.error && <Notice tone="warning">{t('demo.sim.envNeeded')}</Notice>}
        </>
      )}
    </div>
  );
}
