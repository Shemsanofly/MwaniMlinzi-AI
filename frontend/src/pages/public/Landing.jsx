import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, ArrowUpRight, BookCheck, Clock, Database, Eye, Languages, LineChart, MessageSquare, ScanSearch, ShieldCheck, Smartphone, Sprout, Users,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { useAuth } from '../../stores/AuthContext.jsx';
import { Reveal } from '../../components/ui/index.jsx';
import FarmerPreview from './components/FarmerPreview.jsx';
import { LoopDiagram, PipelineFlow } from './components/LoopDiagram.jsx';
import Waves from './components/Waves.jsx';

const AUDIENCES = [
  { key: 'farmers', icon: Sprout, tone: 'from-seaweed-50 to-white text-seaweed-700 ring-seaweed-100' },
  { key: 'admins', icon: Users, tone: 'from-ocean-50 to-white text-ocean-700 ring-ocean-100' },
];

const LOOP = [
  { key: 'monitor', icon: Eye },
  { key: 'predict', icon: LineChart },
  { key: 'act', icon: BookCheck },
  { key: 'learn', icon: Database },
];

const TRUST = [
  { key: 'sources', icon: Database },
  { key: 'model', icon: ScanSearch },
  { key: 'library', icon: BookCheck },
  { key: 'claims', icon: ShieldCheck },
];

const FACTS = [
  { key: 'risks', icon: Activity },
  { key: 'horizon', icon: Clock },
  { key: 'lang', icon: Languages },
  { key: 'channels', icon: MessageSquare },
];

