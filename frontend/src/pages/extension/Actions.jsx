import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { actionApi } from '../../api/endpoints.js';
import { RISK_ICON } from '../../components/risk/RiskComponents.jsx';
import { Badge, Button, Card, EmptyState, ErrorState, Notice, PageHeader, PageLoader, RiskBadge, cx } from '../../components/ui/index.jsx';
import { RISK_TYPES } from '../../utils/risk.js';
import { dateTime, num } from '../../utils/format.js';
import { NoteDecisionModal, SuccessNote } from './components/common.jsx';
import { useAuth } from '../../stores/AuthContext.jsx';

const OPS = { lt: '<', lte: '≤', gt: '>', gte: '≥', eq: '=', neq: '≠' };

/** Renders [{feature, op, value}] as readable "feature ≥ value" chips. */
function Conditions({ conditions }) {
  const { t } = useI18n();
  if (!Array.isArray(conditions) || !conditions.length) return <span className="text-slate-500">{t('extension.actions.noConditions')}</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {conditions.map((c) => (
        <li key={`${c.feature}-${c.op}-${String(c.value)}`} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
          {c.feature} {OPS[c.op] || c.op} {typeof c.value === 'boolean' ? (c.value ? t('actions.yes') : t('actions.no')) : String(c.value)}
        </li>
      ))}
    </ul>
  );
}

function ActionRow({ action, canValidate, onValidated }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const m = useMutation({
    mutationFn: ({ validated, note }) => actionApi.validate(action.id, validated, note),
    onSuccess: (_d, v) => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['actionLibrary'] });
      onValidated(t(v.validated ? 'extension.actions.validatedOk' : 'extension.actions.unvalidatedOk', { code: action.code }));
    },
  });
  const isDemoRule = /demo/i.test(action.source || '');
  return (
    <li className={cx('p-4', !action.enabled && 'bg-slate-50 opacity-80')}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-semibold text-slate-500">{action.code}</span>
            <span className="inline-flex items-center gap-1 text-xs text-slate-600">
              <RiskBadge level={action.minimumRiskLevel} />
              {action.maximumRiskLevel && action.maximumRiskLevel !== action.minimumRiskLevel && <>–<RiskBadge level={action.maximumRiskLevel} /></>}
              {!action.maximumRiskLevel && <span>{t('extension.actions.andAbove')}</span>}
            </span>
            <Badge>{t(`urgency.${action.urgency}`)} · {t('extension.actions.withinHours', { n: action.urgencyHours })}</Badge>
            <Badge className="bg-ocean-50 text-ocean-800 ring-ocean-200">{t(`extension.shared.cropStage.${action.cropStage}`)}</Badge>
            {!action.enabled && <Badge className="bg-slate-200 text-slate-700 ring-slate-300">{t('extension.actions.disabled')}</Badge>}
            {action.escalateToExtension && <Badge className="bg-red-50 text-red-800 ring-red-200">{t('extension.actions.escalates')}</Badge>}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('languageName.en')}</p>
              <p className="font-medium text-slate-900">{action.action}</p>
              <p className="text-sm text-slate-600">{action.explanation}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('languageName.sw')}</p>
              <p className="font-medium text-slate-900">{action.actionSw}</p>
              <p className="text-sm text-slate-600">{action.explanationSw}</p>
            </div>
          </div>
          <div className="text-sm">
            <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('extension.actions.conditions')}</span>
            <Conditions conditions={action.conditions} />
          </div>
          <p className={cx('text-xs', isDemoRule ? 'font-medium text-violet-800' : 'text-slate-500')}>{t('extension.actions.source')}: {action.source}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 lg:w-60 lg:items-end lg:text-right">
          {action.validated ? (
            <div>
              <Badge className="bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30"><ShieldCheck className="h-3 w-3" />{t('common.validated')}</Badge>
              <p className="mt-1 text-xs text-slate-500">{t('extension.actions.validatedBy', { name: action.validatedBy?.fullName || '—', date: dateTime(action.validatedAt, lang) })}</p>
              {action.validationNote && <p className="text-xs italic text-slate-600">“{action.validationNote}”</p>}
            </div>
          ) : (
            <Badge className="bg-amber-50 text-amber-800 ring-amber-300"><ShieldAlert className="h-3 w-3" />{t('common.pendingValidation')}</Badge>
          )}
          <p className="text-xs text-slate-500">{t('extension.actions.timesRecommended', { n: num(action._count?.recommendations ?? 0, 0) })}</p>
          {canValidate && (
            action.validated
              ? <Button size="sm" variant="secondary" icon={ShieldOff} onClick={() => { m.reset(); setOpen(true); }}>{t('extension.actions.removeValidation')}</Button>
              : <Button size="sm" variant="success" icon={ShieldCheck} onClick={() => { m.reset(); setOpen(true); }}>{t('extension.actions.validate')}</Button>
          )}
        </div>
      </div>
      <NoteDecisionModal
        key={open ? 'open' : 'closed'}
        open={open}
        onClose={() => setOpen(false)}
        title={action.validated ? t('extension.actions.removeValidation') : t('extension.actions.validate')}
        description={action.validated ? t('extension.actions.removeHelp') : t('extension.actions.validateHelp')}
        noteLabel={t('extension.actions.validationNote')}
        noteRequired={!action.validated}
        pending={m.isPending}
        error={m.error}
        onSubmit={(value, note) => m.mutate({ validated: value === 'VALIDATE', note })}
        options={action.validated
          ? [{ value: 'UNVALIDATE', label: t('extension.actions.removeValidation'), variant: 'danger', icon: ShieldOff }]
          : [{ value: 'VALIDATE', label: t('extension.actions.validate'), variant: 'success', icon: ShieldCheck }]}
      >
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-mono text-xs text-slate-500">{action.code}</p>
          <p className="font-medium text-slate-900">{action.action}</p>
          <p className="text-slate-700">{action.actionSw}</p>
        </div>
      </NoteDecisionModal>
    </li>
  );
}

