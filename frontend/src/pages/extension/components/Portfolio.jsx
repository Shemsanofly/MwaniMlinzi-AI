import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, Bell, ClipboardX, Package, Tractor, Users } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { Card, DemoBadge, EmptyState, RiskBadge, StatCard, Table } from '../../../components/ui/index.jsx';
import { date, num, pct } from '../../../utils/format.js';
import { ActivityChart, HarvestWeeklyChart, RiskByTypeChart, RiskDistributionChart, SERIES, SimpleBarChart } from './charts.jsx';
import { FarmForecastCell, RiskMiniBadges, Section } from './common.jsx';

/** Six headline cards shared by the cooperative and extension dashboards. */
export function PortfolioStats({ cards, onNavigate }) {
  const { t } = useI18n();
  const [low, high] = cards.expectedHarvestRange30d || [];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label={t('extension.shared.stats.totalFarmers')} value={num(cards.totalFarmers, 0)} icon={Users} />
      <StatCard label={t('extension.shared.stats.activeFarms')} value={num(cards.activeFarms, 0)} icon={Tractor} tone="green" onClick={onNavigate?.farms} />
      <StatCard label={t('extension.shared.stats.highRiskFarms')} value={num(cards.highRiskFarms, 0)} icon={AlertTriangle} tone={cards.highRiskFarms ? 'orange' : 'slate'} onClick={onNavigate?.farms} />
      <StatCard label={t('extension.shared.stats.criticalAlerts')} value={num(cards.criticalAlerts, 0)} sub={t('extension.shared.stats.activeAlertsSub', { n: cards.activeAlerts })} icon={Bell} tone={cards.criticalAlerts ? 'red' : 'slate'} onClick={onNavigate?.alerts} />
      <StatCard label={t('extension.shared.stats.expectedHarvest30')} value={`${num(cards.expectedHarvestKg30d, 0)} kg`} sub={t('extension.shared.stats.rangeKg', { low: num(low, 0), high: num(high, 0) })} icon={Package} tone="ocean" onClick={onNavigate?.forecast} />
      <StatCard label={t('extension.shared.stats.missingReports')} value={num(cards.missingReports, 0)} sub={t('extension.shared.stats.missingReportsSub')} icon={ClipboardX} tone={cards.missingReports ? 'amber' : 'slate'} />
    </div>
  );
}

/** All portfolio charts (risk, forecast, activity, losses, alerts, symptoms). */
export function PortfolioCharts({ charts }) {
  const { t } = useI18n();
  const losses = (charts.losses || []).map((l) => ({ ...l, label: t(`extension.shared.lossCause.${l.cause}`) }));
  const alertsByType = (charts.alertsByType || []).map((a) => ({ ...a, label: t(`extension.shared.alertType.${a.type}`) })).sort((a, b) => b.count - a.count);
  const obs = charts.observations || {};
  const symptoms = ['whitening', 'breakage', 'epiphytes', 'poorCondition'].map((k) => ({ key: k, label: t(`extension.shared.symptom.${k}`), count: obs[k] || 0 }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t('extension.shared.charts.riskDistribution')} subtitle={t('extension.shared.charts.riskDistributionSub')} icon={BarChart3}>
        <RiskDistributionChart data={charts.riskDistribution?.overall} />
      </Section>
      <Section title={t('extension.shared.charts.byType')} subtitle={t('extension.shared.charts.byTypeSub')} icon={BarChart3}>
        <RiskByTypeChart data={charts.riskDistribution?.byType} />
      </Section>
      <Section title={t('extension.shared.charts.harvestByWeek')} subtitle={t('extension.shared.charts.harvestByWeekSub')} icon={Package} className="lg:col-span-2">
        {charts.harvestForecast?.length ? <HarvestWeeklyChart data={charts.harvestForecast} /> : <EmptyState title={t('extension.shared.noForecasts')} />}
      </Section>
      <Section title={t('extension.shared.charts.activity')} subtitle={t('extension.shared.charts.activitySub')} icon={BarChart3} className="lg:col-span-2">
        <ActivityChart data={charts.farmActivity} />
      </Section>
      <Section title={t('extension.shared.charts.losses')} subtitle={t('extension.shared.charts.lossesSub')} icon={BarChart3}>
        {losses.length ? (
          <>
            <SimpleBarChart data={losses} xKey="label" yKey="kg" name={t('extension.shared.charts.kgLost')} vertical height={Math.max(160, losses.length * 44)} valueFormatter={(v) => `${num(v, 0)} kg`} />
            <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
              {losses.map((l) => <li key={l.cause}>{l.label}: {t('extension.shared.charts.lossDetail', { events: l.events, pct: num(l.avgPercent, 1) })}</li>)}
            </ul>
          </>
        ) : <EmptyState title={t('extension.shared.charts.noLosses')} />}
      </Section>
      <Section title={t('extension.shared.charts.alertsByType')} subtitle={t('extension.shared.charts.alertsByTypeSub')} icon={Bell}>
        {alertsByType.length ? <SimpleBarChart data={alertsByType} xKey="label" yKey="count" name={t('extension.shared.charts.count')} vertical labelWidth={130} height={Math.max(160, alertsByType.length * 40)} valueFormatter={(v) => num(v, 0)} /> : <EmptyState title={t('extension.shared.alerts.empty')} />}
      </Section>
      <Section title={t('extension.shared.charts.symptoms')} subtitle={t('extension.shared.charts.symptomsSub', { n: obs.total || 0 })} icon={BarChart3} className="lg:col-span-2">
        <SimpleBarChart data={symptoms} xKey="label" yKey="count" name={t('extension.shared.charts.reports')} color={SERIES.primary} height={200} valueFormatter={(v) => num(v, 0)} />
      </Section>
    </div>
  );
}

