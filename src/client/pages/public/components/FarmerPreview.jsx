import { Bell, CheckCircle2, Thermometer, Waves } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { RISK_STYLE } from '../../../utils/risk.js';

/** An example of the farmer home screen (illustrative values, clearly captioned), drawn in HTML inside a phone frame. */
export default function FarmerPreview() {
  const { t } = useI18n();
  const high = RISK_STYLE.HIGH;
  return (
    <figure className="relative mx-auto w-full max-w-[330px] animate-[rise_0.9s_var(--ease-out-soft)_0.25s_both]" aria-label={t('public.preview.aria')}>
      {/* soft glow behind the device */}
      <div className="absolute -inset-10 -z-0 rounded-full bg-lagoon-400/20 blur-3xl" aria-hidden />

      <div className="relative animate-swell">
        <div className="overflow-hidden rounded-[2.4rem] border-[7px] border-ocean-950 bg-sand-50 shadow-[0_40px_80px_-30px_rgb(0_0_0/0.6)] ring-1 ring-white/10">
          <div className="mx-auto mt-2 h-4 w-24 rounded-full bg-ocean-950" aria-hidden />
          <div className="flex items-center justify-between px-4 pb-3 pt-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('public.preview.farmLabel')}</p>
              <p className="text-sm font-extrabold text-ocean-900">Paje · Line A</p>
            </div>
            <span className="relative rounded-full bg-white p-2 shadow-sm ring-1 ring-slate-200">
              <Bell className="h-3.5 w-3.5 text-ocean-700" aria-hidden />
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-coral-500" />
            </span>
          </div>
          <div className="space-y-2.5 px-3 pb-4">
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/80">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800"><Thermometer className={`h-4 w-4 ${high.text}`} aria-hidden />{t('risk.type.HEAT_ICE_ICE')}</p>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${high.badge}`}>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-600" />{t('risk.level.HIGH')}
                </span>
              </div>
              <p className={`mt-1.5 text-[2rem] font-extrabold leading-none tracking-tight ${high.text}`}>78<span className="text-lg">%</span></p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full w-[78%] origin-left rounded-full ${high.bar} animate-[grow_1.4s_var(--ease-out-soft)_0.8s_both]`} /></div>
              <p className="mt-2 text-[11px] leading-snug text-slate-500">{t('public.preview.reason')}</p>
            </div>
            <div className="overflow-hidden rounded-2xl bg-ocean-900 text-white shadow-sm">
              <p className="px-3 pt-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-lagoon-300">{t('public.preview.nextAction')}</p>
              <p className="px-3 pt-1 text-[13px] font-semibold leading-snug">{t('public.preview.action')}</p>
              <div className="flex gap-2 p-3">
                <span className="inline-flex items-center gap-1 rounded-lg bg-lagoon-400 px-2.5 py-1.5 text-[11px] font-bold text-ocean-950"><CheckCircle2 className="h-3 w-3" aria-hidden />{t('public.preview.done')}</span>
                <span className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-ocean-100 ring-1 ring-inset ring-white/20">{t('public.preview.report')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="relative mt-3 text-center text-xs font-medium text-ocean-100/80">{t('public.preview.example')}</figcaption>

      {/* floating readings */}
      <div className="absolute -left-28 top-48 hidden animate-[float-y_7s_ease-in-out_infinite] rounded-2xl bg-white/95 px-3 py-2 shadow-[var(--shadow-lift)] ring-1 ring-slate-200/70 backdrop-blur [--r:-4deg] sm:block">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><Thermometer className="h-3 w-3" aria-hidden />{t('public.preview.sea')}</p>
        <p className="text-base font-extrabold text-orange-600">+1.6°C</p>
      </div>
      <div className="absolute -right-24 bottom-16 hidden animate-[float-y_8s_ease-in-out_1s_infinite] rounded-2xl bg-white/95 px-3 py-2 shadow-[var(--shadow-lift)] ring-1 ring-slate-200/70 backdrop-blur [--r:3deg] sm:block">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500"><Waves className="h-3 w-3" aria-hidden />{t('public.preview.waves')}</p>
        <p className="text-base font-extrabold text-ocean-800">0.4 m</p>
      </div>
    </figure>
  );
}
