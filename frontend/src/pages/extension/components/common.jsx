import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, FlaskConical } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { alertApi, riskApi } from '../../../api/endpoints.js';
import { Badge, Button, Card, CardHeader, Field, FormError, Modal, Notice, RiskBadge, cx } from '../../../components/ui/index.jsx';
import { RISK_TYPES, riskStyle } from '../../../utils/risk.js';
import { dateTime, num, pct, timeAgo } from '../../../utils/format.js';

/** '/cooperative' or '/extension' depending on which staff area the page is rendered in. */
export function useStaffBase() {
  const { pathname } = useLocation();
  return pathname.startsWith('/cooperative') ? '/cooperative' : '/extension';
}

/** Card with a header and padded body. */
export function Section({ title, subtitle, icon, action, children, className, bodyClassName }) {
  return (
    <Card className={cx('min-w-0', className)}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} />
      <div className={cx('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </Card>
  );
}

const SHORT = { HEAT_ICE_ICE: 'HEAT', STORM_LINE_DAMAGE: 'STORM', POOR_GROWTH: 'GROWTH', HARVEST_WINDOW: 'HARVEST' };

/** Four tiny chips — one per risk type — coloured by that type's latest level. */
export function RiskMiniBadges({ latestRisks }) {
  const { t } = useI18n();
  if (!latestRisks) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {RISK_TYPES.map((rt) => {
        const r = latestRisks[rt];
        const title = `${t(`risk.type.${rt}`)}: ${r ? `${t(`risk.level.${r.level}`)} (${pct(r.probability)})` : '—'}`;
        return (
          <span key={rt} title={title} aria-label={title} className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset', r ? riskStyle(r.level).badge : 'bg-slate-50 text-slate-400 ring-slate-200')}>
            {t(`extension.shared.short.${SHORT[rt]}`)}
          </span>
        );
      })}
    </div>
  );
}

/** Harvest forecast summary for a farm DTO: date + risk-adjusted kg (with range in the title). */
export function FarmForecastCell({ farm }) {
  const { t, lang } = useI18n();
  const f = farm.forecast;
  if (!f) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-nowrap" title={`${t('common.range')}: ${num(f.lowQuantityKg, 0)}–${num(f.highQuantityKg, 0)} kg`}>
      <p>{new Date(f.expectedHarvestDate).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { day: 'numeric', month: 'short' })}</p>
      <p className="text-xs text-slate-500">{num(f.riskAdjustedQuantityKg, 0)} kg ({num(f.lowQuantityKg, 0)}–{num(f.highQuantityKg, 0)})</p>
    </div>
  );
}

