import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Pencil, Plus, ShieldAlert, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import { actionApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, FormError, Modal, Notice, PageHeader, PageLoader, RiskBadge, Toggle, cx,
} from '../../components/ui/index.jsx';
import { RISK_LEVELS, RISK_TYPES, levelRank } from '../../utils/risk.js';
import { dateTime } from '../../utils/format.js';

const CROP_STAGES = ['ANY', 'EARLY', 'GROWING', 'MATURING', 'HARVEST_READY'];
const URGENCIES = ['ROUTINE', 'SOON', 'URGENT', 'IMMEDIATE'];
const OPS = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq'];
const OP_SYMBOL = { lt: '<', lte: '≤', gt: '>', gte: '≥', eq: '=', neq: '≠' };
const FEATURES = ['maturityRatio', 'rainfallMm', 'sstAnomalyC', 'sstAnomalyDays', 'waveHeightM', 'windSpeedKmh', 'heatProbability', 'stormProbability', 'cropAgeDays', 'currentVelocityMs', 'salinityPsu', 'exposureScore', 'obsWhitening', 'obsBreakage'];
const TEXT_FIELDS = ['action', 'actionSw', 'explanation', 'explanationSw'];
/**
 * Fields that have a default in the backend schema. The backend's partial update schema re-applies
 * those defaults when a field is omitted, so every PATCH sends their current values explicitly.
 */
const DEFAULTED = ['cropStage', 'urgency', 'urgencyHours', 'priority', 'enabled', 'escalateToExtension'];
const defaultedOf = (a) => Object.fromEntries(DEFAULTED.map((k) => [k, a[k]]));

const EMPTY = {
  code: '', riskType: 'HEAT_ICE_ICE', minimumRiskLevel: 'MEDIUM', maximumRiskLevel: '', cropStage: 'ANY', conditions: [],
  action: '', actionSw: '', explanation: '', explanationSw: '', urgency: 'SOON', urgencyHours: 72, priority: 0,
  source: '', enabled: true, escalateToExtension: false,
};

/** Parse a condition value typed in the editor: numbers and booleans become typed values. */
const parseValue = (v) => {
  const s = String(v).trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s);
  return s;
};

function ConditionsEditor({ rows, onChange }) {
  const { t } = useI18n();
  const update = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="label mb-0">{t('admin.actions.conditions')}</p>
        <Button size="sm" variant="ghost" icon={Plus} disabled={rows.length >= 10} onClick={() => onChange([...rows, { feature: '', op: 'gte', value: '' }])}>{t('admin.actions.addCondition')}</Button>
      </div>
      <datalist id="feature-suggestions">{FEATURES.map((f) => <option key={f} value={f} />)}</datalist>
      {rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">{t('admin.actions.noConditions')}</p>}
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_5.5rem_1fr_auto] gap-2">
            <input aria-label={t('admin.actions.feature')} list="feature-suggestions" className="input font-mono text-sm" placeholder="sstAnomalyC" value={r.feature} onChange={(e) => update(i, 'feature', e.target.value)} />
            <select aria-label={t('admin.actions.operator')} className="input text-sm" value={r.op} onChange={(e) => update(i, 'op', e.target.value)}>
              {OPS.map((o) => <option key={o} value={o}>{OP_SYMBOL[o]} {o}</option>)}
            </select>
            <input aria-label={t('admin.actions.value')} className="input font-mono text-sm" placeholder="1.0" value={r.value} onChange={(e) => update(i, 'value', e.target.value)} />
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={t('actions.delete')}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-slate-500">{t('admin.actions.conditionsHint')}</p>
    </div>
  );
}

