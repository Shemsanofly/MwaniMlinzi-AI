import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Flag, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { extensionApi } from '../../../api/endpoints.js';
import { Badge, Button, Card, Notice, RiskBadge, cx } from '../../../components/ui/index.jsx';
import { riskStyle } from '../../../utils/risk.js';
import { dateTime, pct, timeAgo } from '../../../utils/format.js';
import { FlagPredictionModal, NoteDecisionModal, ReviewStatusBadge, SymptomChips } from './common.jsx';
import ObservationImage from './ObservationImage.jsx';

const invalidateReviews = (qc) => {
  ['extObservations', 'extRecommendations', 'extDashboard', 'observations', 'recommendations'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
};

/** Farmer/officer observation with symptoms, photo and (optionally) review controls. */
export function ObservationCard({ obs, farmLink, canReview = false }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const m = useMutation({
    mutationFn: ({ status, note }) => extensionApi.reviewObservation(obs.id, status, note),
    onSuccess: (_d, v) => {
      setOpen(false);
      setMessage(t(v.status === 'FLAGGED' ? 'extension.reviews.flaggedOk' : 'extension.reviews.reviewedOk'));
      invalidateReviews(qc);
    },
  });
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        {obs.image?.id && <ObservationImage imageId={obs.image.id} alt={t('extension.reviews.photoOf', { farm: obs.farm?.farmCode || '' })} />}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              {obs.farm && (farmLink
                ? <Link to={farmLink} className="font-semibold text-ocean-700 hover:underline">{obs.farm.farmCode} · {obs.farm.name}</Link>
                : <p className="font-semibold text-slate-900">{obs.farm.farmCode} · {obs.farm.name}</p>)}
              <p className="text-xs text-slate-500">
                {t('extension.reviews.reportedBy', { name: obs.reporter?.fullName || '—' })} · <time title={dateTime(obs.observedAt, lang)}>{timeAgo(obs.observedAt, lang)}</time>
                {obs.channel && ` · ${obs.channel}`}
              </p>
            </div>
            <ReviewStatusBadge status={obs.reviewStatus} />
          </div>
          <SymptomChips obs={obs} />
          {obs.diseases?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {obs.diseases.map((dz) => <Badge key={dz.id} className="bg-red-50 text-red-800 ring-red-200">{t(`extension.shared.diseaseType.${dz.diseaseType}`)}{dz.severity ? ` · ${t(`risk.level.${dz.severity}`)}` : ''}</Badge>)}
            </div>
          )}
          {obs.notes && <p className="text-sm text-slate-700">“{obs.notes}”</p>}
          {obs.reviewNote && <p className="text-xs text-slate-600"><span className="font-semibold">{t('extension.reviews.reviewNote')}:</span> {obs.reviewNote}{obs.reviewedBy?.fullName ? ` — ${obs.reviewedBy.fullName}` : ''}</p>}
          {message && <Notice tone="success" icon={CheckCircle2}>{message}</Notice>}
          {canReview && (
            <div className="pt-1">
              <Button size="sm" variant={obs.reviewStatus === 'PENDING' ? 'primary' : 'secondary'} onClick={() => { m.reset(); setOpen(true); }}>
                {obs.reviewStatus === 'PENDING' ? t('extension.reviews.review') : t('extension.reviews.reReview')}
              </Button>
            </div>
          )}
        </div>
      </div>
      <NoteDecisionModal
        key={open ? 'open' : 'closed'}
        open={open}
        onClose={() => setOpen(false)}
        title={t('extension.reviews.reviewObservation')}
        description={t('extension.reviews.reviewObservationHelp')}
        pending={m.isPending}
        error={m.error}
        onSubmit={(status, note) => m.mutate({ status, note })}
        options={[
          { value: 'FLAGGED', label: t('extension.reviews.flag'), variant: 'danger', icon: Flag },
          { value: 'REVIEWED', label: t('extension.reviews.markReviewed'), variant: 'success', icon: CheckCircle2 },
        ]}
      />
    </Card>
  );
}

