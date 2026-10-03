import { LineChart, MapPin, ShieldCheck, UserPlus } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';

const STEPS = [
  { k: 's1', icon: UserPlus },
  { k: 's2', icon: MapPin },
  { k: 's3', icon: LineChart },
];

// Seaweed fronds along the bottom edge: x position, height, colour, sway duration/delay.
const FRONDS = [
  { x: 8, h: 120, c: '#1a8156', t: 5.5, d: 0 },
  { x: 22, h: 170, c: '#26a06b', t: 6.5, d: 0.6 },
  { x: 36, h: 100, c: '#45cfb6', t: 5, d: 1.2 },
  { x: 70, h: 150, c: '#1a8156', t: 7, d: 0.3 },
  { x: 84, h: 115, c: '#26a06b', t: 6, d: 0.9 },
];

function Frond({ x, h, c, t, d }) {
  return (
    <svg viewBox={`0 0 40 ${h}`} className="absolute bottom-0 w-10 origin-bottom" style={{ left: `${x}%`, height: h, animation: `sway ${t}s ease-in-out ${d}s infinite` }} aria-hidden>
      <path d={`M20 ${h} C 8 ${h * 0.7}, 32 ${h * 0.45}, 18 ${h * 0.2} S 22 6, 20 0`} fill="none" stroke={c} strokeWidth="5" strokeLinecap="round" opacity=".85" />
      <path d={`M20 ${h * 0.62} C 30 ${h * 0.55}, 34 ${h * 0.5}, 36 ${h * 0.42}`} fill="none" stroke={c} strokeWidth="3.5" strokeLinecap="round" opacity=".7" />
      <path d={`M19 ${h * 0.38} C 10 ${h * 0.32}, 6 ${h * 0.28}, 4 ${h * 0.2}`} fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}

/** Registration side panel: bright lagoon, the three set-up steps and a slow-swaying seaweed bed. */
export default function RegisterAside() {
  const { t } = useI18n();
  return (
    <aside className="relative hidden flex-col overflow-clip bg-gradient-to-b from-lagoon-200/60 via-ocean-50 to-sand-100 p-9 lg:flex">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/50 blur-2xl" aria-hidden />
      {/* Clipping uses overflow-clip (not hidden) so this block can stay in view beside the long form. */}
      <div className="sticky top-24 z-10">
      <p className="relative inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-ocean-600">
        <span className="h-px w-6 bg-ocean-400" aria-hidden />{t('public.auth.register.eyebrow')}
      </p>
      <p className="display relative mt-4 text-[1.9rem] font-medium leading-tight text-ocean-950">{t('public.auth.register.title')}</p>

      <ol className="relative mt-8 space-y-6">
        <span className="absolute bottom-5 left-[19px] top-5 w-0.5 origin-top rounded-full bg-gradient-to-b from-ocean-600 via-lagoon-400 to-seaweed-500 motion-safe:animate-[grow-y_1.4s_var(--ease-out-soft)_0.3s_both]" aria-hidden />
        {STEPS.map(({ k, icon: Icon }, i) => (
          <li key={k} className="relative flex animate-rise gap-4" style={{ animationDelay: `${200 + i * 160}ms` }}>
            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-ocean-700 shadow-[var(--shadow-soft)] ring-1 ring-ocean-100">
              <Icon className="h-5 w-5" aria-hidden />
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ocean-900 text-[10px] font-bold text-white">{i + 1}</span>
            </span>
            <div className="pt-0.5">
              <p className="font-bold text-slate-900">{t(`public.auth.register.${k}t`)}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{t(`public.auth.register.${k}d`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="relative mt-8 flex items-start gap-2 rounded-xl bg-white/70 p-3 text-xs leading-relaxed text-slate-600 ring-1 ring-white backdrop-blur">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-seaweed-600" aria-hidden />{t('public.auth.register.foot')}
      </p>
      </div>

      <div className="relative -mx-9 -mb-9 mt-auto h-44 pt-6" aria-hidden>
        {FRONDS.map((f) => <Frond key={f.x} {...f} />)}
        <div className="absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sand-200 to-transparent" />
      </div>
    </aside>
  );
}