function ActionModal({ open, action, onClose }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const isEdit = !!action;
  const [f, setF] = useState(EMPTY);
  const [localError, setLocalError] = useState(null);
  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setF(action ? {
      ...EMPTY, ...action,
      maximumRiskLevel: action.maximumRiskLevel || '',
      conditions: (action.conditions || []).map((c) => ({ ...c, value: String(c.value) })),
    } : EMPTY);
  }, [open, action]);

  const m = useMutation({
    mutationFn: (body) => (isEdit ? actionApi.update(action.id, body) : actionApi.create(body)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['actions'] }); onClose(true); },
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const conditionsOut = f.conditions.map((c) => ({ feature: c.feature.trim(), op: c.op, value: parseValue(c.value) }));
  const conditionsChanged = isEdit && JSON.stringify(conditionsOut) !== JSON.stringify(action.conditions || []);
  const textChanged = isEdit && (TEXT_FIELDS.some((k) => f[k].trim() !== action[k])
    || f.riskType !== action.riskType || f.minimumRiskLevel !== action.minimumRiskLevel
    || (f.maximumRiskLevel || null) !== (action.maximumRiskLevel || null) || conditionsChanged);

  const submit = (e) => {
    e.preventDefault();
    setLocalError(null);
    if (f.conditions.some((c) => !/^[A-Za-z0-9_]+$/.test(c.feature.trim()) || String(c.value).trim() === '')) {
      return setLocalError({ message: t('admin.actions.badCondition') });
    }
    if (f.maximumRiskLevel && levelRank(f.maximumRiskLevel) < levelRank(f.minimumRiskLevel)) {
      return setLocalError({ message: t('admin.actions.badRange') });
    }
    const common = {
      cropStage: f.cropStage, urgency: f.urgency, urgencyHours: Number(f.urgencyHours), priority: Number(f.priority),
      enabled: f.enabled, escalateToExtension: f.escalateToExtension, source: f.source.trim(),
    };
    if (!isEdit) {
      return m.mutate({
        ...common, code: f.code.trim().toUpperCase(), riskType: f.riskType, minimumRiskLevel: f.minimumRiskLevel,
        maximumRiskLevel: f.maximumRiskLevel || null, conditions: conditionsOut.length ? conditionsOut : null,
        action: f.action.trim(), actionSw: f.actionSw.trim(), explanation: f.explanation.trim(), explanationSw: f.explanationSw.trim(),
      });
    }
    // Only send "what the farmer is told" fields when they changed, so validation is not reset needlessly.
    const body = { ...common };
    TEXT_FIELDS.forEach((k) => { if (f[k].trim() !== action[k]) body[k] = f[k].trim(); });
    if (f.riskType !== action.riskType) body.riskType = f.riskType;
    if (f.minimumRiskLevel !== action.minimumRiskLevel) body.minimumRiskLevel = f.minimumRiskLevel;
    if ((f.maximumRiskLevel || null) !== (action.maximumRiskLevel || null)) body.maximumRiskLevel = f.maximumRiskLevel || null;
    if (conditionsChanged) body.conditions = conditionsOut.length ? conditionsOut : null;
    return m.mutate(body);
  };

  const sel = (id, k, options, labelFn, extra) => (
    <select id={id} className="input" value={f[k]} onChange={set(k)}>
      {extra}
      {options.map((o) => <option key={o} value={o}>{labelFn(o)}</option>)}
    </select>
  );

  return (
    <Modal
      open={open}
      onClose={() => onClose(false)}
      size="xl"
      title={isEdit ? t('admin.actions.editTitle', { code: action.code }) : t('admin.actions.createTitle')}
      footer={<>
        <Button variant="secondary" onClick={() => onClose(false)}>{t('actions.cancel')}</Button>
        <Button type="submit" form="action-form" loading={m.isPending}>{isEdit ? t('actions.save') : t('actions.create')}</Button>
      </>}
    >
      <form id="action-form" onSubmit={submit} className="space-y-5" noValidate>
        {isEdit ? (
          <Notice tone={textChanged && action.validated ? 'warning' : 'info'} icon={ShieldAlert}>
            {textChanged && action.validated ? t('admin.actions.resetWarning') : t('admin.actions.resetNote')}
          </Notice>
        ) : <Notice tone="info" icon={ShieldAlert}>{t('admin.actions.createNote')}</Notice>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('admin.actions.code')} htmlFor="a-code" required hint={isEdit ? t('admin.actions.codeFixed') : t('admin.actions.codeHint')}>
            <input id="a-code" className="input font-mono uppercase" value={f.code} onChange={set('code')} disabled={isEdit} />
          </Field>
          <Field label={t('admin.actions.riskType')} htmlFor="a-type" required>{sel('a-type', 'riskType', RISK_TYPES, (o) => t(`risk.type.${o}`))}</Field>
          <Field label={t('admin.actions.cropStage')} htmlFor="a-stage" required>{sel('a-stage', 'cropStage', CROP_STAGES, (o) => t(`admin.actions.stage.${o}`))}</Field>
          <Field label={t('admin.actions.minLevel')} htmlFor="a-min" required>{sel('a-min', 'minimumRiskLevel', RISK_LEVELS, (o) => t(`risk.level.${o}`))}</Field>
          <Field label={t('admin.actions.maxLevel')} htmlFor="a-max">{sel('a-max', 'maximumRiskLevel', RISK_LEVELS, (o) => t(`risk.level.${o}`), <option value="">{t('admin.actions.noMax')}</option>)}</Field>
          <Field label={t('admin.actions.urgency')} htmlFor="a-urg" required>{sel('a-urg', 'urgency', URGENCIES, (o) => t(`urgency.${o}`))}</Field>
          <Field label={t('admin.actions.urgencyHours')} htmlFor="a-hours" required hint="1–720">
            <input id="a-hours" type="number" min={1} max={720} className="input" value={f.urgencyHours} onChange={set('urgencyHours')} />
          </Field>
          <Field label={t('admin.actions.priority')} htmlFor="a-prio" required hint={t('admin.actions.priorityHint')}>
            <input id="a-prio" type="number" min={0} max={100} className="input" value={f.priority} onChange={set('priority')} />
          </Field>
          <div className="flex flex-col justify-end gap-3 pb-1">
            <Toggle id="a-enabled" checked={f.enabled} onChange={(v) => setF((x) => ({ ...x, enabled: v }))} label={t('admin.actions.enabled')} />
            <Toggle id="a-escalate" checked={f.escalateToExtension} onChange={(v) => setF((x) => ({ ...x, escalateToExtension: v }))} label={t('admin.actions.escalate')} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('admin.actions.actionEn')} htmlFor="a-action" required>
            <textarea id="a-action" rows={2} maxLength={500} className="input" value={f.action} onChange={set('action')} />
          </Field>
          <Field label={t('admin.actions.actionSw')} htmlFor="a-action-sw" required>
            <textarea id="a-action-sw" rows={2} maxLength={500} className="input" value={f.actionSw} onChange={set('actionSw')} />
          </Field>
          <Field label={t('admin.actions.explanationEn')} htmlFor="a-expl" required>
            <textarea id="a-expl" rows={3} maxLength={1000} className="input" value={f.explanation} onChange={set('explanation')} />
          </Field>
          <Field label={t('admin.actions.explanationSw')} htmlFor="a-expl-sw" required>
            <textarea id="a-expl-sw" rows={3} maxLength={1000} className="input" value={f.explanationSw} onChange={set('explanationSw')} />
          </Field>
        </div>
        <ConditionsEditor rows={f.conditions} onChange={(conditions) => setF((x) => ({ ...x, conditions }))} />
        <Field label={t('admin.actions.source')} htmlFor="a-source" required hint={t('admin.actions.sourceHint')}>
          <input id="a-source" className="input" maxLength={300} value={f.source} onChange={set('source')} />
        </Field>
        <FormError error={localError || m.error} />
      </form>
    </Modal>
  );
}

