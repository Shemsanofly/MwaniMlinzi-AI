import { BellRing, CloudOff, LineChart } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';

// Farm markers on the sonar, as % of the dial; `hot` ones glow coral.
const FARMS = [
  { x: 30, y: 36, hot: true, d: 0 },
  { x: 64, y: 28, d: 0.8 },
  { x: 72, y: 62, hot: true, d: 1.6 },
  { x: 40, y: 70, d: 2.2 },
  { x: 54, y: 48, d: 1.1 },
];

/** Login side panel: a night-sea sonar sweeping over farm lines, with what is waiting after sign-in. */
export default function LoginAside() {
  const { t } = useI18n();
  return (
    <aside className="ocean-band relative hidden flex-col overflow-hidden p-10 text-white lg:flex">
      <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-lagoon-300">
        <span className="h-px w-6 bg-lagoon-300/70" aria-hidden />{t('public.auth.login.eyebrow')}
      </p>
      <p className="display mt-4 text-[1.9rem] font-medium leading-tight">{t('public.auth.login.title')}</p>
      <p className="mt-3 text-sm leading-relaxed text-ocean-100/85">{t('public.auth.login.text')}</p>

      {/* Sonar dial */}
      <div className="relative mx-auto my-8 aspect-square w-full max-w-[260px]" aria-hidden>
        {[100, 72, 44].map((s) => (
          <span key={s} className="absolute rounded-full border border-lagoon-300/20" style={{ inset: `${(100 - s) / 2}%` }} />
        ))}
        <span className="absolute inset-0 flex items-center justify-center"><span className="h-px w-full bg-lagoon-300/10" /></span>
        <span className="absolute inset-0 flex justify-center"><span className="h-full w-px bg-lagoon-300/10" /></span>
        <span className="absolute inset-0 rounded-full motion-safe:animate-[spin-slow_6s_linear_infinite]" style={{ background: 'conic-gradient(from 0deg, rgb(69 207 182 / 0.38), rgb(69 207 182 / 0) 70deg, transparent 360deg)' }} />
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          <path d="M8 22 C 20 18 26 30 22 44 S 14 70 26 86" fill="none" stroke="rgb(214 200 174 / 0.35)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        {FARMS.map((f) => (
          <span key={`${f.x}-${f.y}`} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${f.x}%`, top: `${f.y}%` }}>
            <span className={`block h-2.5 w-2.5 rounded-full ${f.hot ? 'bg-coral-400' : 'bg-lagoon-300'}`} style={{ animation: `pulse-ring 2.4s var(--ease-out-soft) ${f.d}s infinite`, boxShadow: f.hot ? '0 0 12px rgb(242 135 107 / 0.8)' : undefined }} />
          </span>
        ))}
        <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_white]" />
      </div>

      <ul className="mt-auto space-y-3 text-sm">
        {[{ k: 'b1', icon: BellRing }, { k: 'b2', icon: LineChart }, { k: 'b3', icon: CloudOff }].map(({ k, icon: Icon }, i) => (
          <li key={k} className="flex animate-rise items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 backdrop-blur" style={{ animationDelay: `${250 + i * 110}ms` }}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-lagoon-400/15 text-lagoon-300"><Icon className="h-4 w-4" aria-hidden /></span>
            <span className="text-ocean-50">{t(`public.auth.login.${k}`)}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
