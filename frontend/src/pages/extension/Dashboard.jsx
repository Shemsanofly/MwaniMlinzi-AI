import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, ClipboardCheck, ClipboardList, Map as MapIcon, Microscope, Navigation, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { extensionApi } from '../../api/endpoints.js';
import FarmMap from '../../components/map/FarmMap.jsx';
import { Badge, Button, EmptyState, ErrorState, PageHeader, PageLoader, RiskBadge, StatCard } from '../../components/ui/index.jsx';
import { num, pct, timeAgo } from '../../utils/format.js';
import { AlertList, Section } from './components/common.jsx';
import { HighRiskFarmsTable, MissingReportsList, PortfolioCharts, PortfolioStats } from './components/Portfolio.jsx';

const BASE = '/extension';

function VisitPriorityList({ items }) {
  const { t } = useI18n();
  if (!items.length) return <EmptyState title={t('extension.dashboard.noVisits')} />;
  return (
    <ol className="divide-y divide-slate-100">
      {items.map((v, i) => (
        <li key={v.id} className="flex items-start gap-3 py-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ocean-50 text-sm font-bold text-ocean-800">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={`${BASE}/farms/${v.id}`} className="font-semibold text-ocean-700 hover:underline">{v.farmCode} · {v.name}</Link>
              <RiskBadge level={v.overallRiskLevel} />
            </div>
            <p className="text-xs text-slate-500">{v.farmer || '—'}{v.location?.locationName ? ` · ${v.location.locationName}` : ''}</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {t('extension.dashboard.scoreWhy', {
                prob: pct(v.maxProbability),
                reports: v.pendingReports,
                visit: v.daysSinceVisit == null ? t('extension.dashboard.noVisitYet') : t('extension.dashboard.daysAgo', { n: v.daysSinceVisit }),
              })}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold text-slate-900">{num(v.score, 1)}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('extension.dashboard.score')}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function ExtensionDashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['extDashboard'], queryFn: extensionApi.dashboard });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('extension.dashboard.title')}
        subtitle={t('extension.dashboard.subtitle', { n: d.farms.length })}
        actions={<Button variant="secondary" icon={RefreshCw} loading={q.isFetching} onClick={() => q.refetch()}>{t('actions.refresh')}</Button>}
      />
      <PortfolioStats cards={d.cards} onNavigate={{ farms: () => navigate(`${BASE}/farms`) }} />

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label={t('extension.dashboard.pendingObs')} value={num(d.pendingObservations.length, 0)} sub={d.pendingObservations.length >= 30 ? t('extension.dashboard.showingLatest', { n: 30 }) : t('extension.dashboard.openReviews')} icon={ClipboardList} tone={d.pendingObservations.length ? 'amber' : 'slate'} onClick={() => navigate(`${BASE}/reviews?tab=observations`)} />
        <StatCard label={t('extension.dashboard.pendingRecs')} value={num(d.pendingRecommendations.length, 0)} sub={t('extension.dashboard.pendingRecsSub')} icon={ClipboardCheck} tone={d.pendingRecommendations.length ? 'orange' : 'slate'} onClick={() => navigate(`${BASE}/reviews?tab=recommendations`)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Section title={t('extension.dashboard.map')} icon={MapIcon} className="lg:col-span-3" bodyClassName="p-2 sm:p-3"
          action={<Link to={`${BASE}/risk-map`} className="text-sm font-semibold text-ocean-700 hover:underline">{t('extension.dashboard.openMap')} →</Link>}>
          {d.farms.length ? <FarmMap farms={d.farms} height={420} linkTo={(f) => `${BASE}/farms/${f.id}`} /> : <EmptyState title={t('extension.shared.noFarms')} />}
        </Section>
        <Section title={t('extension.dashboard.visits')} subtitle={t('extension.dashboard.visitsSub')} icon={Navigation} className="lg:col-span-2" bodyClassName="max-h-[520px] overflow-y-auto">
          <VisitPriorityList items={d.visitPriority || []} />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t('extension.dashboard.highRisk')} icon={AlertTriangle} className="lg:col-span-2" bodyClassName="p-0 sm:p-0">
          <HighRiskFarmsTable farms={d.highRiskFarms} base={BASE} />
        </Section>
        <Section title={t('extension.dashboard.disease')} subtitle={t('extension.dashboard.diseaseSub')} icon={Microscope}>
          {d.diseaseObservations.length === 0 ? <p className="text-sm text-slate-500">{t('extension.dashboard.noDisease')}</p> : (
            <ul className="divide-y divide-slate-100">
              {d.diseaseObservations.slice(0, 10).map((o) => (
                <li key={o.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className="bg-orange-50 text-orange-800 ring-orange-200">{t(`extension.shared.diseaseType.${o.diseaseType}`)}</Badge>
                    {o.severity && <RiskBadge level={o.severity} />}
                    {o.percentAffected != null && <span className="text-xs text-slate-500">{t('extension.shared.percentAffected', { n: num(o.percentAffected, 0) })}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">
                    <Link to={`${BASE}/farms/${o.farm?.id || o.farmId}`} className="font-semibold text-ocean-700 hover:underline">{o.farm?.farmCode} · {o.farm?.name}</Link> · {timeAgo(o.createdAt, lang)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t('extension.dashboard.recentAlerts')} icon={Bell} className="lg:col-span-2">
          <AlertList alerts={(d.recentAlerts || []).slice(0, 8)} base={BASE} compact />
        </Section>
        <Section title={t('extension.shared.missingTitle')} subtitle={t('extension.shared.stats.missingReportsSub')} icon={ClipboardList}>
          <MissingReportsList farms={d.missingReportFarms} base={BASE} />
        </Section>
      </div>

      <PortfolioCharts charts={d.charts} />
    </div>
  );
}