function Eyebrow({ children, light = false }) {
  return (
    <p className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] ${light ? 'text-lagoon-300' : 'text-ocean-600'}`}>
      <span className={`h-px w-6 ${light ? 'bg-lagoon-300/70' : 'bg-ocean-400'}`} aria-hidden />{children}
    </p>
  );
}

export default function Landing() {
  const { t } = useI18n();
  const { isAuthenticated, homePath } = useAuth();
  const primary = isAuthenticated ? { to: homePath, label: t('nav.dashboard') } : { to: '/register', label: t('public.hero.getStarted') };
  return (
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="ocean-band relative overflow-hidden text-white">
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-32 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.2fr_1fr] lg:pb-36">
          <div>
            <div className="animate-rise"><Eyebrow light>{t('public.hero.eyebrow')}</Eyebrow></div>
            <h1 className="display mt-6 text-[2.75rem] font-medium leading-[1.02] sm:text-6xl lg:text-7xl">
              <span className="block animate-rise [animation-delay:80ms]">{t('public.hero.headline1')}</span>
              <span className="block animate-rise italic text-lagoon-300 [animation-delay:180ms]">{t('public.hero.headline2')}</span>
            </h1>
            <p className="mt-6 max-w-xl animate-rise text-base leading-relaxed text-ocean-100/90 [animation-delay:280ms] sm:text-lg">{t('public.hero.description')}</p>
            <div className="mt-9 flex animate-rise flex-wrap gap-3 [animation-delay:380ms]">
              <Link to={primary.to} className="group inline-flex items-center gap-2 rounded-xl bg-lagoon-400 px-6 py-3.5 text-base font-bold text-ocean-950 shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_12px_30px_-10px_rgb(69_207_182/0.6)] transition hover:bg-lagoon-300 active:scale-[0.97]">
                {primary.label} <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </Link>
              {!isAuthenticated && (
                <Link to="/login" className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-base font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/10 active:scale-[0.97]">
                  {t('actions.login')}
                </Link>
              )}
            </div>
            <ul className="mt-10 grid max-w-xl animate-rise grid-cols-2 gap-x-6 gap-y-3 text-sm text-ocean-100 [animation-delay:480ms] sm:grid-cols-4 sm:gap-x-4">
              {FACTS.map(({ key, icon: Icon }) => (
                <li key={key} className="flex items-center gap-2"><Icon className="h-4 w-4 shrink-0 text-lagoon-300" aria-hidden /><span className="leading-tight">{t(`public.hero.facts.${key}`)}</span></li>
              ))}
            </ul>
          </div>
          <FarmerPreview />
        </div>
        <Waves />
      </section>

      {/* Loop */}
      <section className="bg-sand-50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
          <Reveal className="max-w-2xl">
            <Eyebrow>{t('public.loop.eyebrow')}</Eyebrow>
            <h2 className="display mt-4 text-4xl font-medium leading-tight text-ocean-950 sm:text-5xl">{t('public.loop.title')}</h2>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">{t('public.loop.subtitle')}</p>
          </Reveal>
          <div className="mt-14 grid items-center gap-12 lg:grid-cols-[340px_1fr]">
            <Reveal className="flex justify-center"><LoopDiagram /></Reveal>
            <ol className="grid gap-4 sm:grid-cols-2">
              {LOOP.map(({ key, icon: Icon }, i) => (
                <Reveal as="li" key={key} delay={i * 90} className="surface lift group p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-900 text-lagoon-300 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105"><Icon className="h-5 w-5" aria-hidden /></span>
                    <span className="font-display text-sm italic text-slate-400">0{i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold tracking-tight text-slate-900">{t(`public.loop.${key}`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(`public.loop.${key}Text`)}</p>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal className="mt-16 rounded-3xl border border-ocean-100 bg-gradient-to-br from-ocean-50/80 via-white to-sand-100/60 p-6 sm:p-10">
            <h3 className="mb-6 text-center text-xs font-bold uppercase tracking-[0.18em] text-ocean-700">{t('public.flow.title')}</h3>
            <PipelineFlow />
          </Reveal>
        </div>
      </section>

      {/* Audiences */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
          <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="display text-4xl font-medium leading-tight text-ocean-950 sm:text-5xl">{t('public.audiences.title')}</h2>
              <p className="mt-4 text-lg text-slate-600">{t('public.audiences.subtitle')}</p>
            </div>
            <Link to="/how-it-works" className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-ocean-700 hover:text-ocean-900">
              {t('nav.howItWorks')} <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {AUDIENCES.map(({ key, icon: Icon, tone }, i) => (
              <Reveal as="article" key={key} delay={i * 90} className={`lift group flex flex-col rounded-3xl bg-gradient-to-b p-6 ring-1 ring-inset ${tone}`}>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[var(--shadow-soft)] transition-transform duration-500 ease-[var(--ease-spring)] group-hover:scale-110"><Icon className="h-6 w-6" aria-hidden /></span>
                <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900">{t(`public.audiences.${key}.title`)}</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className="flex gap-2.5"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden />{t(`public.audiences.${key}.b${n}`)}</li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="bg-sand-50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
            <Reveal className="lg:sticky lg:top-28 lg:self-start">
              <Eyebrow>{t('public.honesty.eyebrow')}</Eyebrow>
              <h2 className="display mt-4 text-4xl font-medium leading-tight text-ocean-950 sm:text-5xl">{t('public.honesty.title')}</h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">{t('public.honesty.subtitle')}</p>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2">
              {TRUST.map(({ key, icon: Icon }, i) => (
                <Reveal key={key} delay={i * 90} className="surface lift p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700 ring-1 ring-inset ring-ocean-100"><Icon className="h-5 w-5" aria-hidden /></span>
                  <h3 className="mt-4 font-bold tracking-tight text-slate-900">{t(`public.honesty.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(`public.honesty.${key}.text`)}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-sand-50 px-4 pb-20 sm:px-6">
        <Reveal className="ocean-band relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-14 text-white sm:px-12">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/10" aria-hidden />
          <div className="absolute -right-4 -top-4 h-40 w-40 rounded-full border border-white/10" aria-hidden />
          <div className="relative flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="display text-3xl font-medium leading-tight sm:text-4xl">{t('public.cta.title')}</h2>
              <p className="mt-3 text-ocean-100/90">{t('public.cta.text')}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to={primary.to} className="group inline-flex items-center gap-2 rounded-xl bg-lagoon-400 px-6 py-3.5 font-bold text-ocean-950 transition hover:bg-lagoon-300 active:scale-[0.97]">
                {primary.label} <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </Link>
              {!isAuthenticated && <Link to="/login" className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/10"><Smartphone className="h-4 w-4" aria-hidden />{t('actions.login')}</Link>}
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