/** One alert row with severity, farm, bilingual title/message and acknowledge/resolve actions. */
export function AlertItem({ alert, farmLink, onChanged, compact = false }) {
  const { t, tx, lang } = useI18n();
  const qc = useQueryClient();
  const [done, setDone] = useState(null);
  const m = useMutation({
    mutationFn: (status) => alertApi.update(alert.id, status),
    onSuccess: (_d, status) => {
      setDone(status);
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['coopDashboard'] });
      qc.invalidateQueries({ queryKey: ['extDashboard'] });
      qc.invalidateQueries({ queryKey: ['farmAlerts'] });
      onChanged?.();
    },
  });
  const status = done || alert.status;
  const farm = alert.farm;
  return (
    <li className={cx('flex flex-col gap-2 border-l-4 bg-white py-3 pl-3 pr-2 sm:flex-row sm:items-start sm:justify-between', riskStyle(alert.severity).border)}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <RiskBadge level={alert.severity} />
          <Badge>{t(`extension.shared.alertType.${alert.type}`)}</Badge>
          {status !== 'ACTIVE' && <Badge className="bg-slate-50 text-slate-600 ring-slate-200"><CheckCircle2 className="h-3 w-3" />{t(`extension.shared.alertStatus.${status}`)}</Badge>}
          {alert.isSimulation && <Badge className="bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-300"><FlaskConical className="h-3 w-3" />{t('source.SIMULATION')}</Badge>}
          {(farm?.isDemo || alert.isDemo) && <Badge className="bg-violet-50 text-violet-800 ring-violet-300">{t('source.demoBadge')}</Badge>}
        </div>
        <p className="mt-1 font-semibold text-slate-900">{tx(alert, 'title')}</p>
        {!compact && <p className="text-sm text-slate-600">{tx(alert, 'message')}</p>}
        <p className="mt-0.5 text-xs text-slate-500">
          {farm && (farmLink ? <Link className="font-semibold text-ocean-700 hover:underline" to={farmLink}>{farm.farmCode} · {farm.name}</Link> : <span>{farm.farmCode} · {farm.name}</span>)}
          {farm && ' · '}
          <time dateTime={alert.createdAt} title={dateTime(alert.createdAt, lang)}>{timeAgo(alert.createdAt, lang)}</time>
        </p>
        {m.error && <div className="mt-2"><FormError error={m.error} /></div>}
      </div>
      {status !== 'RESOLVED' && (
        <div className="flex shrink-0 gap-2">
          {status === 'ACTIVE' && <Button size="sm" variant="secondary" loading={m.isPending && m.variables === 'ACKNOWLEDGED'} disabled={m.isPending} onClick={() => m.mutate('ACKNOWLEDGED')}>{t('actions.acknowledge')}</Button>}
          <Button size="sm" variant="success" loading={m.isPending && m.variables === 'RESOLVED'} disabled={m.isPending} onClick={() => m.mutate('RESOLVED')}>{t('actions.resolve')}</Button>
        </div>
      )}
    </li>
  );
}

export function AlertList({ alerts = [], base, compact, emptyText }) {
  const { t } = useI18n();
  if (!alerts.length) return <p className="flex items-center gap-2 text-sm text-slate-500"><Bell className="h-4 w-4" aria-hidden />{emptyText || t('extension.shared.alerts.empty')}</p>;
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
      {alerts.map((a) => <AlertItem key={a.id} alert={a} compact={compact} farmLink={base && (a.farm?.id || a.farmId) ? `${base}/farms/${a.farm?.id || a.farmId}` : null} />)}
    </ul>
  );
}

/**
 * Generic "review with note" modal used for observations, recommendations and action validation.
 * `options` = [{ value, label, variant }] — each renders a submit button.
 */
export function NoteDecisionModal({ open, onClose, title, description, options, onSubmit, pending, error, noteLabel, noteRequired = false, children }) {
  const { t } = useI18n();
  const [note, setNote] = useState('');
  const [choice, setChoice] = useState(null);
  const [touched, setTouched] = useState(false);
  const noteMissing = noteRequired && !note.trim();
  const submit = (value) => {
    setTouched(true);
    if (noteMissing) return;
    setChoice(value);
    onSubmit(value, note.trim());
  };
  const close = () => { setNote(''); setTouched(false); onClose(); };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={(
        <>
          <Button variant="ghost" onClick={close}>{t('actions.cancel')}</Button>
          {options.map((o) => (
            <Button key={o.value} variant={o.variant || 'primary'} icon={o.icon} loading={pending && choice === o.value} disabled={pending} onClick={() => submit(o.value)}>{o.label}</Button>
          ))}
        </>
      )}
    >
      <div className="space-y-3">
        {description && <p className="text-sm text-slate-600">{description}</p>}
        {children}
        <Field label={noteLabel || t('extension.shared.note')} htmlFor="decision-note" required={noteRequired} error={touched && noteMissing ? t('extension.shared.noteRequired') : null}>
          <textarea id="decision-note" className="input min-h-24" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormError error={error} />
      </div>
    </Modal>
  );
}

const FEEDBACK = ['FLAGGED', 'FALSE_POSITIVE', 'FALSE_NEGATIVE', 'CORRECT'];

