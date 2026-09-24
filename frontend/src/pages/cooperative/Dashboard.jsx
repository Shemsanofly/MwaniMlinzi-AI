import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, ClipboardX, Map as MapIcon, RefreshCw, Target, TrendingUp } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { cooperativeApi, forecastApi } from '../../api/endpoints.js';
import FarmMap from '../../components/map/FarmMap.jsx';
import { Badge, Button, DemoBadge, EmptyState, ErrorState, FormError, Notice, PageHeader, PageLoader, RiskBadge, Table } from '../../components/ui/index.jsx';
import { date, num } from '../../utils/format.js';
import { AlertList, Section, SuccessNote } from '../extension/components/common.jsx';
import { HighRiskFarmsTable, MissingReportsList, PortfolioCharts, PortfolioStats } from '../extension/components/Portfolio.jsx';

const BASE = '/cooperative';

export default function CooperativeDashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [success, setSuccess] = useState(null);
  const q = useQuery({ queryKey: ['coopDashboard'], queryFn: cooperativeApi.myDashboard });
  const regen = useMutation({
    mutationFn: forecastApi.generate,
    onSuccess: (d) => {
      setSuccess(t('coop.forecastsRegenerated', { n: d?.generated ?? 0 }));
      qc.invalidateQueries({ queryKey: ['coopDashboard'] });
      qc.invalidateQueries({ queryKey: ['forecasts'] });
      qc.invalidateQueries({ queryKey: ['farms'] });
    },
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const d = q.data;
  const coop = d.cooperative;

  const perfColumns = [
    { key: 'farm', header: t('common.farm'), render: (p) => <Link className="font-semibold text-ocean-700 hover:underline" to={`${BASE}/farms/${p.farmId}`}>{p.farmCode} · {p.name}</Link> },
    { key: 'harvests', header: t('coop.perf.harvests'), className: 'text-right' },
    { key: 'totalKg', header: t('coop.perf.totalKg'), className: 'text-right', render: (p) => `${num(p.totalKg, 0)} kg` },
    { key: 'avgKg', header: t('coop.perf.avgKg'), className: 'text-right', render: (p) => `${num(p.totalKg / Math.max(1, p.harvests), 0)} kg` },
    { key: 'loss', header: t('coop.perf.avgLoss'), className: 'text-right', render: (p) => (p.avgLossPercent != null ? `${num(p.avgLossPercent, 1)}%` : '—') },
  ];
  const outcomeColumns = [
    { key: 'date', header: t('common.date'), render: (o) => <span className="whitespace-nowrap">{date(o.outcomeDate, lang)}</span> },
    { key: 'farm', header: t('common.farm'), render: (o) => <Link className="font-semibold text-ocean-700 hover:underline" to={`${BASE}/farms/${o.farmId}`}>{o.farm?.farmCode}</Link> },
    { key: 'risk', header: t('coop.outcomes.risk'), render: (o) => (o.prediction ? <span className="flex flex-wrap items-center gap-1">{t(`risk.type.${o.prediction.riskType}`)} <RiskBadge level={o.prediction.riskLevel} /></span> : '—') },
    { key: 'type', header: t('coop.outcomes.result'), render: (o) => <Badge>{t(`extension.shared.outcomeType.${o.outcomeType}`)}</Badge> },
    { key: 'loss', header: t('coop.outcomes.loss'), className: 'text-right', render: (o) => (o.lossPercent != null ? `${num(o.lossPercent, 0)}%` : '—') },
    { key: 'mat', header: t('coop.outcomes.materialized'), render: (o) => (o.riskMaterialized == null ? '—' : o.riskMaterialized ? t('actions.yes') : t('actions.no')) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={coop?.name || t('coop.dashboard.title')}
        subtitle={t('coop.dashboard.subtitle', { members: d.members ?? 0, district: coop?.district || '—' })}
        badge={coop?.isDemo ? <DemoBadge /> : null}
        actions={(
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => q.refetch()} loading={q.isFetching && !regen.isPending}>{t('actions.refresh')}</Button>
            <Button icon={TrendingUp} loading={regen.isPending} onClick={() => { setSuccess(null); regen.mutate(); }}>{t('coop.regenerate')}</Button>
          </>
        )}
      />
      <SuccessNote onClose={() => setSuccess(null)}>{success}</SuccessNote>
      <FormError error={regen.error} />

      <PortfolioStats cards={d.cards} onNavigate={{ farms: () => navigate(`${BASE}/farms`), alerts: () => navigate(`${BASE}/alerts`), forecast: () => navigate(`${BASE}/forecast`) }} />
      <Notice tone="info">{d.forecastSummary?.uncertaintyNote || t('extension.shared.uncertainty')}</Notice>

      <Section
        title={t('coop.dashboard.map')}
        subtitle={t('extension.shared.farmsCount', { n: d.farms.length })}
        icon={MapIcon}
        action={<Link to={`${BASE}/map`} className="text-sm font-semibold text-ocean-700 hover:underline">{t('coop.dashboard.openMap')} →</Link>}
        bodyClassName="p-2 sm:p-3"
      >
        {d.farms.length ? <FarmMap farms={d.farms} height={380} linkTo={(f) => `${BASE}/farms/${f.id}`} /> : <EmptyState title={t('extension.shared.noFarms')} />}
      </Section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t('coop.dashboard.highRisk')} subtitle={t('coop.dashboard.highRiskSub')} icon={AlertTriangle} className="lg:col-span-2" bodyClassName="p-0 sm:p-0">
          <HighRiskFarmsTable farms={d.highRiskFarms} base={BASE} />
        </Section>
        <Section title={t('extension.shared.missingTitle')} subtitle={t('extension.shared.stats.missingReportsSub')} icon={ClipboardX}>
          <MissingReportsList farms={d.missingReportFarms} base={BASE} />
        </Section>
      </div>

      <Section
        title={t('coop.dashboard.recentAlerts')}
        icon={Bell}
        action={<Link to={`${BASE}/alerts`} className="text-sm font-semibold text-ocean-700 hover:underline">{t('coop.dashboard.allAlerts')} →</Link>}
      >
        <AlertList alerts={(d.recentAlerts || []).slice(0, 8)} base={BASE} compact />
      </Section>

      <PortfolioCharts charts={d.charts} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('coop.perf.title')} subtitle={t('coop.perf.subtitle')} icon={TrendingUp} bodyClassName="p-0 sm:p-0">
          <Table columns={perfColumns} rows={(d.performance || []).slice(0, 10)} rowKey="farmId" empty={<div className="p-4"><EmptyState title={t('coop.perf.empty')} /></div>} />
        </Section>
        <Section title={t('coop.outcomes.title')} subtitle={t('coop.outcomes.subtitle')} icon={Target} bodyClassName="p-0 sm:p-0">
          <Table columns={outcomeColumns} rows={(d.outcomes || []).slice(0, 12)} empty={<div className="p-4"><EmptyState title={t('coop.outcomes.empty')} /></div>} />
        </Section>
      </div>
    </div>
  );
}
