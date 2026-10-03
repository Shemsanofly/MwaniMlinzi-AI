import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CalendarClock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { farmApi } from '../../../api/endpoints.js';
import { Badge, Button, FormError } from '../../../components/ui/index.jsx';
import { dateTime } from '../../../utils/format.js';
import { ActionRecordedNotice, useInvalidateFarm, useRecordAction } from './shared.jsx';

/** Wrapping badge (the shared Badge is nowrap, which overflows at 360px for long Kiswahili labels). */
export function ValidationBadge({ validated, source }) {
  const { t } = useI18n();
  const cls = validated ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-amber-50 text-amber-800 ring-amber-300';
  const Icon = validated ? ShieldCheck : ShieldAlert;
  return (
    <span title={source} className={`inline-flex max-w-full items-start gap-1 rounded-2xl px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span className="min-w-0">{validated ? t('common.validated') : t('common.pendingValidation')}</span>
    </span>
  );
}

export function RecStatusBadge({ status }) {
  const { t } = useI18n();
  const tone = { PENDING: 'bg-ocean-50 text-ocean-800 ring-ocean-200', ACKNOWLEDGED: 'bg-sky-50 text-sky-800 ring-sky-300', COMPLETED: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30', DISMISSED: 'bg-slate-100 text-slate-600 ring-slate-200', SUPERSEDED: 'bg-slate-100 text-slate-500 ring-slate-200' }[status];
  return <Badge className={tone}>{t(`farmer.enums.recStatus.${status}`)}</Badge>;
}

/** The approved recommendation attached to one prediction, with acknowledge / did it / could not. */
export default function RecommendationPanel({ recommendation, farmId }) {
  const { t, tx, lang } = useI18n();
  const invalidate = useInvalidateFarm();
  const [recorded, setRecorded] = useState(null);
  const recordAction = useRecordAction(farmId);
  const ack = useMutation({
    mutationFn: () => farmApi.updateRecommendation(farmId, recommendation.id, 'ACKNOWLEDGED'),
    onSuccess: () => invalidate(farmId),
  });
  const item = recommendation?.actionItem;
  if (!item) return null;
  const open = ['PENDING', 'ACKNOWLEDGED'].includes(recommendation.status);
  return (
    <div className="mt-2 rounded-xl border border-ocean-100 bg-ocean-50/60 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-ocean-800">{t('farmer.risk.recommendation')}</p>
      <p className="mt-1 font-semibold text-slate-900">{tx(item, 'action')}</p>
      <p className="mt-0.5 text-sm text-slate-600">{tx(item, 'explanation')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge className="bg-white text-slate-700 ring-slate-300">{t(`urgency.${item.urgency}`)}</Badge>
        <ValidationBadge validated={item.validated} source={item.source} />
        <RecStatusBadge status={recommendation.status} />
        {recommendation.dueBy && <span className="inline-flex items-center gap-1 text-xs text-slate-600"><CalendarClock className="h-3.5 w-3.5" aria-hidden />{t('farmer.risk.dueBy', { time: dateTime(recommendation.dueBy, lang) })}</span>}
      </div>
      {!item.validated && <p className="mt-1 text-xs text-slate-500">{item.source}</p>}
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="success" className="min-h-11" loading={recordAction.isPending && recordAction.variables?.actionTaken} disabled={recordAction.isPending}
            onClick={() => recordAction.mutate({ recommendationId: recommendation.id, actionTaken: true }, { onSuccess: (d) => setRecorded(d.action) })}>
            {t('farmer.action.didIt')}
          </Button>
          <Button variant="secondary" className="min-h-11" disabled={recordAction.isPending}
            onClick={() => recordAction.mutate({ recommendationId: recommendation.id, actionTaken: false }, { onSuccess: (d) => setRecorded(d.action) })}>
            {t('farmer.action.couldNot')}
          </Button>
          {recommendation.status === 'PENDING' && (
            <Button variant="ghost" className="min-h-11" loading={ack.isPending} onClick={() => ack.mutate()}>{t('actions.acknowledge')}</Button>
          )}
        </div>
      )}
      <div className="mt-2 space-y-2">
        <FormError error={recordAction.error || ack.error} />
        <ActionRecordedNotice action={recorded} onClose={() => setRecorded(null)} />
      </div>
    </div>
  );
}