/** Extension/admin feedback on a prediction → POST /risk/predictions/:id/flag. */
export function FlagPredictionModal({ prediction, open, onClose, onDone }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [feedbackType, setFeedbackType] = useState('FLAGGED');
  const [touched, setTouched] = useState(false);
  const m = useMutation({
    mutationFn: () => riskApi.flag(prediction.id, { reason: reason.trim(), feedbackType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risks'] });
      qc.invalidateQueries({ queryKey: ['extRecommendations'] });
      setReason('');
      setTouched(false);
      onDone?.(feedbackType);
      onClose();
    },
  });
  if (!prediction) return null;
  const missing = !reason.trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('extension.shared.flag.title')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button loading={m.isPending} onClick={() => { setTouched(true); if (!missing) m.mutate(); }}>{t('extension.shared.flag.submit')}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {prediction.riskType && <span className="font-semibold text-slate-800">{t(`risk.type.${prediction.riskType}`)}</span>}
          <RiskBadge level={prediction.riskLevel} />
          {prediction.probability != null && <span className="text-slate-600">{pct(prediction.probability)}</span>}
        </div>
        <Notice tone="info">{t('extension.shared.flag.help')}</Notice>
        <Field label={t('extension.shared.flag.type')} htmlFor="flag-type" required>
          <select id="flag-type" className="input" value={feedbackType} onChange={(e) => setFeedbackType(e.target.value)}>
            {FEEDBACK.map((f) => <option key={f} value={f}>{t(`extension.shared.feedbackType.${f}`)}</option>)}
          </select>
        </Field>
        <Field label={t('extension.shared.flag.reason')} htmlFor="flag-reason" required error={touched && missing ? t('extension.shared.noteRequired') : null}>
          <textarea id="flag-reason" className="input min-h-24" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('extension.shared.flag.reasonPlaceholder')} />
        </Field>
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

/** Pretty labels for observation symptom flags. */
export function SymptomChips({ obs }) {
  const { t } = useI18n();
  const flags = ['whitening', 'breakage', 'epiphytes', 'diseaseSymptoms', 'unusualGrowth'].filter((k) => obs[k]);
  return (
    <div className="flex flex-wrap gap-1">
      {obs.cropCondition && (
        <Badge className={obs.cropCondition === 'POOR' ? 'bg-red-50 text-red-800 ring-red-200' : obs.cropCondition === 'FAIR' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-seaweed-50 text-seaweed-700 ring-seaweed-100'}>
          {t(`extension.shared.cropCondition.${obs.cropCondition}`)}
        </Badge>
      )}
      {flags.map((f) => <Badge key={f} className="bg-orange-50 text-orange-800 ring-orange-200">{t(`extension.shared.symptom.${f}`)}</Badge>)}
      {obs.percentAffected != null && <Badge>{t('extension.shared.percentAffected', { n: num(obs.percentAffected, 0) })}</Badge>}
      {!flags.length && obs.cropCondition === 'GOOD' && <span className="text-xs text-slate-500">{t('extension.shared.noSymptoms')}</span>}
    </div>
  );
}

export function ReviewStatusBadge({ status }) {
  const { t } = useI18n();
  const cls = { PENDING: 'bg-amber-50 text-amber-800 ring-amber-300', REVIEWED: 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30', FLAGGED: 'bg-red-50 text-red-800 ring-red-300' }[status];
  return <Badge className={cls}>{t(`extension.shared.reviewStatus.${status}`)}</Badge>;
}

/** Small success banner shown after a mutation. */
export function SuccessNote({ children, onClose }) {
  if (!children) return null;
  return (
    <Notice tone="success" icon={CheckCircle2} className="mb-4">
      <div className="flex items-start justify-between gap-2">
        <span>{children}</span>
        {onClose && <button type="button" className="text-xs font-semibold underline" onClick={onClose}>OK</button>}
      </div>
    </Notice>
  );
}
