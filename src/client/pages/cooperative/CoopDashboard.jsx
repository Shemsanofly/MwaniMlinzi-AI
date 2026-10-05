import { Link, useNavigate } from '../../navigation.jsx';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Building2, ClipboardList, Map as MapIcon, RefreshCw, Sprout, Users } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { cooperativeApi } from '../../api/endpoints.js';
import FarmMap from '../../components/map/FarmMap.jsx';
import { Badge, Button, EmptyState, ErrorState, PageHeader, PageLoader, RiskBadge, StatCard } from '../../components/ui/index.jsx';
import { num } from '../../utils/format.js';
import { useDesktop } from '../../hooks/useMediaQuery.js';
import { AlertList, Section } from '../extension/components/common.jsx';
import { MissingReportsList } from '../extension/components/Portfolio.jsx';

const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const LEVEL_TONE = {
  LOW: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30',
  MEDIUM: 'bg-amber-50 text-amber-800 ring-amber-300',
  HIGH: 'bg-orange-100 text-orange-800 ring-orange-300',
  CRITICAL: 'bg-red-100 text-red-800 ring-red-300',
};

function RiskSummary({ distribution }) {
  const { t } = useI18n();
  const rows = (distribution?.overall || []).reduce((m, r) => ({ ...m, [r.level]: r.farms }), {});
  const total = LEVELS.reduce((s, l) => s + (rows[l] || 0), 0);
  if (!total) return <EmptyState title={t('coop.dashboard.noRiskYet')} />;
  return (
    <div className="space-y-3">
      <div className="flex overflow-hidden rounded-full">
        {LEVELS.map((l) => {
          const n = rows[l] || 0;
          if (!n) return null;
          return (
            <div key={l} className={`${LEVEL_TONE[l].split(' ')[0]} h-2.5`} style={{ width: `${(n / total) * 100}%` }} aria-label={`${l}: ${n}`} />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {LEVELS.map((l) => (
          <Badge key={l} className={LEVEL_TONE[l]}>
            <RiskBadge level={l} />
            <span className="ml-1.5 font-mono tabular-nums">{rows[l] || 0}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

export default function CooperativeDashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const desktop = useDesktop();
  const q = useQuery({ queryKey: ['coopDashboard'], queryFn: cooperativeApi.myDashboard });

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;

  const d = q.data;
  const coop = d.cooperative;
  const base = '/cooperative';
  const activeAlerts = (d.recentAlerts || []).filter((a) => a.status === 'ACTIVE').slice(0, 6);
  const expectedKg = d.cards?.expectedHarvestKg30d ?? null;
  const expectedRange = d.cards?.expectedHarvestRange30d ?? [null, null];

  return (
    <div className="space-y-6">
      <PageHeader
        title={coop?.name || t('coop.dashboard.title')}
        subtitle={t('coop.dashboard.subtitle', { code: coop?.code || '—', district: coop?.district || '—' })}
        actions={<Button variant="secondary" icon={RefreshCw} loading={q.isFetching} onClick={() => q.refetch()}>{t('actions.refresh')}</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('coop.dashboard.members')} value={num(d.members, 0)} icon={Users} tone="ocean" />
        <StatCard label={t('coop.dashboard.activeFarms')} value={num(d.cards?.activeFarms, 0)} icon={Sprout} tone="seaweed" onClick={() => navigate(`${base}/farms`)} />
        <StatCard label={t('coop.dashboard.highRisk')} value={num(d.cards?.highRiskFarms, 0)} icon={AlertTriangle} tone={d.cards?.highRiskFarms ? 'orange' : 'slate'} />
        <StatCard label={t('coop.dashboard.activeAlerts')} value={num(d.cards?.activeAlerts, 0)} icon={Bell} tone={d.cards?.criticalAlerts ? 'red' : d.cards?.activeAlerts ? 'amber' : 'slate'} onClick={() => navigate(`${base}/alerts`)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Section title={t('coop.dashboard.riskNow')} subtitle={t('coop.dashboard.riskNowSub')} icon={Building2} className="lg:col-span-2">
          <RiskSummary distribution={d.charts?.riskDistribution} />
        </Section>
        <Section
          title={t('coop.dashboard.expected30')}
          subtitle={t('coop.dashboard.expected30Sub')}
          icon={Sprout}
          className="lg:col-span-3"
          action={<Link to={`${base}/forecast`} className="text-sm font-semibold text-ocean-700 hover:underline">{t('coop.dashboard.openForecast')} →</Link>}
        >
          <div className="space-y-2">
            <p className="text-4xl font-bold tabular-nums text-slate-900">{expectedKg != null ? num(expectedKg, 0) : '—'} <span className="text-base font-medium text-slate-500">kg</span></p>
            {expectedRange[0] != null && expectedRange[1] != null && (
              <p className="text-sm text-slate-600">{t('coop.dashboard.rangeKg', { low: num(expectedRange[0], 0), high: num(expectedRange[1], 0) })}</p>
            )}
            <p className="text-xs text-slate-500">{t('coop.dashboard.expected30Note')}</p>
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Section title={t('coop.dashboard.mapTitle')} icon={MapIcon} className="lg:col-span-3" bodyClassName="p-2 sm:p-3">
          {(d.farms || []).length ? <FarmMap farms={d.farms} height={desktop ? 360 : 240} linkTo={(f) => `${base}/farms/${f.id}`} /> : <EmptyState title={t('coop.dashboard.noFarmsMap')} />}
        </Section>
        <Section title={t('coop.dashboard.alertsTitle')} icon={Bell} className="lg:col-span-2" bodyClassName="max-h-[420px] overflow-y-auto">
          {activeAlerts.length === 0 ? <EmptyState title={t('coop.dashboard.noAlerts')} /> : <AlertList alerts={activeAlerts} base={base} compact />}
        </Section>
      </div>

      <Section title={t('coop.dashboard.missingTitle')} subtitle={t('coop.dashboard.missingSub')} icon={ClipboardList}>
        <MissingReportsList farms={d.missingReportFarms || []} base={base} />
      </Section>
    </div>
  );
}
