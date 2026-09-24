import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, AlertTriangle, BookCheck, CalendarClock, ClipboardList, Cpu, Database, FlaskConical, Play, Server, Sprout, Target, Truck, Users,
} from 'lucide-react';
import { adminApi, metaApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import {
  Badge, Card, CardHeader, EmptyState, ErrorState, FormError, Notice, PageHeader, PageLoader, Spinner, StatCard, Button, Table,
} from '../../components/ui/index.jsx';
import { RISK_LEVELS, riskStyle } from '../../utils/risk.js';
import { dateTime, num, timeAgo } from '../../utils/format.js';
import { JsonBlock, ProviderList } from './components/shared.jsx';

function JobStatusBadge({ status }) {
  const tone = status === 'SUCCESS' ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30'
    : status === 'FAILED' ? 'bg-red-50 text-red-800 ring-red-300'
      : 'bg-sky-50 text-sky-800 ring-sky-300';
  return <Badge className={tone}>{status || '—'}</Badge>;
}

const duration = (r) => (r?.finishedAt ? `${((new Date(r.finishedAt) - new Date(r.startedAt)) / 1000).toFixed(1)} s` : '—');

function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">{label}</p>
      <p className="text-slate-600">{num(payload[0].value, 0)} {unit}</p>
    </div>
  );
}

