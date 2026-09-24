import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, CircleDot, FlaskConical, KeyRound, Server, Terminal } from 'lucide-react';
import { metaApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Badge, Button, Card, CardHeader, ErrorState, Spinner } from '../../components/ui/index.jsx';
import { RISK_STYLE } from '../../utils/risk.js';
import PublicHero from './components/PublicHero.jsx';

const DEMO_ACCOUNTS = [
  { role: 'FARMER', email: 'farmer@demo.mwanimlinzi.local' },
  { role: 'COOPERATIVE_ADMIN', email: 'cooperative@demo.mwanimlinzi.local' },
  { role: 'EXTENSION_OFFICER', email: 'extension@demo.mwanimlinzi.local' },
  { role: 'BUYER', email: 'buyer@demo.mwanimlinzi.local' },
  { role: 'ADMIN', email: 'admin@demo.mwanimlinzi.local' },
];

const SCENARIOS = [
  { code: 'FARM001', key: 'heat', level: 'HIGH' },
  { code: 'FARM002', key: 'harvest', level: 'LOW' },
  { code: 'FARM003', key: 'storm', level: 'HIGH' },
  { code: 'FARM004', key: 'growth', level: 'HIGH' },
  { code: 'FARM005', key: 'normal', level: 'LOW' },
];

/** Walk-through steps; `to` is an in-app route that requires login. */
const STEPS = [
  { key: 'loginFarmer' },
  { key: 'viewRisk', to: '/farmer/risk' },
  { key: 'observation', to: '/farmer/observations' },
  { key: 'recalc' },
  { key: 'recordAction', to: '/farmer/dashboard' },
  { key: 'harvest', to: '/farmer/harvest' },
  { key: 'coop', to: '/cooperative/dashboard' },
  { key: 'extension', to: '/extension/reviews' },
  { key: 'buyer', to: '/buyer/forecast' },
  { key: 'simulation', to: '/demo/simulation' },
  { key: 'atChannels' },
];

function ProviderRow({ label, value, live }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-slate-900">
        <CircleDot className={`h-3.5 w-3.5 ${live ? 'text-seaweed-600' : 'text-violet-600'}`} aria-hidden />{value}
      </span>
    </div>
  );
}

const isConfigured = (v) => !!v && v !== 'NOT_CONFIGURED';

function HealthCard() {
  const { t } = useI18n();
  const channelLabel = (v) => (isConfigured(v) ? v : t('public.demo.notConfigured'));
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['health'], queryFn: metaApi.health, retry: false });
  return (
    <Card>
      <CardHeader icon={Server} title={t('public.demo.healthTitle')} subtitle={t('public.demo.healthSubtitle')} />
      <div className="p-4 sm:p-5">
        {isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {error && <ErrorState error={error} onRetry={refetch} compact />}
        {data && (
          <div className="divide-y divide-slate-100">
            <div className="flex flex-wrap items-center gap-2 pb-3">
              <Badge className={data.status === 'ok' ? 'bg-seaweed-50 text-seaweed-700 ring-seaweed-500/30' : 'bg-red-50 text-red-800 ring-red-300'}>
                {t('public.demo.status')}: {data.status}
              </Badge>
              <Badge className="bg-slate-50 text-slate-700 ring-slate-200">{t('public.demo.database')}: {data.database}</Badge>
              {data.demoMode && <Badge className="bg-violet-50 text-violet-800 ring-violet-300"><FlaskConical className="h-3 w-3" aria-hidden />{t('public.demo.demoModeOn')}</Badge>}
            </div>
            <div className="pt-2">
              <ProviderRow label={t('public.demo.weather')} value={data.providers?.weather?.live || data.providers?.weather?.demo || '—'} live={!!data.providers?.weather?.live} />
              <ProviderRow label={t('public.demo.ocean')} value={data.providers?.ocean?.live || data.providers?.ocean?.demo || '—'} live={!!data.providers?.ocean?.live} />
              <ProviderRow label={t('public.demo.llm')} value={data.providers?.llm || '—'} live={data.providers?.llm && data.providers.llm !== 'template'} />
              <ProviderRow label="SMS" value={channelLabel(data.providers?.sms)} live={isConfigured(data.providers?.sms)} />
              <ProviderRow label="USSD" value={channelLabel(data.providers?.ussd)} live={isConfigured(data.providers?.ussd)} />
            </div>
            <p className="pt-3 text-xs text-slate-500">{t('public.demo.providerLegend')}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DemoHome() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const chooseAccount = (email) => navigate(`/login?email=${encodeURIComponent(email)}`, { state: { identifier: email } });

  return (
    <div>
      <PublicHero wide eyebrow={t('nav.demo')} title={t('public.demo.title')} subtitle={t('public.demo.subtitle')} />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <Card>
            <CardHeader icon={KeyRound} title={t('public.demo.accountsTitle')} subtitle={t('public.demo.accountsSubtitle')} />
            <ul className="divide-y divide-slate-100">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{t(`roles.${a.role}`)}</p>
                    <p className="break-all font-mono text-sm text-slate-600">{a.email}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => chooseAccount(a.email)} aria-label={`${t('public.demo.useAccount')}: ${a.email}`}>
                    {t('public.demo.useAccount')}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 sm:px-5">
              <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <p>
                {t('public.demo.passwordPrefix')} <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-slate-200">npm run seed</code>{' '}
                ({t('public.demo.passwordSee')} <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs ring-1 ring-slate-200">backend/DEMO_CREDENTIALS.local.txt</code>)
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader icon={CheckCircle2} title={t('public.demo.walkTitle')} subtitle={t('public.demo.walkSubtitle')} />
            <ol className="divide-y divide-slate-100">
              {STEPS.map((s, i) => (
                <li key={s.key} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ocean-100 text-xs font-bold text-ocean-800">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{t(`public.demo.steps.${s.key}.title`)}</p>
                    <p className="text-sm text-slate-600">{t(`public.demo.steps.${s.key}.text`)}</p>
                  </div>
                  {s.to && (
                    <Link to={s.to} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-ocean-700 hover:text-ocean-900">
                      {t('public.demo.open')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ol>
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">{t('public.demo.loginRequired')}</p>
          </Card>
        </div>

        <div className="space-y-8">
          <HealthCard />
          <Card>
            <CardHeader icon={FlaskConical} title={t('public.demo.scenariosTitle')} subtitle={t('public.demo.scenariosSubtitle')} />
            <ul className="divide-y divide-slate-100">
              {SCENARIOS.map((s) => (
                <li key={s.code} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${RISK_STYLE[s.level].bar}`} aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-slate-900"><span className="font-mono">{s.code}</span> · {t(`public.demo.scenarios.${s.key}.title`)}</p>
                    <p className="text-sm text-slate-600">{t(`public.demo.scenarios.${s.key}.text`)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">{t('public.demo.scenarioNote')}</p>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Link to="/demo/simulation" className="rounded-lg bg-ocean-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ocean-800">{t('nav.simulation')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
