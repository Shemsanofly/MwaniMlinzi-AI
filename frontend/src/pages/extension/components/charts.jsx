import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, ErrorBar, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { RISK_LEVELS, riskStyle } from '../../../utils/risk.js';
import { date, num } from '../../../utils/format.js';

/** Non-risk series colours (validated categorical pair); risk levels always use riskStyle(level).hex. */
export const SERIES = { primary: '#16718c', secondary: '#8b5cf6', range: '#0a3f56' };
const AXIS = { tick: { fontSize: 12, fill: '#64748b' }, axisLine: { stroke: '#cbd5e1' }, tickLine: false };
const GRID = <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />;
const legendText = (v) => <span style={{ color: '#334155' }}>{v}</span>;
const TOOLTIP_STYLE = { contentStyle: { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }, cursor: { fill: 'rgba(22,113,140,0.06)' } };

/** Fixed-height chart frame; ResponsiveContainer handles the width. */
export function ChartFrame({ height = 260, label, children }) {
  return (
    <div style={{ width: '100%', height }} aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

/** Farms per overall risk level, bars coloured by level. */
export function RiskDistributionChart({ data = [], height = 240 }) {
  const { t } = useI18n();
  const rows = data.map((d) => ({ ...d, label: t(`risk.level.${d.level}`) }));
  return (
    <ChartFrame height={height} label={t('extension.shared.charts.riskDistribution')}>
      <BarChart data={rows} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v, t('extension.shared.charts.farms')]} />
        <Bar dataKey="farms" radius={[4, 4, 0, 0]} maxBarSize={56} label={{ position: 'top', fontSize: 12, fill: '#334155' }}>
          {rows.map((r) => <Cell key={r.level} fill={riskStyle(r.level).hex} />)}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Stacked bars: how many farms are at each level, per risk type. */
export function RiskByTypeChart({ data = [], height = 240 }) {
  const { t } = useI18n();
  const rows = data.map((d) => ({ ...d, label: t(`risk.type.${d.riskType}`) }));
  return (
    <ChartFrame height={height} label={t('extension.shared.charts.byType')}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...AXIS} />
        <YAxis type="category" dataKey="label" width={118} {...AXIS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} itemSorter={(item) => RISK_LEVELS.indexOf(item.dataKey)} />
        {RISK_LEVELS.map((l) => (
          <Bar key={l} dataKey={l} name={t(`risk.level.${l}`)} stackId="lvl" fill={riskStyle(l).hex} stroke="#ffffff" strokeWidth={1} maxBarSize={28} />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

function HarvestTooltip({ active, payload, unitLabel, fmt }) {
  const { t, lang } = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs shadow-sm">
      <p className="font-semibold text-slate-900">{t('extension.shared.charts.weekOf', { date: date(d.key, lang) })}</p>
      <p className="text-slate-700">{t('extension.shared.charts.riskAdjusted')}: <b>{fmt(d.riskAdjustedKg)} {unitLabel}</b></p>
      <p className="text-slate-600">{t('common.range')}: {fmt(d.lowKg)}–{fmt(d.highKg)} {unitLabel}</p>
      <p className="text-slate-600">{t('extension.shared.charts.expected')}: {fmt(d.expectedKg)} {unitLabel}</p>
      <p className="text-slate-500">{t('extension.shared.charts.farms')}: {d.farms}</p>
    </div>
  );
}

/**
 * Weekly harvest forecast: bars = risk-adjusted quantity, whiskers = low–high range,
 * dashed line = expected quantity before risk adjustment. `unit` is 'kg' or 't' (tonnes).
 */
export function HarvestWeeklyChart({ data = [], unit = 'kg', height = 280 }) {
  const { t, lang } = useI18n();
  const div = unit === 't' ? 1000 : 1;
  const fmt = (v) => num(v, unit === 't' ? 2 : 0);
  const unitLabel = unit === 't' ? t('extension.shared.units.tonnes') : 'kg';
  const rows = data.map((d) => {
    const ra = d.riskAdjustedKg / div;
    return {
      ...d,
      label: date(d.key, lang).replace(/\s\d{4}$/, ''),
      ra,
      exp: d.expectedKg / div,
      err: [Math.max(0, ra - d.lowKg / div), Math.max(0, d.highKg / div - ra)],
      riskAdjustedKg: d.riskAdjustedKg / div,
      lowKg: d.lowKg / div,
      highKg: d.highKg / div,
      expectedKg: d.expectedKg / div,
    };
  });
  return (
    <ChartFrame height={height} label={t('extension.shared.charts.harvestByWeek')}>
      <ComposedChart data={rows} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} tickFormatter={(v) => num(v, unit === 't' ? 1 : 0)} label={{ value: unitLabel, angle: -90, position: 'insideLeft', offset: 18, fontSize: 11, fill: '#64748b' }} />
        <Tooltip content={<HarvestTooltip unitLabel={unitLabel} fmt={fmt} />} cursor={TOOLTIP_STYLE.cursor} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
        <Bar dataKey="ra" name={t('extension.shared.charts.riskAdjustedRange')} fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={48}>
          <ErrorBar dataKey="err" width={8} strokeWidth={2} stroke={SERIES.range} direction="y" />
        </Bar>
        <Line dataKey="exp" name={t('extension.shared.charts.expected')} stroke={SERIES.secondary} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} type="monotone" />
      </ComposedChart>
    </ChartFrame>
  );
}

/** Observations and farmer actions recorded per day. */
export function ActivityChart({ data = [], height = 240 }) {
  const { t, lang } = useI18n();
  const rows = data.map((d) => ({ ...d, label: date(d.date, lang).replace(/\s\d{4}$/, '') }));
  return (
    <ChartFrame height={height} label={t('extension.shared.charts.activity')}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={24} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
        <Bar dataKey="count" name={t('extension.shared.charts.observationsSeries')} fill={SERIES.primary} radius={[3, 3, 0, 0]} />
        <Bar dataKey="actions" name={t('extension.shared.charts.actionsSeries')} fill={SERIES.secondary} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

/** Generic single-series bar chart (horizontal when `vertical`). */
export function SimpleBarChart({ data = [], xKey, yKey, name, color = SERIES.primary, height = 220, vertical = false, valueFormatter, labelWidth = 110 }) {
  const fmt = valueFormatter || ((v) => num(v, 1));
  if (vertical) {
    return (
      <ChartFrame height={height} label={name}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis type="category" dataKey={xKey} width={labelWidth} {...AXIS} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [fmt(v), name]} />
          <Bar dataKey={yKey} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={24} label={{ position: 'right', fontSize: 12, fill: '#334155', formatter: fmt }} />
        </BarChart>
      </ChartFrame>
    );
  }
  return (
    <ChartFrame height={height} label={name}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
        {GRID}
        <XAxis dataKey={xKey} {...AXIS} />
        <YAxis allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [fmt(v), name]} />
        <Bar dataKey={yKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={48} label={{ position: 'top', fontSize: 12, fill: '#334155', formatter: fmt }} />
      </BarChart>
    </ChartFrame>
  );
}

/** Small-multiple line chart for one environmental variable (one axis per chart). */
export function EnvLineChart({ data = [], dataKey, name, unit, color = SERIES.primary, height = 160, referenceZero = false }) {
  const { lang } = useI18n();
  const rows = data.filter((d) => d[dataKey] != null).map((d) => ({ ...d, label: date(d.observedAt, lang).replace(/\s\d{4}$/, '') }));
  return (
    <ChartFrame height={height} label={name}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={20} />
        <YAxis {...AXIS} domain={referenceZero ? [(min) => Math.min(0, Math.floor(min)), 'auto'] : ['auto', 'auto']} tickFormatter={(v) => num(v, 2)} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${num(v, 2)} ${unit}`, name]} />
        <Line dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} type="monotone" />
      </LineChart>
    </ChartFrame>
  );
}
