import { Link } from 'react-router-dom';
import {
  BookCheck, BrainCircuit, CheckCircle2, CloudSun, Database, Globe, Languages, MessageSquare, RefreshCcw, Smartphone, Sprout, Target,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import PublicHero from './components/PublicHero.jsx';

const STEPS = [
  { key: 'environment', icon: CloudSun },
  { key: 'risk', icon: BrainCircuit },
  { key: 'action', icon: BookCheck },
  { key: 'approved', icon: CheckCircle2 },
  { key: 'llm', icon: Languages, optional: true },
  { key: 'farmer', icon: Sprout },
  { key: 'outcome', icon: Target },
  { key: 'learning', icon: RefreshCcw },
];
const CHANNELS = [
  { key: 'web', icon: Globe },
  { key: 'sms', icon: MessageSquare },
  { key: 'ussd', icon: Smartphone },
];
const ROLES = ['FARMER', 'ADMIN'];

export default function HowItWorks() {
  const { t } = useI18n();
  return (
    <div>
      <PublicHero eyebrow={t('nav.howItWorks')} title={t('public.how.title')} subtitle={t('public.how.subtitle')} />
      <div className="mx-auto max-w-5xl space-y-20 px-4 py-16 sm:px-6">
        <section>
          <h2 className="display text-3xl font-medium text-ocean-950 sm:text-4xl">{t('public.how.pipelineTitle')}</h2>
          <ol className="relative mt-8 space-y-4 border-l-2 border-dashed border-ocean-200 pl-6">
            {STEPS.map(({ key, icon: Icon, optional }, i) => (
              <li key={key} className="relative">
                <span className={`absolute -left-[39px] flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${optional ? 'bg-slate-400' : 'bg-ocean-900 ring-4 ring-sand-50'}`}>{i + 1}</span>
                <div className={`lift rounded-2xl border bg-white p-5 shadow-[var(--shadow-soft)] ${optional ? 'border-dashed border-slate-300' : 'border-slate-200/80'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-5 w-5 text-ocean-600" aria-hidden />
                    <h3 className="font-semibold text-slate-900">{t(`public.how.steps.${key}.title`)}</h3>
                    {optional && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{t('public.how.optional')}</span>}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(`public.how.steps.${key}.text`)}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{t('public.how.guardrail')}</p>
          </div>
        </section>

        <section>
          <h2 className="display text-3xl font-medium text-ocean-950 sm:text-4xl">{t('public.how.channelsTitle')}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {CHANNELS.map(({ key, icon: Icon }) => (
              <div key={key} className="surface lift p-6">
                <Icon className="h-6 w-6 text-ocean-600" aria-hidden />
                <h3 className="mt-3 font-semibold text-slate-900">{t(`public.how.channels.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-slate-600">{t(`public.how.channels.${key}.text`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="display text-3xl font-medium text-ocean-950 sm:text-4xl">{t('public.how.rolesTitle')}</h2>
          <div className="surface mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t('public.how.role')}</th>
                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t('public.how.canDo')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ROLES.map((r) => (
                  <tr key={r}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">{t(`roles.${r}`)}</td>
                    <td className="px-4 py-3 text-slate-600">{t(`public.how.roles.${r}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link to="/register" className="rounded-xl bg-ocean-900 px-5 py-3 font-semibold text-white transition hover:bg-ocean-800 active:scale-[0.97]">{t('actions.register')}</Link>
          <Link to="/about" className="rounded-xl bg-white px-5 py-3 font-semibold text-ocean-800 ring-1 ring-inset ring-slate-300/80 transition hover:bg-ocean-50 active:scale-[0.97]">{t('nav.about')}</Link>
        </div>
      </div>
    </div>
  );
}
