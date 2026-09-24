import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, BrainCircuit, CheckCircle2, CloudSun, KeyRound, RotateCcw, Save, Server } from 'lucide-react';
import { adminApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, ErrorState, FormError, Notice, PageHeader, PageLoader, Toggle, cx } from '../../components/ui/index.jsx';
import { RISK_STYLE } from '../../utils/risk.js';
import { dateTime } from '../../utils/format.js';
import { ProviderList, YesNo } from './components/shared.jsx';
import { thresholdError } from './components/thresholds.js';
import AfricasTalkingCard from './components/AfricasTalkingCard.jsx';

const SPEC = {
  'risk.thresholds': { type: 'thresholds' },
  'ai.mode': { type: 'enum', options: ['RULE_ONLY', 'HYBRID'] },
  'ai.mlBlendWeight': { type: 'float', min: 0, max: 1, step: 0.05 },
  'ai.minTrainingRecords': { type: 'int', min: 50, max: 1000000 },
  'actions.requireValidated': { type: 'bool' },
  'alerts.missingReportDays': { type: 'int', min: 1, max: 90 },
  'alerts.dedupHours': { type: 'int', min: 1, max: 168 },
  'environment.maxCacheAgeHours': { type: 'int', min: 1, max: 720 },
  'environment.preferLive': { type: 'bool' },
  'notifications.smsEnabled': { type: 'bool' },
};
const GROUPS = [
  { id: 'risk', icon: BrainCircuit, keys: ['risk.thresholds', 'ai.mode', 'ai.mlBlendWeight', 'ai.minTrainingRecords'] },
  { id: 'actions', icon: BellRing, keys: ['actions.requireValidated', 'alerts.missingReportDays', 'alerts.dedupHours'] },
  { id: 'environment', icon: CloudSun, keys: ['environment.maxCacheAgeHours', 'environment.preferLive', 'notifications.smsEnabled'] },
];

const canon = (v) => (v && typeof v === 'object' ? JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]])) : JSON.stringify(v));
const sameValue = (a, b) => canon(a) === canon(b);
const fmt = (v) => (typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(' · ') : String(v));

const num = (x) => (String(x).trim() === '' ? Number.NaN : Number(x));
/** Editors keep raw strings for numeric inputs (so "0." can be typed); convert on validate/save. */
function toDraft(key, v) {
  const tpe = SPEC[key].type;
  if (tpe === 'thresholds') return Object.fromEntries(['MEDIUM', 'HIGH', 'CRITICAL'].map((l) => [l, String(v?.[l] ?? '')]));
  if (tpe === 'int' || tpe === 'float') return String(v ?? '');
  return v;
}
function toValue(key, d) {
  const tpe = SPEC[key].type;
  if (tpe === 'thresholds') return Object.fromEntries(['MEDIUM', 'HIGH', 'CRITICAL'].map((l) => [l, num(d[l])]));
  if (tpe === 'int' || tpe === 'float') return num(d);
  return d;
}

/** Client-side check for one setting; returns an i18n key or null. */
function validate(key, v) {
  const s = SPEC[key];
  if (s.type === 'thresholds') return thresholdError(v);
  if (s.type === 'int') return Number.isInteger(v) && v >= s.min && v <= s.max ? null : 'admin.settings.intRange';
  if (s.type === 'float') return typeof v === 'number' && !Number.isNaN(v) && v >= s.min && v <= s.max ? null : 'admin.settings.floatRange';
  return null;
}

function ThresholdPreview({ v }) {
  const { t } = useI18n();
  const ok = !thresholdError(v);
  const bands = ok ? [
    { level: 'LOW', from: 0, to: v.MEDIUM },
    { level: 'MEDIUM', from: v.MEDIUM, to: v.HIGH },
    { level: 'HIGH', from: v.HIGH, to: v.CRITICAL },
    { level: 'CRITICAL', from: v.CRITICAL, to: 1 },
  ] : [];
  return (
    <div className="mt-3" aria-label={t('admin.settings.previewAria')}>
      <div className="flex h-7 w-full overflow-hidden rounded-lg bg-slate-100">
        {bands.map((b) => (
          <div key={b.level} className={cx('flex items-center justify-center text-[11px] font-bold text-white', RISK_STYLE[b.level].bar)} style={{ width: `${(b.to - b.from) * 100}%` }} title={`${t(`risk.level.${b.level}`)}: ${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%`}>
            {(b.to - b.from) > 0.08 && t(`risk.level.${b.level}`)}
          </div>
        ))}
        {!ok && <div className="flex w-full items-center justify-center text-xs text-slate-500">{t('admin.settings.previewInvalid')}</div>}
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-slate-500"><span>0%</span><span>50%</span><span>100%</span></div>
    </div>
  );
}

