import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ShieldAlert } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { RISK_ICON } from '../../../components/risk/RiskComponents.jsx';
import { cx } from '../../../components/ui/index.jsx';
import { levelRank, riskStyle } from '../../../utils/risk.js';
import { pct } from '../../../utils/format.js';
import { sortPredictions } from './shared.jsx';

/**
 * Compact risk tiles (one per risk type): level word + probability.
 * `previous` (array of predictions) highlights tiles whose level changed.
 */
export default function RiskTiles({ predictions = [], previous, linkTo }) {
  const { t } = useI18n();
  const prevBy = Object.fromEntries((previous || []).map((p) => [p.riskType, p]));
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {sortPredictions(predictions).map((p) => {
        const Icon = RISK_ICON[p.riskType] || ShieldAlert;
        const s = riskStyle(p.riskLevel);
        const prev = prevBy[p.riskType];
        const change = prev ? Math.sign(levelRank(p.riskLevel) - levelRank(prev.riskLevel)) : 0;
        const body = (
          <>
            <div className="flex items-center gap-1.5">
              <Icon className={cx('h-4 w-4 shrink-0', s.text)} aria-hidden />
              <p className="truncate text-xs font-semibold text-slate-600">{t(`risk.type.${p.riskType}`)}</p>
            </div>
            <p className={cx('mt-1 text-lg font-bold leading-tight', s.text)}>{t(`risk.level.${p.riskLevel}`)}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-2xl font-bold text-slate-900">{pct(p.probability)}</span>
              {change !== 0 && (
                <span className={cx('inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-bold', change > 0 ? 'bg-red-100 text-red-800' : 'bg-seaweed-100 text-seaweed-700')}>
                  {change > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
                  {change > 0 ? t('farmer.riskTiles.up') : t('farmer.riskTiles.down')}
                </span>
              )}
            </div>
            {change !== 0 && prev && <p className="mt-0.5 text-xs text-slate-500">{t('farmer.riskTiles.was', { level: t(`risk.level.${prev.riskLevel}`) })}</p>}
          </>
        );
        const cls = cx('block min-h-[104px] rounded-xl border-l-4 bg-white p-3 shadow-sm ring-1 ring-slate-200', s.border, change !== 0 && 'ring-2 ring-ocean-400');
        return linkTo
          ? <Link key={p.riskType} to={linkTo} className={cx(cls, 'transition hover:bg-slate-50')} data-testid={`risk-tile-${p.riskType}`}>{body}</Link>
          : <div key={p.riskType} className={cls} data-testid={`risk-tile-${p.riskType}`}>{body}</div>;
      })}
    </div>
  );
}
