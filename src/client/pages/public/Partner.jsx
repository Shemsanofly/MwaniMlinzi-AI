import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from '../../navigation.jsx';
import { AlertTriangle, BadgeCheck, BarChart3, Calendar, Copy, Handshake, Key, Lock, RefreshCw, Users } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, EmptyState, Notice } from '../../components/ui/index.jsx';
import { num, pct } from '../../utils/format.js';

const STORAGE_KEY = 'mwanimlinzi.partner.token';
// Use the same base URL as the authenticated client (VITE_API_URL in prod, dev proxy locally).
const API = process.env.NEXT_PUBLIC_API_URL || '/api';

async function callPublic(path, token) {
  const res = await fetch(`${API}${path}?token=${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok) throw Object.assign(new Error(body?.error?.message || res.statusText), { status: res.status, code: body?.error?.code });
  return body?.data;
}

function TokenGate({ onToken, initial, error }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial || '');
  return (
    <div className="mx-auto max-w-xl space-y-4 py-10">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ocean-100 text-ocean-700"><Key className="h-5 w-5" aria-hidden /></span>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('partner.gate.title')}</h1>
          <p className="text-sm text-slate-600">{t('partner.gate.subtitle')}</p>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onToken(value.trim()); }} className="space-y-3">
        <label htmlFor="partner-token" className="label">{t('partner.gate.tokenLabel')}</label>
        <input
          id="partner-token"
          type="text"
          autoFocus
          autoComplete="off"
          spellCheck="false"
          className="input font-mono text-sm"
          value={value}
          placeholder="e.g. 7Xh2…q4Tn"
          onChange={(e) => setValue(e.target.value)}
        />
        {error && (
          <Notice tone="warning">
            <p className="text-sm">{error.code === 'INVALID_TOKEN' ? t('partner.gate.invalidToken') : (error.message || t('partner.gate.unknown'))}</p>
          </Notice>
        )}
        <Button type="submit" disabled={!value.trim()} icon={Lock}>{t('partner.gate.open')}</Button>
      </form>
      <Notice tone="info">
        <p className="text-sm">{t('partner.gate.help')}</p>
      </Notice>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700 ring-1 ring-ocean-200">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

function HorizonCard({ title, h }) {
  const { t } = useI18n();
  if (!h) return null;
  return (
    <Card>
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{num(h.riskAdjustedKg, 0)} <span className="text-base font-medium text-slate-500">kg</span></p>
        <p className="mt-1 text-xs text-slate-600">
          {t('partner.forecasts.range', { low: num(h.lowKg, 0), high: num(h.highKg, 0) })}
        </p>
        {h.avgConfidence != null && (
          <p className="mt-2 text-xs text-slate-500">{t('partner.forecasts.confidence', { v: Math.round(h.avgConfidence * 100) })}</p>
        )}
      </div>
    </Card>
  );
}

function ForecastView({ data, onLogout }) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <HeaderBar
        title={t('partner.forecasts.title')}
        subtitle={data.cooperative ? `${data.cooperative.name} (${data.cooperative.code})` : t('partner.allCoops')}
        onLogout={onLogout}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <HorizonCard title={t('partner.forecasts.next7')} h={data.horizons?.next7Days} />
        <HorizonCard title={t('partner.forecasts.next14')} h={data.horizons?.next14Days} />
        <HorizonCard title={t('partner.forecasts.next30')} h={data.horizons?.next30Days} />
      </div>
      {data.weekly?.length > 0 ? (
        <Card>
          <CardHeader icon={BarChart3} title={t('partner.forecasts.weekly')} subtitle={t('partner.forecasts.weeklySub')} />
          <div className="overflow-x-auto p-2">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {[t('partner.forecasts.week'), t('partner.forecasts.farms'), t('partner.forecasts.expected'), t('partner.forecasts.low'), t('partner.forecasts.high')].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.weekly.map((w) => (
                  <tr key={w.key} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{w.key}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-700">{w.farms}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-900">{num(w.riskAdjustedKg, 0)} kg</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{num(w.lowKg, 0)} kg</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{num(w.highKg, 0)} kg</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="p-6"><EmptyState icon={Calendar} title={t('partner.forecasts.empty')} message={t('partner.forecasts.emptyText')} /></Card>
      )}
      <Footprint note={data.note} />
    </div>
  );
}

function AdoptionView({ data, onLogout }) {
  const { t } = useI18n();
  const a = data.adoption || {};
  const al = data.alerts || {};
  return (
    <div className="space-y-6">
      <HeaderBar
        title={t('partner.adoption.title')}
        subtitle={data.cooperative ? `${data.cooperative.name} (${data.cooperative.code})` : t('partner.allCoops')}
        onLogout={onLogout}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label={t('partner.adoption.farmers')} value={num(a.farmersRegistered, 0)} />
        <Stat icon={BadgeCheck} label={t('partner.adoption.activeFarms')} value={num(a.activeFarms, 0)} />
        <Stat icon={BarChart3} label={t('partner.adoption.observations')} value={num(a.observationsRecorded, 0)} />
        <Stat icon={Handshake} label={t('partner.adoption.outcomes')} value={num(a.outcomesRecorded, 0)} />
      </div>
      <Card>
        <CardHeader icon={AlertTriangle} title={t('partner.adoption.alertsTitle')} subtitle={t('partner.adoption.alertsSub')} />
        <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-3">
          <Stat icon={AlertTriangle} label={t('partner.adoption.highIssued')} value={num(al.highOrCriticalIssued, 0)} />
          <Stat icon={BadgeCheck} label={t('partner.adoption.acknowledged')} value={pct(al.acknowledgementRate, 0)} hint={al.acknowledged != null ? t('partner.adoption.of', { n: al.acknowledged, total: al.highOrCriticalIssued }) : null} />
          <Stat icon={BadgeCheck} label={t('partner.adoption.actionWithin48h')} value={pct(al.actionWithin48hRate, 0)} hint={al.acknowledgedWithin48h != null ? t('partner.adoption.of', { n: al.acknowledgedWithin48h, total: al.highOrCriticalIssued }) : null} />
        </div>
      </Card>
      <Footprint note={data.note} />
    </div>
  );
}

function HeaderBar({ title, subtitle, onLogout }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean-700">MwaniMlinzi · {t('partner.partnerView')}</p>
        <h1 className="mt-0.5 text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" icon={Copy} onClick={copyLink}>{copied ? t('partner.copied') : t('partner.copyLink')}</Button>
        <Button size="sm" variant="ghost" icon={Lock} onClick={onLogout}>{t('partner.forget')}</Button>
      </div>
    </div>
  );
}

function Footprint({ note }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
      <p>{note || t('partner.defaultNote')}</p>
    </div>
  );
}

/** Try FORECASTS first (most tokens will be forecast tokens); on 401-with-wrong-scope, fall back to ADOPTION. */
async function fetchForToken(token) {
  try {
    const data = await callPublic('/public/forecasts', token);
    return { kind: 'FORECASTS', data };
  } catch (err) {
    if (err.status !== 401 && err.status !== 403) throw err;
  }
  const data = await callPublic('/public/adoption', token);
  return { kind: 'ADOPTION', data };
}

export default function Partner() {
  const [params, setParams] = useSearchParams();
  const [token, setToken] = useState(() => params.get('token') || localStorage.getItem(STORAGE_KEY) || '');
  const [state, setState] = useState({ loading: !!token, data: null, kind: null, error: null });

  const load = useMemo(() => async (tok) => {
    setState({ loading: true, data: null, kind: null, error: null });
    try {
      const { kind, data } = await fetchForToken(tok);
      localStorage.setItem(STORAGE_KEY, tok);
      setState({ loading: false, data, kind, error: null });
    } catch (err) {
      setState({ loading: false, data: null, kind: null, error: err });
    }
  }, []);

  useEffect(() => {
    if (token) load(token);
    // keep the token out of the URL once we've got it, so refreshes still work via localStorage
    if (params.get('token')) {
      const p = new URLSearchParams(params);
      p.delete('token');
      setParams(p, { replace: true });
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const forget = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken('');
    setState({ loading: false, data: null, kind: null, error: null });
  };

  if (!token || state.error?.code === 'INVALID_TOKEN') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <TokenGate initial={token} error={state.error} onToken={setToken} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {state.loading && (
        <div className="flex items-center gap-3 py-16 text-slate-500">
          <RefreshCw className="h-5 w-5 animate-spin" aria-hidden />
          <span>Loading…</span>
        </div>
      )}
      {!state.loading && state.data && state.kind === 'FORECASTS' && <ForecastView data={state.data} onLogout={forget} />}
      {!state.loading && state.data && state.kind === 'ADOPTION' && <AdoptionView data={state.data} onLogout={forget} />}
      {!state.loading && state.error && state.error.code !== 'INVALID_TOKEN' && (
        <Notice tone="warning">
          <p className="text-sm">{state.error.message || 'Something went wrong.'}</p>
          <Button size="sm" variant="ghost" onClick={() => load(token)} className="mt-2">Try again</Button>
        </Notice>
      )}
    </div>
  );
}