export function HighRiskFarmsTable({ farms = [], base }) {
  const { t } = useI18n();
  const columns = [
    { key: 'farm', header: t('common.farm'), render: (f) => <Link to={`${base}/farms/${f.id}`} className="font-semibold text-ocean-700 hover:underline">{f.farmCode} · {f.name}</Link> },
    { key: 'farmer', header: t('common.farmer'), render: (f) => f.farmer?.fullName || '—' },
    { key: 'risk', header: t('extension.shared.table.overallRisk'), render: (f) => <RiskBadge level={f.overallRiskLevel} /> },
    { key: 'types', header: t('extension.shared.table.riskByType'), render: (f) => <RiskMiniBadges latestRisks={f.latestRisks} /> },
    { key: 'age', header: t('common.cropAge'), render: (f) => (f.cropAgeDays != null ? t('common.days', { n: f.cropAgeDays }) : '—') },
    { key: 'fc', header: t('common.expectedHarvest'), render: (f) => <FarmForecastCell farm={f} /> },
  ];
  return <Table columns={columns} rows={farms} empty={<EmptyState title={t('extension.shared.noHighRisk')} />} />;
}

export function MissingReportsList({ farms = [], base }) {
  const { t, lang } = useI18n();
  if (!farms.length) return <p className="text-sm text-slate-500">{t('extension.shared.noMissingReports')}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {farms.map((f) => (
        <li key={f.id} className="py-2 text-sm">
          <Link to={`${base}/farms/${f.id}`} className="block font-medium text-ocean-700 hover:underline">{f.farmCode} · {f.name}</Link>
          <span className="text-xs text-slate-500">{f.farmer || '—'} · {f.lastObservation ? date(f.lastObservation, lang) : t('extension.shared.never')}</span>
        </li>
      ))}
    </ul>
  );
}

/** Horizon cards (7/14/30 days). `unit`: 'kg' or 't'. */
export function HorizonCards({ horizons, unit = 'kg' }) {
  const { t } = useI18n();
  const fmt = (v) => (unit === 't' ? tonnesText(v) : num(v, 0));
  const unitLabel = unit === 't' ? t('extension.shared.units.tonnes') : 'kg';
  const items = [['next7Days', 7], ['next14Days', 14], ['next30Days', 30]];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map(([k, days]) => {
        const h = horizons?.[k] || {};
        return (
          <Card key={k} className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('extension.shared.horizon', { n: days })}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{fmt(h.riskAdjustedKg)} <span className="text-base font-semibold text-slate-500">{unitLabel}</span></p>
            <p className="text-sm text-slate-600">{t('common.range')}: {fmt(h.lowKg)}–{fmt(h.highKg)} {unitLabel}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <span>{t('extension.shared.farmsN', { n: h.farms ?? 0 })}</span>
              <span>{t('risk.confidence')}: {h.avgConfidence != null ? pct(h.avgConfidence) : '—'}</span>
              <span>{t('extension.shared.beforeRisk', { v: `${fmt(h.expectedKg)} ${unitLabel}` })}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** "2.4" style tonnes text (1 decimal ≥ 1 t, otherwise 2). */
export function tonnesText(kgValue) {
  if (kgValue == null) return '—';
  const tonnes = kgValue / 1000;
  return num(tonnes, Math.abs(tonnes) >= 1 ? 1 : 2);
}

/** byCooperative / byDistrict aggregate table. */
export function GroupTable({ rows = [], keyHeader, unit = 'kg' }) {
  const { t } = useI18n();
  const fmt = (v) => (unit === 't' ? `${tonnesText(v)} t` : `${num(v, 0)} kg`);
  const columns = [
    { key: 'key', header: keyHeader, render: (r) => <span className="font-medium text-slate-900">{r.key}</span> },
    { key: 'farms', header: t('extension.shared.charts.farms'), className: 'text-right' },
    { key: 'ra', header: t('extension.shared.charts.riskAdjusted'), className: 'text-right', render: (r) => <b>{fmt(r.riskAdjustedKg)}</b> },
    { key: 'range', header: t('common.range'), className: 'text-right whitespace-nowrap', render: (r) => `${fmt(r.lowKg)} – ${fmt(r.highKg)}` },
    { key: 'conf', header: t('risk.confidence'), className: 'text-right', render: (r) => pct(r.avgConfidence) },
  ];
  return <Table columns={columns} rows={rows} rowKey="key" />;
}

export function DemoMark({ show }) {
  return show ? <DemoBadge /> : null;
}
