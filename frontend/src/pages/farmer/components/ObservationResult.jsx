import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { FormError, Notice, cx } from '../../../components/ui/index.jsx';
import { NextActionCard } from '../../../components/risk/RiskComponents.jsx';
import { levelRank, riskStyle } from '../../../utils/risk.js';
import RiskTiles from './RiskTiles.jsx';
import { ActionRecordedNotice, useRecordAction } from './shared.jsx';

/** Fresh risk run returned after an observation: tiles (with level changes), next action and new alerts. */
export default function ObservationResult({ risk, previous, farmId }) {
  const { t, tx, lang } = useI18n();
  const [recorded, setRecorded] = useState(null);
  const recordAction = useRecordAction(farmId);
  if (!risk) return null;
  const prevBy = Object.fromEntries((previous || []).map((p) => [p.riskType, p]));
  const changed = (risk.predictions || []).filter((p) => prevBy[p.riskType] && levelRank(prevBy[p.riskType].riskLevel) !== levelRank(p.riskLevel));
  const alerts = risk.alerts || [];
  return (
    <div className="space-y-4">
      {previous && (
        <Notice tone={changed.length ? 'warning' : 'info'}>
          {changed.length
            ? changed.map((p) => (
              <p key={p.riskType}>{t('farmer.obs.levelChanged', { type: t(`risk.type.${p.riskType}`), from: t(`risk.level.${prevBy[p.riskType].riskLevel}`), to: t(`risk.level.${p.riskLevel}`) })}</p>
            ))
            : t('farmer.obs.noLevelChange')}
        </Notice>
      )}
      <RiskTiles predictions={risk.predictions} previous={previous} />
      {risk.insufficientData && risk.insufficientDataMessage && <Notice tone="warning">{risk.insufficientDataMessage[lang]}</Notice>}
      <NextActionCard
        nextAction={risk.nextAction}
        insufficientDataMessage={risk.insufficientDataMessage}
        onRecordAction={recorded ? undefined : (rec, taken) => recordAction.mutate({ recommendationId: rec.id, actionTaken: taken }, { onSuccess: (d) => setRecorded(d.action) })}
        actionLoading={recordAction.isPending}
      />
      <FormError error={recordAction.error} />
      <ActionRecordedNotice action={recorded} />
      {alerts.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-bold text-slate-700">{t('farmer.obs.newAlerts')}</p>
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className={cx('flex items-start gap-2 rounded-lg border-l-4 bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200', riskStyle(a.severity).border)}>
                <BellRing className={cx('mt-0.5 h-4 w-4 shrink-0', riskStyle(a.severity).text)} aria-hidden />
                <div><p className="font-semibold text-slate-900">{tx(a, 'title')}</p><p className="text-slate-600">{tx(a, 'message')}</p></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
