import { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { RISK_TYPES, riskStyle } from '../../../utils/risk.js';
import { dateTime } from '../../../utils/format.js';

/** Categorical series colours (fixed order, one per risk type) — risk-level colours are reserved for thresholds. */
const SERIES = { HEAT_ICE_ICE: '#2a78d6', STORM_LINE_DAMAGE: '#eb6834', POOR_GROWTH: '#1baf7a', HARVEST_WINDOW: '#a855f7' };
const DEFAULT_THRESHOLDS = { MEDIUM: 0.3, HIGH: 0.6, CRITICAL: 0.8 };

/** Groups predictions from one risk run (same minute) into one chart row. */
function toRows(predictions) {
  const rows = new Map();
  for (const p of predictions) {
    const key = new Date(p.createdAt).toISOString().slice(0, 16);
    if (!rows.has(key)) rows.set(key, { t: new Date(p.createdAt).getTime() });
    rows.get(key)[p.riskType] = Math.round(p.probability * 1000) / 10;
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

export default function RiskHistoryChart({ predictions = [], thresholds }) {
  // Bands come from the backend's effective (admin-editable) thresholds.
  const th = { ...DEFAULT_THRESHOLDS, ...(thresholds || {}) };
  const THRESHOLDS = ['MEDIUM', 'HIGH', 'CRITICAL'].map((level) => ({ y: Math.round(th[level] * 100), level }));
  const { t, lang } = useI18n();
  const rows = useMemo(() => toRows(predictions), [predictions]);
  const types = RISK_TYPES.filter((rt) => predictions.some((p) => p.riskType === rt));
  const fmtDay = (v) => new Date(v).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short' });
  return (
    <div role="img" aria-label={t('farmer.risk.chartAria')}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtDay} tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" minTickGap={24} />
          <YAxis domain={[0, 100]} ticks={[0, ...THRESHOLDS.map((x) => x.y), 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" width={48} />
          {THRESHOLDS.map(({ y, level }) => (
            <ReferenceLine key={y} y={y} stroke={riskStyle(level).hex} strokeDasharray="4 4" strokeOpacity={0.7}
              label={{ value: t(`risk.level.${level}`), position: 'insideTopRight', fontSize: 10, fill: '#475569' }} />
          ))}
          <Tooltip
            labelFormatter={(v) => dateTime(v, lang)}
            formatter={(value, name) => [`${value}%`, t(`risk.type.${name}`)]}
            contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
          />
          <Legend formatter={(name) => <span className="text-xs text-slate-700">{t(`risk.type.${name}`)}</span>} wrapperStyle={{ fontSize: 12 }} />
          {types.map((rt) => (
            <Line key={rt} type="monotone" dataKey={rt} name={rt} stroke={SERIES[rt]} strokeWidth={2} dot={rows.length < 25 ? { r: 3, strokeWidth: 0, fill: SERIES[rt] } : false} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
