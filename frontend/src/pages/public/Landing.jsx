import { Link } from 'react-router-dom';
import {
  ArrowRight, BookCheck, Building2, Database, Eye, FlaskConical, LineChart, MessageSquare, ScanSearch, ShieldCheck, Smartphone, Sprout, Truck, Users,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import FarmerPreview from './components/FarmerPreview.jsx';
import { LoopDiagram, PipelineFlow } from './components/LoopDiagram.jsx';

const AUDIENCES = [
  { key: 'farmers', icon: Sprout, tone: 'bg-seaweed-50 text-seaweed-700' },
  { key: 'cooperatives', icon: Building2, tone: 'bg-ocean-50 text-ocean-700' },
  { key: 'extension', icon: Users, tone: 'bg-amber-50 text-amber-700' },
  { key: 'buyers', icon: Truck, tone: 'bg-slate-100 text-slate-700' },
];

const LOOP = [
  { key: 'monitor', icon: Eye },
  { key: 'predict', icon: LineChart },
  { key: 'act', icon: BookCheck },
  { key: 'learn', icon: Database },
];

const HONESTY = [
  { key: 'demo', icon: FlaskConical },
  { key: 'model', icon: ScanSearch },
  { key: 'library', icon: BookCheck },
  { key: 'claims', icon: ShieldCheck },
];

export default function Landing() {
  const { t } = useI18n();
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ocean-900 text-white">
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full text-ocean-800" viewBox="0 0 1440 96" preserveAspectRatio="none" aria-hidden>
          <path fill="currentColor" d="M0 64 C 240 16 480 16 720 56 S 1200 96 1440 48 V96 H0 Z" />
        </svg>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-12 sm:px-6 md:pt-16 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-ocean-600 bg-ocean-800/60 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ocean-200">
              {t('public.hero.eyebrow')}
            </p>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">MWANIMLINZI AI</h1>
            <p className="mt-4 text-2xl font-semibold text-teal-300 sm:text-3xl">{t('public.hero.tagline')}</p>
            <p className="mt-1 text-lg text-ocean-200">{t('public.hero.taglineAlt')}</p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ocean-100 sm:text-lg">{t('public.hero.description')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/demo" className="inline-flex items-center gap-2 rounded-lg bg-teal-400 px-5 py-3 text-base font-bold text-ocean-900 hover:bg-teal-300">
                {t('public.hero.tryDemo')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link to="/login" className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-base font-semibold text-white ring-1 ring-inset ring-ocean-400 hover:bg-ocean-800">
                {t('actions.login')}
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ocean-200">
              <li className="flex items-center gap-1.5"><Smartphone className="h-4 w-4" aria-hidden />{t('public.hero.channelWeb')}</li>
              <li className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" aria-hidden />{t('public.hero.channelSms')}</li>
              <li className="flex items-center gap-1.5"><Smartphone className="h-4 w-4" aria-hidden />{t('public.hero.channelUssd')}</li>
            </ul>
          </div>
          <FarmerPreview />
        </div>
      </section>

      {/* Loop */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-ocean-600">{t('public.loop.eyebrow')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t('public.loop.title')}</h2>
            <p className="mt-3 text-slate-600">{t('public.loop.subtitle')}</p>
          </div>
          <div className="mt-10 grid items-center gap-10 lg:grid-cols-[320px_1fr]">
            <div className="flex justify-center"><LoopDiagram /></div>
            <ol className="grid gap-4 sm:grid-cols-2">
              {LOOP.map(({ key, icon: Icon }, i) => (
                <li key={key} className="rounded-xl border border-slate-200 bg-sand-50 p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ocean-700 text-sm font-bold text-white">{i + 1}</span>
                    <Icon className="h-5 w-5 text-ocean-600" aria-hidden />
                    <h3 className="text-lg font-semibold text-slate-900">{t(`public.loop.${key}`)}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{t(`public.loop.${key}Text`)}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-12 rounded-2xl border border-ocean-100 bg-ocean-50/60 p-5 sm:p-8">
            <h3 className="mb-5 text-center text-sm font-bold uppercase tracking-wider text-ocean-700">{t('public.flow.title')}</h3>
            <PipelineFlow />
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="bg-sand-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">{t('public.audiences.title')}</h2>
          <p className="mt-3 max-w-2xl text-slate-600">{t('public.audiences.subtitle')}</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map(({ key, icon: Icon, tone }) => (
              <article key={key} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(`public.audiences.${key}.title`)}</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {[1, 2, 3].map((n) => (
                    <li key={n} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ocean-400" aria-hidden />{t(`public.audiences.${key}.b${n}`)}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Data honesty */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-ocean-600">{t('public.honesty.eyebrow')}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{t('public.honesty.title')}</h2>
              <p className="mt-3 text-slate-600">{t('public.honesty.subtitle')}</p>
              <Link to="/how-it-works" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-ocean-700 hover:text-ocean-900">
                {t('nav.howItWorks')} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {HONESTY.map(({ key, icon: Icon }) => (
                <div key={key} className="rounded-xl border border-slate-200 p-5">
                  <Icon className="h-5 w-5 text-ocean-600" aria-hidden />
                  <h3 className="mt-3 font-semibold text-slate-900">{t(`public.honesty.${key}.title`)}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(`public.honesty.${key}.text`)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-ocean-800">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-5 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{t('public.cta.title')}</h2>
            <p className="mt-1 text-ocean-200">{t('public.cta.text')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/demo" className="rounded-lg bg-teal-400 px-5 py-3 font-bold text-ocean-900 hover:bg-teal-300">{t('public.hero.tryDemo')}</Link>
            <Link to="/register" className="rounded-lg px-5 py-3 font-semibold text-white ring-1 ring-inset ring-ocean-400 hover:bg-ocean-700">{t('actions.register')}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