function ValidateModal({ action, onClose }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const validating = !action.validated;
  const m = useMutation({
    mutationFn: () => actionApi.validate(action.id, validating, note.trim() || null),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['actions'] }); onClose(true); },
  });
  return (
    <Modal
      open
      onClose={() => onClose(false)}
      title={validating ? t('admin.actions.validateTitle', { code: action.code }) : t('admin.actions.unvalidateTitle', { code: action.code })}
      footer={<>
        <Button variant="secondary" onClick={() => onClose(false)}>{t('actions.cancel')}</Button>
        <Button variant={validating ? 'success' : 'danger'} loading={m.isPending} onClick={() => m.mutate()}>{validating ? t('admin.actions.validate') : t('admin.actions.unvalidate')}</Button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-700">{validating ? t('admin.actions.validateText') : t('admin.actions.unvalidateText')}</p>
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-900">{action.action}</p>
          <p className="mt-1 text-slate-600">{action.actionSw}</p>
        </div>
        <Field label={t('admin.actions.note')} htmlFor="v-note">
          <textarea id="v-note" rows={3} className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </Field>
        <FormError error={m.error} />
      </div>
    </Modal>
  );
}

function ActionRow({ a, onEdit, onValidate }) {
  const { t, tx, lang } = useI18n();
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (enabled) => actionApi.update(a.id, { ...defaultedOf(a), enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['actions'] }),
  });
  return (
    <Card className={cx('p-4', !a.enabled && 'bg-slate-50 opacity-80')}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-bold text-slate-900">{a.code}</code>
            <RiskBadge level={a.minimumRiskLevel} />
            {a.maximumRiskLevel && a.maximumRiskLevel !== a.minimumRiskLevel && <><span className="text-xs text-slate-400">→</span><RiskBadge level={a.maximumRiskLevel} /></>}
            {!a.maximumRiskLevel && <span className="text-xs text-slate-500">{t('admin.actions.andAbove')}</span>}
            <Badge>{t(`urgency.${a.urgency}`)} · {a.urgencyHours}h</Badge>
            {a.cropStage !== 'ANY' && <Badge>{t(`admin.actions.stage.${a.cropStage}`)}</Badge>}
            {a.validated
              ? <Badge className="bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30"><ShieldCheck className="h-3 w-3" aria-hidden />{t('common.validated')}</Badge>
              : <Badge className="bg-amber-50 text-amber-800 ring-amber-300"><ShieldAlert className="h-3 w-3" aria-hidden />{t('admin.actions.unvalidated')}</Badge>}
            {a.escalateToExtension && <Badge className="bg-red-50 text-red-800 ring-red-300">{t('admin.actions.escalates')}</Badge>}
            {!a.enabled && <Badge className="bg-slate-200 text-slate-700 ring-slate-300">{t('admin.actions.disabled')}</Badge>}
          </div>
          <p className="mt-2 font-medium text-slate-900">{tx(a, 'action')}</p>
          <p className="mt-0.5 text-sm text-slate-600">{tx(a, 'explanation')}</p>
          {a.conditions?.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {a.conditions.map((c) => <code key={`${c.feature}${c.op}${c.value}`} className="rounded bg-ocean-50 px-1.5 py-0.5 text-xs text-ocean-800">{c.feature} {OP_SYMBOL[c.op]} {String(c.value)}</code>)}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {t('admin.actions.sourceLabel')}: {a.source} · {t('admin.actions.priority')}: {a.priority} · {t('admin.actions.used', { n: a._count?.recommendations ?? 0 })}
            {a.validated && a.validatedAt && <> · {t('admin.actions.validatedBy', { name: a.validatedBy?.fullName || '—', date: dateTime(a.validatedAt, lang) })}</>}
          </p>
          {a.validationNote && <p className="mt-1 text-xs italic text-slate-500">“{a.validationNote}”</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Toggle id={`en-${a.id}`} checked={a.enabled} onChange={(v) => toggle.mutate(v)} label={toggle.isPending ? t('actions.loading') : t('admin.actions.enabled')} />
          <Button size="sm" variant="secondary" icon={Pencil} onClick={() => onEdit(a)}>{t('actions.edit')}</Button>
          <Button size="sm" variant={a.validated ? 'ghost' : 'success'} icon={a.validated ? ShieldOff : ShieldCheck} onClick={() => onValidate(a)}>
            {a.validated ? t('admin.actions.unvalidate') : t('admin.actions.validate')}
          </Button>
        </div>
      </div>
      {toggle.error && <div className="mt-2"><FormError error={toggle.error} /></div>}
    </Card>
  );
}

export default function AdminActions() {
  const { t } = useI18n();
  const [riskType, setRiskType] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState({ open: false, action: null });
  const [validating, setValidating] = useState(null);
  const [flash, setFlash] = useState(null);
  const q = useQuery({ queryKey: ['actions', { riskType }], queryFn: () => actionApi.list({ riskType }) });

  const rows = useMemo(() => (q.data?.actions || []).filter((a) => (
    !status || (status === 'unvalidated' ? !a.validated : status === 'validated' ? a.validated : status === 'disabled' ? !a.enabled : true)
  )), [q.data, status]);
  const all = q.data?.actions || [];
  const unvalidated = all.filter((a) => !a.validated).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.actions.title')}
        subtitle={t('admin.actions.subtitle')}
        actions={<Button icon={Plus} className="whitespace-nowrap" onClick={() => setModal({ open: true, action: null })}>{t('admin.actions.new')}</Button>}
      />
      {unvalidated > 0 && (
        <Notice tone="warning" icon={ShieldAlert}>{t('admin.actions.unvalidatedNotice', { n: unvalidated, total: all.length })}</Notice>
      )}
      {flash && <Notice tone="success">{flash}</Notice>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-60">
          <label htmlFor="f-type" className="label">{t('admin.actions.riskType')}</label>
          <select id="f-type" className="input" value={riskType} onChange={(e) => setRiskType(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {RISK_TYPES.map((r) => <option key={r} value={r}>{t(`risk.type.${r}`)}</option>)}
          </select>
        </div>
        <div className="sm:w-60">
          <label htmlFor="f-status" className="label">{t('common.status')}</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            <option value="unvalidated">{t('admin.actions.unvalidated')}</option>
            <option value="validated">{t('common.validated')}</option>
            <option value="disabled">{t('admin.actions.disabled')}</option>
          </select>
        </div>
      </div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={q.refetch} /> : rows.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('admin.actions.none')} />
      ) : (
        <div className="space-y-3">
          {rows.map((a) => <ActionRow key={a.id} a={a} onEdit={(x) => setModal({ open: true, action: x })} onValidate={setValidating} />)}
        </div>
      )}
      <ActionModal
        open={modal.open}
        action={modal.action}
        onClose={(saved) => {
          if (saved) setFlash(modal.action ? t('admin.actions.updated') : t('admin.actions.created'));
          setModal({ open: false, action: null });
        }}
      />
      {validating && <ValidateModal key={validating.id} action={validating} onClose={(saved) => { if (saved) setFlash(t('admin.actions.validationSaved')); setValidating(null); }} />}
    </div>
  );
}