function Editor({ k, value, onChange }) {
  const { t } = useI18n();
  const s = SPEC[k];
  const id = `set-${k.replace('.', '-')}`;
  if (s.type === 'thresholds') {
    return (
      <div>
        <div className="grid grid-cols-3 gap-2">
          {['MEDIUM', 'HIGH', 'CRITICAL'].map((lvl) => (
            <div key={lvl}>
              <label htmlFor={`${id}-${lvl}`} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <span className={cx('h-2.5 w-2.5 rounded-full', RISK_STYLE[lvl].bar)} aria-hidden />{t(`risk.level.${lvl}`)} ≥
              </label>
              <input
                id={`${id}-${lvl}`}
                type="number"
                min={0.01}
                max={0.99}
                step={0.01}
                className="input tabular-nums"
                value={value[lvl]}
                onChange={(e) => onChange({ ...value, [lvl]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <ThresholdPreview v={toValue(k, value)} />
      </div>
    );
  }
  if (s.type === 'enum') {
    return (
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={k}>
        {s.options.map((o) => (
          <label key={o} className={cx('flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm', value === o ? 'border-ocean-500 bg-ocean-50' : 'border-slate-200')}>
            <input type="radio" name={id} value={o} checked={value === o} onChange={() => onChange(o)} className="mt-0.5 accent-ocean-700" />
            <span><span className="block font-mono font-semibold">{o}</span><span className="block text-xs text-slate-500">{t(`admin.settings.mode.${o}`)}</span></span>
          </label>
        ))}
      </div>
    );
  }
  if (s.type === 'bool') return <Toggle id={id} checked={value} onChange={onChange} label={value ? t('admin.settings.on') : t('admin.settings.off')} />;
  return (
    <div className="flex items-center gap-3">
      {s.type === 'float' && (
        <input type="range" aria-label={k} min={s.min} max={s.max} step={s.step} value={Number.isNaN(num(value)) ? 0 : num(value)} onChange={(e) => onChange(e.target.value)} className="w-full max-w-xs accent-ocean-700" />
      )}
      <input
        id={id}
        aria-label={k}
        type="number"
        min={s.min}
        max={s.max}
        step={s.step || 1}
        className="input w-32 tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-xs text-slate-500">{s.min}–{s.max}</span>
    </div>
  );
}

function SettingRow({ setting }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(() => toDraft(setting.key, setting.value));
  const [saved, setSaved] = useState(false);
  const m = useMutation({
    mutationFn: (value) => adminApi.updateSetting(setting.key, value),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      if (setting.key.startsWith('ai.')) qc.invalidateQueries({ queryKey: ['admin', 'models'] });
    },
  });
  const parsed = toValue(setting.key, draft);
  const errKey = validate(setting.key, parsed);
  const dirty = !sameValue(parsed, setting.value);
  const change = (v) => { setDraft(v); setSaved(false); m.reset(); };
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{t(`admin.settings.keys.${setting.key}`)}</p>
          <p className="font-mono text-xs text-slate-500">{setting.key}</p>
        </div>
        <p className="text-xs text-slate-500">{setting.updatedAt ? t('admin.settings.updated', { time: dateTime(setting.updatedAt, lang) }) : null}</p>
      </div>
      <p className="mt-1 text-sm text-slate-600">{setting.description}</p>
      <div className="mt-3"><Editor k={setting.key} value={draft} onChange={change} /></div>
      {errKey && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{t(errKey)}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={Save} disabled={!dirty || !!errKey} loading={m.isPending} onClick={() => m.mutate(parsed)}>{t('actions.save')}</Button>
        {dirty && <Button size="sm" variant="ghost" onClick={() => change(toDraft(setting.key, setting.value))}>{t('actions.cancel')}</Button>}
        {!sameValue(parsed, setting.default) && (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => change(toDraft(setting.key, setting.default))}>{t('admin.settings.useDefault')}</Button>
        )}
        <span className="text-xs text-slate-500">{t('admin.settings.default')}: <span className="font-mono">{fmt(setting.default)}</span></span>
        {saved && !dirty && <span className="flex items-center gap-1 text-xs font-semibold text-seaweed-700"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{t('admin.settings.savedMsg')}</span>}
      </div>
      {m.error && <div className="mt-2"><FormError error={m.error} /></div>}
    </div>
  );
}

export default function AdminSettings() {
  const { t } = useI18n();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'settings'], queryFn: adminApi.settings });
  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const byKey = Object.fromEntries(data.settings.map((s) => [s.key, s]));
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const sys = data.system || {};

  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.settings.title')} subtitle={t('admin.settings.subtitle')} />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {GROUPS.map((g) => (
            <Card key={g.id}>
              <CardHeader icon={g.icon} title={t(`admin.settings.groups.${g.id}`)} />
              <div className="divide-y divide-slate-100 p-4 sm:p-5">
                {g.keys.filter((k) => byKey[k]).map((k) => (
                  <SettingRow key={k} setting={byKey[k]} />
                ))}
              </div>
            </Card>
          ))}
          {data.settings.some((s) => !known.has(s.key)) && (
            <Notice tone="info">{t('admin.settings.unknownKeys', { keys: data.settings.filter((s) => !known.has(s.key)).map((s) => s.key).join(', ') })}</Notice>
          )}
        </div>
        <div className="space-y-6">
        <Card className="h-fit">
          <CardHeader icon={Server} title={t('admin.system.title')} subtitle={t('admin.system.readOnly')} />
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between text-sm"><span className="text-slate-600">{t('admin.system.demoMode')}</span>{sys.demoMode ? <Badge className="bg-violet-50 text-violet-800 ring-violet-300">DEMO_MODE=true</Badge> : <YesNo value={false} />}</div>
            <div className="flex items-center justify-between text-sm"><span className="text-slate-600">{t('admin.system.jobsEnabled')}</span><YesNo value={sys.jobsEnabled} /></div>
            <div className="border-t border-slate-100 pt-2"><ProviderList providers={sys.providers} /></div>
            <Notice tone="info" icon={KeyRound}>{t('admin.system.envNote')}</Notice>
          </div>
        </Card>
        <AfricasTalkingCard />
        </div>
      </div>
    </div>
  );
}