/** Recommendation review: prediction, approved action, validation state; review / flag the prediction. */
export function RecommendationCard({ rec, farmLink }) {
  const { t, tx, lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const m = useMutation({
    mutationFn: ({ status, note }) => extensionApi.reviewRecommendation(rec.id, status, note),
    onSuccess: (_d, v) => {
      setOpen(false);
      setMessage(t(v.status === 'FLAGGED' ? 'extension.reviews.flaggedOk' : 'extension.reviews.reviewedOk'));
      invalidateReviews(qc);
    },
  });
  const p = rec.prediction;
  const action = rec.actionLibrary;
  return (
    <Card className={cx('border-l-4 p-4', riskStyle(p?.riskLevel).border)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {rec.farm && (farmLink
            ? <Link to={farmLink} className="font-semibold text-ocean-700 hover:underline">{rec.farm.farmCode} · {rec.farm.name}</Link>
            : <p className="font-semibold text-slate-900">{rec.farm.farmCode} · {rec.farm.name}</p>)}
          <p className="text-xs text-slate-500"><time title={dateTime(rec.createdAt, lang)}>{timeAgo(rec.createdAt, lang)}</time> · {t(`extension.shared.recStatus.${rec.status}`)}</p>
        </div>
        <ReviewStatusBadge status={rec.reviewStatus} />
      </div>
      {p && (
        <div className="mt-2 rounded-lg bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{t(`risk.type.${p.riskType}`)}</span>
            <RiskBadge level={p.riskLevel} />
            <span className="text-sm text-slate-600">{t('risk.probability')}: <b>{pct(p.probability)}</b></span>
            {p.flagged && <Badge className="bg-amber-50 text-amber-800 ring-amber-300"><Flag className="h-3 w-3" />{t('risk.flagged')}</Badge>}
          </div>
          {p.explanation && <p className="mt-1 text-sm text-slate-600">{tx(p, 'explanation')}</p>}
        </div>
      )}
      {action && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('extension.reviews.recommendedAction')}</p>
          <p className="font-medium text-slate-900">{tx(action, 'action')}</p>
          <p className="text-xs text-slate-500">{lang === 'sw' ? action.action : action.actionSw}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {action.validated
              ? <Badge className="bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30"><ShieldCheck className="h-3 w-3" />{t('common.validated')}</Badge>
              : <Badge className="bg-amber-50 text-amber-800 ring-amber-300"><ShieldAlert className="h-3 w-3" />{t('common.pendingValidation')}</Badge>}
            <Badge>{t(`urgency.${action.urgency}`)}</Badge>
            <span className="font-mono text-[11px] text-slate-400">{action.code}</span>
          </div>
        </div>
      )}
      {rec.reviewNote && <p className="mt-2 text-xs text-slate-600"><span className="font-semibold">{t('extension.reviews.reviewNote')}:</span> {rec.reviewNote}{rec.reviewedBy?.fullName ? ` — ${rec.reviewedBy.fullName}` : ''}</p>}
      {message && <Notice tone="success" icon={CheckCircle2} className="mt-2">{message}</Notice>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={rec.reviewStatus === 'PENDING' ? 'primary' : 'secondary'} onClick={() => { m.reset(); setOpen(true); }}>
          {rec.reviewStatus === 'PENDING' ? t('extension.reviews.review') : t('extension.reviews.reReview')}
        </Button>
        {p?.id && <Button size="sm" variant="ghost" icon={Flag} onClick={() => setFlagOpen(true)}>{t('extension.shared.flag.button')}</Button>}
      </div>
      <NoteDecisionModal
        key={open ? 'open' : 'closed'}
        open={open}
        onClose={() => setOpen(false)}
        title={t('extension.reviews.reviewRecommendation')}
        description={t('extension.reviews.reviewRecommendationHelp')}
        pending={m.isPending}
        error={m.error}
        onSubmit={(status, note) => m.mutate({ status, note })}
        options={[
          { value: 'FLAGGED', label: t('extension.reviews.flag'), variant: 'danger', icon: Flag },
          { value: 'REVIEWED', label: t('extension.reviews.approve'), variant: 'success', icon: CheckCircle2 },
        ]}
      />
      <FlagPredictionModal
        prediction={p ? { ...p } : null}
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
        onDone={() => { setMessage(t('extension.shared.flag.done')); qc.invalidateQueries({ queryKey: ['extRecommendations'] }); }}
      />
    </Card>
  );
}