export default function ExtensionActions() {
  const { t } = useI18n();
  const { hasRole } = useAuth();
  const canValidate = hasRole('EXTENSION_OFFICER', 'ADMIN');
  const [riskType, setRiskType] = useState('');
  const [validation, setValidation] = useState('');
  const [success, setSuccess] = useState(null);
  const q = useQuery({ queryKey: ['actionLibrary'], queryFn: () => actionApi.list() });
  const actions = useMemo(() => q.data?.actions || [], [q.data]);
  const visible = actions.filter((a) => (!riskType || a.riskType === riskType) && (!validation || (validation === 'yes' ? a.validated : !a.validated)));
  const validatedCount = actions.filter((a) => a.validated).length;
  const demoCount = actions.filter((a) => /demo/i.test(a.source || '')).length;

  return (
    <div className="space-y-5">
      <PageHeader title={t('extension.actions.title')} subtitle={t('extension.actions.subtitle')} />
      <Notice tone="warning" icon={AlertTriangle}>
        <p className="font-semibold">{t('extension.actions.demoWarningTitle')}</p>
        <p>{t('extension.actions.demoWarning')}</p>
      </Notice>
      <SuccessNote onClose={() => setSuccess(null)}>{success}</SuccessNote>

      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
              <div>
                <label className="label" htmlFor="al-rt">{t('extension.actions.riskType')}</label>
                <select id="al-rt" className="input" value={riskType} onChange={(e) => setRiskType(e.target.value)}>
                  <option value="">{t('common.all')}</option>
                  {RISK_TYPES.map((rt) => <option key={rt} value={rt}>{t(`risk.type.${rt}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="al-val">{t('extension.actions.validation')}</label>
                <select id="al-val" className="input" value={validation} onChange={(e) => setValidation(e.target.value)}>
                  <option value="">{t('common.all')}</option>
                  <option value="yes">{t('common.validated')}</option>
                  <option value="no">{t('common.pendingValidation')}</option>
                </select>
              </div>
            </div>
            <p className="text-sm text-slate-600">{t('extension.actions.summary', { total: actions.length, validated: validatedCount, demo: demoCount })}</p>
          </div>

          {visible.length === 0 ? <EmptyState icon={BookOpen} title={t('extension.actions.empty')} /> : RISK_TYPES.filter((rt) => visible.some((a) => a.riskType === rt)).map((rt) => {
            const Icon = RISK_ICON[rt] || BookOpen;
            const group = visible.filter((a) => a.riskType === rt);
            return (
              <Card key={rt}>
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                  <Icon className="h-5 w-5 text-ocean-600" aria-hidden />
                  <h2 className="font-semibold text-slate-900">{t(`risk.type.${rt}`)}</h2>
                  <span className="text-sm text-slate-500">({group.length})</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {group.map((a) => <ActionRow key={a.id} action={a} canValidate={canValidate} onValidated={setSuccess} />)}
                </ul>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
