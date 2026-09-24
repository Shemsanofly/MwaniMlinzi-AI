import { Link } from 'react-router-dom';
import { CloudLightning, KeyRound, Leaf, Lock, ShieldCheck, Sprout, Thermometer, UserCheck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import PublicHero from './components/PublicHero.jsx';

const CHALLENGES = [
  { key: 'heat', icon: Thermometer },
  { key: 'storm', icon: CloudLightning },
  { key: 'growth', icon: Sprout },
  { key: 'harvest', icon: Leaf },
];
const PRIVACY = [
  { key: 'consent', icon: UserCheck },
  { key: 'rbac', icon: KeyRound },
  { key: 'ownership', icon: Lock },
  { key: 'buyers', icon: ShieldCheck },
];
const SERVES = ['farmers', 'cooperatives', 'extension', 'buyers'];

export default function About() {
  const { t } = useI18n();
  return (
    <div>
      <PublicHero eyebrow={t('nav.about')} title={t('public.about.title')} subtitle={t('public.about.subtitle')} />
      <div className="mx-auto max-w-5xl space-y-14 px-4 py-12 sm:px-6">
        <section>
          <h2 className="text-2xl font-bold text-slate-900">{t('public.about.problemTitle')}</h2>
          <p className="mt-3 leading-relaxed text-slate-700">{t('public.about.problem1')}</p>
          <p className="mt-3 leading-relaxed text-slate-700">{t('public.about.problem2')}</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {CHALLENGES.map(({ key, icon: Icon }) => (
              <div key={key} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" aria-hidden />
                <div>
                  <h3 className="font-semibold text-slate-900">{t(`public.about.challenges.${key}.title`)}</h3>
                  <p className="mt-1 text-sm text-slate-600">{t(`public.about.challenges.${key}.text`)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-ocean-100 bg-ocean-50/60 p-6">
          <h2 className="text-2xl font-bold text-slate-900">{t('public.about.answerTitle')}</h2>
          <p className="mt-3 leading-relaxed text-slate-700">{t('public.about.answer')}</p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-slate-900">{t('public.about.servesTitle')}</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {SERVES.map((k) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
                <dt className="font-semibold text-slate-900">{t(`public.audiences.${k}.title`)}</dt>
                <dd className="mt-1 text-sm text-slate-600">{t(`public.about.serves.${k}`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-slate-900">{t('public.about.privacyTitle')}</h2>
          <p className="mt-3 text-slate-700">{t('public.about.privacyIntro')}</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {PRIVACY.map(({ key, icon: Icon }) => (
              <div key={key} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ocean-600" aria-hidden />
                <div>
                  <h3 className="font-semibold text-slate-900">{t(`public.about.privacy.${key}.title`)}</h3>
                  <p className="mt-1 text-sm text-slate-600">{t(`public.about.privacy.${key}.text`)}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('public.about.honestyNote')}</p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link to="/how-it-works" className="rounded-lg bg-ocean-700 px-5 py-3 font-semibold text-white hover:bg-ocean-800">{t('nav.howItWorks')}</Link>
          <Link to="/demo" className="rounded-lg px-5 py-3 font-semibold text-ocean-800 ring-1 ring-inset ring-ocean-200 hover:bg-ocean-50">{t('public.hero.tryDemo')}</Link>
        </div>
      </div>
    </div>
  );
}
