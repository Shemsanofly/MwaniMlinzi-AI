import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Gauge, ListChecks, Sprout, Timer, Users } from 'lucide-react';
import { dashboardApi, cooperativeApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../stores/AuthContext.jsx';
import { Card, CardHeader, ErrorState, Notice, PageHeader, PageLoader, cx } from '../../components/ui/index.jsx';
import { num, pct } from '../../utils/format.js';

const WINDOW_CHOICES = [30, 90, 180];

function Stat({ icon: Icon, label, value, hint, tone = 'ocean' }) {
  const toneClass = {
    ocean: 'bg-ocean-50 text-ocean-700 ring-ocean-200',
    seaweed: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
    amber: 'bg-amber-50 text-amber-800 ring-amber-300',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  }[tone];
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className={cx('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1', toneClass)}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

function TargetBar({ label, value, target, help }) {
  // value is a 0..1 ratio or null; target is a 0..1 ratio.
  const met = value != null && value >= target;
  const width = value == null ? 0 : Math.min(1, value) * 100;
  const barTone = value == null ? 'bg-slate-300' : met ? 'bg-seaweed-500' : 'bg-amber-500';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="tabular-nums text-slate-600">{value == null ? '—' : pct(value, 0)}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cx('h-full rounded-full transition-all', barTone)} style={{ width: `${width}%` }} />
        <div className="absolute inset-y-0" style={{ left: `${target * 100}%` }}>
          <div className="h-full w-px bg-slate-900/40" />
        </div>
      </div>
      <p className="text-xs text-slate-500">{help}</p>
    </div>
  );
}

export default function Impact() {
  const { t } = useI18n();
  const { hasRole, cooperative: ownCoop } = useAuth();
  const canChooseCoop = hasRole('ADMIN');
  const [days, setDays] = useState(90);
  const [cooperativeId, setCooperativeId] = useState('');

  const coopList = useQuery({
    queryKey: ['cooperatives'],
    queryFn: cooperativeApi.list,
    enabled: canChooseCoop,
  });

  const params = useMemo(() => {
    const p = { days };
    if (canChooseCoop && cooperativeId) p.cooperativeId = cooperativeId;
    return p;
  }, [days, cooperativeId, canChooseCoop]);

  const q = useQuery({ queryKey: ['dashboard', 'impact', params], queryFn: () => dashboardApi.impact(params) });

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const d = q.data;
  const activeCoopName = d.cooperative?.name || (ownCoop?.name && !canChooseCoop ? ownCoop.name : t('impact.allCoops'));

  return (
    <div className="space-y-6">
      <PageHeader title={t('impact.title')} subtitle={t('impact.subtitle')} />

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label htmlFor="imp-window" className="label">{t('impact.windowLabel')}</label>
            <select id="imp-window" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {WINDOW_CHOICES.map((n) => <option key={n} value={n}>{t('impact.window', { n })}</option>)}
            </select>
          </div>
          {canChooseCoop && (
            <div>
              <label htmlFor="imp-coop" className="label">{t('impact.coopSelect')}</label>
              <select id="imp-coop" className="input" value={cooperativeId} onChange={(e) => setCooperativeId(e.target.value)}>
                <option value="">{t('impact.allCoops')}</option>
                {(coopList.data?.cooperatives || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div className="ml-auto text-sm text-slate-500">{activeCoopName}</div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label={t('impact.cards.farmers')} value={num(d.counts.farmers, 0)} />
        <Stat icon={Sprout} label={t('impact.cards.activeFarms')} value={num(d.counts.activeFarms, 0)} tone="seaweed" />
        <Stat icon={ListChecks} label={t('impact.cards.observations')} value={num(d.counts.observations, 0)} />
        <Stat icon={Activity} label={t('impact.cards.actions')} value={num(d.counts.actionsTaken, 0)} tone="seaweed" />
        <Stat icon={CheckCircle2} label={t('impact.cards.outcomes')} value={num(d.counts.outcomes, 0)} />
        <Stat icon={AlertTriangle} label={t('impact.cards.highAlerts')} value={num(d.alerts.highIssued, 0)} tone="amber" />
        <Stat icon={CheckCircle2} label={t('impact.cards.acknowledged')} value={num(d.alerts.acknowledged, 0)} tone="seaweed" />
        <Stat icon={Timer} label={t('impact.cards.within48h')} value={num(d.alerts.within48h, 0)} tone="seaweed" />
      </div>

      <Card>
        <CardHeader icon={Gauge} title={t('impact.title')} subtitle={t('impact.note')} />
        <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-2">
          <TargetBar
            label={t('impact.cards.acknowledged')}
            value={d.alerts.ackRate}
            target={0.75}
            help={t('impact.targets.ack')}
          />
          <TargetBar
            label={t('impact.cards.within48h')}
            value={d.alerts.actionWithin48hRate}
            target={0.60}
            help={t('impact.targets.action48h')}
          />
        </div>
      </Card>

      <Notice tone="info">{t('impact.note')}</Notice>
    </div>
  );
}