function SystemHealth() {
  const { t, lang } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['health'], queryFn: metaApi.health, retry: false });
  return (
    <Card>
      <CardHeader icon={Server} title={t('admin.dashboard.health')} subtitle={data ? t('common.lastUpdated', { time: dateTime(data.time, lang) }) : null} />
      <div className="p-4 sm:p-5">
        {isLoading && <div className="flex justify-center py-4"><Spinner /></div>}
        {error && <ErrorState error={error} onRetry={refetch} compact />}
        {data && (
          <>
            <div className="mb-2 flex flex-wrap gap-2">
              <Badge className={data.database === 'ok' ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-red-50 text-red-800 ring-red-300'}>
                <Database className="h-3 w-3" aria-hidden />{t('admin.system.database')}: {data.database}
              </Badge>
              <Badge className={data.demoMode ? 'bg-violet-50 text-violet-800 ring-violet-300' : 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30'}>
                <FlaskConical className="h-3 w-3" aria-hidden />{data.demoMode ? t('admin.system.demoModeOn') : t('admin.system.demoModeOff')}
              </Badge>
            </div>
            <ProviderList providers={data.providers} />
          </>
        )}
      </div>
    </Card>
  );
}

function JobsPanel() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [result, setResult] = useState(null);
  const jobs = useQuery({ queryKey: ['admin', 'jobs'], queryFn: adminApi.jobs });
  const run = useMutation({
    mutationFn: (name) => adminApi.runJob(name),
    onSuccess: (data, name) => {
      setResult({ name, run: data.run });
      qc.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
  });

  return (
    <Card>
      <CardHeader
        icon={CalendarClock}
        title={t('admin.jobs.title')}
        subtitle={t('admin.jobs.subtitle')}
        action={jobs.data && (
          <Badge className={jobs.data.schedulerEnabled ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-amber-50 text-amber-800 ring-amber-300'}>
            {jobs.data.schedulerEnabled ? t('admin.jobs.schedulerOn') : t('admin.jobs.schedulerOff')}
          </Badge>
        )}
      />
      <div className="p-4 sm:p-5">
        {jobs.isLoading && <div className="flex justify-center py-4"><Spinner /></div>}
        {jobs.error && <ErrorState error={jobs.error} onRetry={jobs.refetch} compact />}
        {jobs.data && !jobs.data.schedulerEnabled && <Notice tone="warning" className="mb-3">{t('admin.jobs.schedulerOffNote')}</Notice>}
        {jobs.data && (
          <ul className="divide-y divide-slate-100">
            {jobs.data.jobs.map((j) => {
              const running = run.isPending && run.variables === j.name;
              return (
                <li key={j.name} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-slate-900">
                      {j.name}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600" title={t('admin.jobs.cron')}>{j.schedule}</span>
                    </p>
                    <p className="text-sm text-slate-600">{j.description}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {j.lastRun
                        ? <>{t('admin.jobs.lastRun')}: {timeAgo(j.lastRun.startedAt, lang)} <JobStatusBadge status={j.lastRun.status} /> ({duration(j.lastRun)})</>
                        : t('admin.jobs.neverRun')}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" icon={Play} loading={running} disabled={run.isPending} onClick={() => run.mutate(j.name)} className="shrink-0">
                    {running ? t('admin.jobs.running') : t('actions.runNow')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {run.isPending && <Notice tone="info" className="mt-3"><span className="flex items-center gap-2"><Spinner className="h-4 w-4" />{t('admin.jobs.wait', { name: run.variables })}</span></Notice>}
        <FormError error={run.error} />
        {result && !run.isPending && (
          <div className="mt-3 rounded-lg border border-slate-200 p-3" aria-live="polite">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-slate-900">{t('admin.jobs.result', { name: result.name })}</span>
              <JobStatusBadge status={result.run?.status} />
              <span className="text-xs text-slate-500">{duration(result.run)}</span>
            </div>
            {result.run?.error && <Notice tone="danger" className="mb-2">{result.run.error}</Notice>}
            {result.run?.summary && typeof result.run.summary === 'object' && !Array.isArray(result.run.summary) ? (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(result.run.summary).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">{k}</dt>
                    <dd className="break-words font-semibold text-slate-900">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : <JsonBlock value={result.run?.summary} />}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { t, lang } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: adminApi.dashboard });
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const c = data.counts;
  const byLevel = RISK_LEVELS.map((level) => ({ level, label: t(`risk.level.${level}`), count: data.predictionsByLevel.find((p) => p.level === level)?.count || 0 }));
  const byRole = data.usersByRole.map((r) => ({ ...r, label: t(`roles.${r.role}`) }));
  const activeModels = data.models.filter((m) => m.status === 'ACTIVE');

  const stats = [
    { label: t('admin.dashboard.users'), value: num(c.users, 0), icon: Users, tone: 'ocean' },
    { label: t('admin.dashboard.farms'), value: num(c.farms, 0), sub: t('admin.dashboard.activeFarms', { n: c.activeFarms }), icon: Sprout, tone: 'green' },
    { label: t('admin.dashboard.predictions'), value: num(c.predictions, 0), sub: t('admin.dashboard.last24h', { n: c.predictions24h }), icon: Activity, tone: 'ocean' },
    { label: t('admin.dashboard.simulations'), value: num(c.simulations, 0), icon: FlaskConical, tone: 'slate' },
    { label: t('admin.dashboard.alertsActive'), value: num(c.alertsActive, 0), icon: AlertTriangle, tone: c.alertsActive ? 'orange' : 'slate' },
    { label: t('admin.dashboard.actions'), value: `${c.validatedActions}/${c.actions}`, sub: t('admin.dashboard.validated'), icon: BookCheck, tone: c.validatedActions < c.actions ? 'amber' : 'green' },
    { label: t('admin.dashboard.observations'), value: num(c.observations, 0), icon: ClipboardList, tone: 'ocean' },
    { label: t('admin.dashboard.harvestsOutcomes'), value: `${num(c.harvests, 0)} / ${num(c.outcomes, 0)}`, icon: Truck, tone: 'green' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.dashboard.title')} subtitle={t('admin.dashboard.subtitle')} actions={<Button variant="secondary" size="sm" onClick={() => refetch()}>{t('actions.refresh')}</Button>} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Activity} title={t('admin.dashboard.byLevel')} subtitle={t('admin.dashboard.byLevelSub')} />
          <div className="h-64 p-3">
            {byLevel.some((d) => d.count) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byLevel} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip unit={t('admin.dashboard.predictionsUnit')} />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {byLevel.map((d) => <Cell key={d.level} fill={riskStyle(d.level).hex} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title={t('admin.dashboard.noPredictions')} />}
          </div>
        </Card>
        <Card>
          <CardHeader icon={Users} title={t('admin.dashboard.byRole')} />
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byRole} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis type="category" dataKey="label" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#475569' }} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTooltip unit={t('admin.dashboard.usersUnit')} />} />
                <Bar dataKey="users" fill="#16718c" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader
            icon={Cpu}
            title={t('admin.dashboard.models')}
            subtitle={activeModels.length ? t('admin.dashboard.activeModels', { n: activeModels.length }) : t('admin.dashboard.ruleOnly')}
            action={<Link to="/admin/models" className="shrink-0 whitespace-nowrap text-sm font-semibold text-ocean-700 hover:text-ocean-900">{t('actions.viewDetails')}</Link>}
          />
          <div className="p-4 sm:p-5">
            {data.models.length ? (
              <ul className="divide-y divide-slate-100">
                {data.models.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-900">{t(`risk.type.${m.riskType}`)}</span>{' '}
                      <span className="font-mono text-xs text-slate-500">{m.version}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {m.syntheticData && <Badge className="bg-violet-50 text-violet-800 ring-violet-300">{t('source.syntheticBadge')}</Badge>}
                      <Badge className={m.status === 'ACTIVE' ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-slate-100 text-slate-600 ring-slate-200'}>{t(`admin.models.status.${m.status}`)}</Badge>
                      <span className="text-xs text-slate-500">F1 {m.metrics?.f1 != null ? m.metrics.f1.toFixed(2) : '—'}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={Cpu} title={t('admin.models.none')} message={t('admin.dashboard.ruleOnly')} />}
            {data.feedback.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <Target className="h-3.5 w-3.5" aria-hidden />{t('admin.dashboard.feedback')}:
                {data.feedback.map((f) => <Badge key={f.type}>{t(`admin.feedback.${f.type}`)}: {f.count}</Badge>)}
              </div>
            )}
          </div>
        </Card>
        <SystemHealth />
      </div>

      <JobsPanel />

      <Card>
        <CardHeader icon={CalendarClock} title={t('admin.dashboard.recentJobs')} />
        <div className="p-4 sm:p-5">
          <Table
            rows={data.recentJobs}
            empty={<EmptyState title={t('admin.jobs.noRuns')} />}
            columns={[
              { key: 'jobName', header: t('admin.jobs.job'), render: (r) => <span className="font-mono text-xs">{r.jobName}</span> },
              { key: 'trigger', header: t('admin.jobs.trigger') },
              { key: 'status', header: t('common.status'), render: (r) => <JobStatusBadge status={r.status} /> },
              { key: 'startedAt', header: t('admin.jobs.started'), render: (r) => dateTime(r.startedAt, lang) },
              { key: 'dur', header: t('admin.jobs.duration'), render: duration },
              { key: 'summary', header: t('admin.jobs.summary'), render: (r) => <span className="line-clamp-2 max-w-xs break-all font-mono text-xs text-slate-500">{r.error || (r.summary ? JSON.stringify(r.summary) : '—')}</span> },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}
