import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, BrainCircuit, CheckCircle2, Cpu, FlaskConical, MessageSquareWarning, Pause, Scale, Settings as SettingsIcon, Terminal } from 'lucide-react';
import { adminApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, FormError, Notice, PageHeader, PageLoader, cx } from '../../components/ui/index.jsx';
import { date, num } from '../../utils/format.js';
import { ConfusionMatrix, Metric } from './components/shared.jsx';

const STATUS_TONE = {
  ACTIVE: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
  TRAINED: 'bg-sky-50 text-sky-800 ring-sky-300',
  RETIRED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function ModelCard({ m, aiMode }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const upd = useMutation({
    mutationFn: (status) => adminApi.updateModel(m.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'models'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });
  const tm = m.testMetrics || {};
  const hasField = m.fieldMetrics && Object.keys(m.fieldMetrics).length > 0;
  return (
    <Card className={cx(m.status === 'ACTIVE' && 'ring-2 ring-seaweed-500/40')}>
      <CardHeader
        icon={BrainCircuit}
        title={`${t(`risk.type.${m.riskType}`)} · ${m.version}`}
        subtitle={<span className="font-mono text-xs">{m.name} · {m.algorithm}</span>}
        action={<Badge className={STATUS_TONE[m.status]}>{t(`admin.models.status.${m.status}`)}</Badge>}
      />
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {m.syntheticData
            ? <Badge className="bg-violet-50 text-violet-800 ring-violet-300"><FlaskConical className="h-3 w-3" aria-hidden />{t('source.syntheticBadge')}</Badge>
            : <Badge className="bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30">{t('source.real')}</Badge>}
          {m.status === 'ACTIVE' && aiMode !== 'HYBRID' && <Badge className="bg-amber-50 text-amber-800 ring-amber-300">{t('admin.models.inactiveByMode')}</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">{t('admin.models.trainedAt')}</dt><dd className="font-medium">{date(m.trainedAt, lang)}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('admin.models.trainRecords')}</dt><dd className="font-medium tabular-nums">{num(m.trainingRecords, 0)}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('admin.models.testRecords')}</dt><dd className="font-medium tabular-nums">{num(m.testRecords, 0)}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('admin.models.usage')}</dt><dd className="font-medium tabular-nums">{t('admin.models.usageValue', { p: m.predictionCount ?? 0, f: m.feedbackCount ?? 0 })}</dd></div>
        </dl>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('admin.models.testMetrics')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Metric label={t('admin.models.precision')} value={tm.precision} />
            <Metric label={t('admin.models.recall')} value={tm.recall} />
            <Metric label="F1" value={tm.f1} />
            <Metric label={t('admin.models.accuracy')} value={tm.accuracy} />
            <Metric label="ROC AUC" value={tm.rocAuc} format="raw" />
          </div>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('admin.models.confusionTest')}</p>
            <ConfusionMatrix cm={m.confusionMatrix} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('admin.models.fieldMetrics')}</p>
            {hasField ? (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(m.fieldMetrics).map(([k, v]) => <Metric key={k} label={k} value={v} format={k === 'rocAuc' ? 'raw' : 'pct'} />)}
              </div>
            ) : <p className="text-sm text-slate-500">{t('admin.models.noFieldMetrics')}</p>}
          </div>
        </div>
        {m.notes && <Notice tone={m.syntheticData ? 'demo' : 'info'}>{m.notes}</Notice>}
        <FormError error={upd.error} />
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {m.status !== 'ACTIVE' && (
            <Button size="sm" variant="success" icon={CheckCircle2} loading={upd.isPending && upd.variables === 'ACTIVE'} disabled={upd.isPending} onClick={() => upd.mutate('ACTIVE')}>{t('admin.models.activate')}</Button>
          )}
          {m.status === 'ACTIVE' && (
            <Button size="sm" variant="secondary" icon={Pause} loading={upd.isPending && upd.variables === 'TRAINED'} disabled={upd.isPending} onClick={() => upd.mutate('TRAINED')}>{t('admin.models.deactivate')}</Button>
          )}
          {m.status !== 'RETIRED' && (
            <Button size="sm" variant="ghost" icon={Archive} loading={upd.isPending && upd.variables === 'RETIRED'} disabled={upd.isPending} onClick={() => upd.mutate('RETIRED')}>{t('admin.models.retire')}</Button>
          )}
          {m.status === 'ACTIVE' && <p className="self-center text-xs text-slate-500">{t('admin.models.oneActive')}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function AdminModels() {
  const { t } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'models'], queryFn: adminApi.models });
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const hybrid = data.status !== 'Rule-based baseline';
  const fe = data.fieldEvaluation || {};
  const anySynthetic = data.models.some((m) => m.syntheticData);

  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.models.title')} subtitle={t('admin.models.subtitle')} />

      <Card className={cx('border-l-4', hybrid ? 'border-l-seaweed-500' : 'border-l-ocean-600')}>
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-ocean-50 p-2.5 text-ocean-700"><Cpu className="h-6 w-6" aria-hidden /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('admin.models.currentStatus')}</p>
              <p className="text-xl font-bold text-slate-900">{hybrid ? data.status : t('admin.models.ruleBaseline')}</p>
              <p className="mt-1 text-sm text-slate-600">
                {t('admin.models.ruleInfo', { version: data.ruleBaseline?.version, n: num(data.ruleBaseline?.predictions, 0) })}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <span className="text-sm text-slate-600">{t('admin.models.aiModeLabel')}: <Badge className="bg-ocean-50 text-ocean-800 ring-ocean-200">{data.aiMode}</Badge></span>
            <Link to="/admin/settings" className="inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:text-ocean-900"><SettingsIcon className="h-4 w-4" aria-hidden />{t('admin.models.changeMode')}</Link>
          </div>
        </div>
        {data.aiMode === 'HYBRID' && !hybrid && <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{t('admin.models.hybridNoActive')}</p>}
        {data.aiMode === 'RULE_ONLY' && <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{t('admin.models.ruleOnlyMode')}</p>}
      </Card>

      {anySynthetic && <Notice tone="demo" icon={FlaskConical}>{data.training?.note}</Notice>}

      {data.models.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={Cpu} title={t('admin.models.none')} message={t('admin.models.noneText')} />
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-900 p-3 font-mono text-sm text-slate-100">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><code className="break-all">{data.training?.command}</code>
          </div>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {data.models.map((m) => <ModelCard key={m.id} m={m} aiMode={data.aiMode} />)}
        </div>
      )}

      <Card>
        <CardHeader icon={Scale} title={t('admin.models.fieldTitle')} subtitle={t('admin.models.fieldSubtitle', { n: fe.outcomes ?? 0 })} />
        <div className="space-y-4 p-4 sm:p-5">
          {fe.note && <Notice tone="warning">{fe.note}</Notice>}
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <ConfusionMatrix cm={fe.confusionMatrix} />
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label={t('admin.models.precision')} value={fe.precision} />
              <Metric label={t('admin.models.recall')} value={fe.recall} />
              <Metric label="F1" value={fe.f1} />
              <Metric label={t('admin.models.accuracy')} value={fe.accuracy} />
            </div>
          </div>
          {fe.confusionMatrix && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">{t('admin.models.falsePositives', { n: fe.confusionMatrix.fp ?? 0 })}</p>
                <p className="text-xs">{t('admin.models.fpText')}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <p className="font-semibold">{t('admin.models.falseNegatives', { n: fe.confusionMatrix.fn ?? 0 })}</p>
                <p className="text-xs">{t('admin.models.fnText')}</p>
              </div>
            </div>
          )}
          <p className="text-xs text-slate-500">{t('admin.models.fieldNote')}</p>
        </div>
      </Card>

      <Card>
        <CardHeader icon={MessageSquareWarning} title={t('admin.models.feedbackTitle')} subtitle={t('admin.models.feedbackSubtitle')} />
        <div className="p-4 sm:p-5">
          {data.feedback.length ? (
            <div className="flex flex-wrap gap-3">
              {data.feedback.map((f) => (
                <div key={f.type} className="rounded-lg border border-slate-200 px-4 py-2">
                  <p className="text-xs text-slate-500">{t(`admin.feedback.${f.type}`)}</p>
                  <p className="text-xl font-bold tabular-nums text-slate-900">{f.count}</p>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">{t('admin.models.noFeedback')}</p>}
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            <p>{t('admin.models.retrain')} <code className="break-all rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-slate-200">{data.training?.command}</code></p>
          </div>
        </div>
      </Card>
    </div>
  );
}
