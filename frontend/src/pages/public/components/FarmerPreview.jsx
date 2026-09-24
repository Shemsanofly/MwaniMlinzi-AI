import { Bell, ClipboardList, Thermometer, Waves } from 'lucide-react';
import { useI18n } from '../../../i18n/I18nProvider.jsx';
import { RISK_STYLE } from '../../../utils/risk.js';

/**
 * Static illustration of the farmer screen, built from HTML. It is explicitly labelled
 * "Example / Mfano" — the numbers are illustrative, not a live prediction.
 */
export default function FarmerPreview() {
  const { t } = useI18n();
  const high = RISK_STYLE.HIGH;
  return (
    <figure className="relative mx-auto w-full max-w-[320px]" aria-label={t('public.preview.aria')}>
      <span className="absolute -top-3 right-4 z-10 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-950 shadow">
        {t('public.preview.example')}
      </span>
      <div className="overflow-hidden rounded-[2rem] border-[6px] border-slate-800 bg-sand-50 shadow-2xl">
        <div className="flex items-center justify-between bg-ocean-800 px-4 py-3 text-white">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-ocean-200">{t('public.preview.farmLabel')}</p>
            <p className="text-sm font-semibold">FARM001 · Paje</p>
          </div>
          <Bell className="h-4 w-4 text-ocean-200" aria-hidden />
        </div>
        <div className="space-y-3 p-3">
          <div className={`rounded-xl border-l-4 bg-white p-3 shadow-sm ${high.border}`}>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Thermometer className={`h-4 w-4 ${high.text}`} aria-hidden />{t('risk.type.HEAT_ICE_ICE')}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${high.badge}`}>{t('risk.level.HIGH').toUpperCase()}</span>
            </div>
            <p className={`mt-1 text-3xl font-extrabold ${high.text}`}>78%</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full w-[78%] ${high.bar}`} /></div>
            <p className="mt-2 text-xs text-slate-500">{t('public.preview.reason')}</p>
          </div>
          <div className="overflow-hidden rounded-xl border-2 border-orange-600 bg-white">
            <p className="bg-orange-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-orange-800">{t('public.preview.nextAction')}</p>
            <p className="px-3 py-2 text-sm font-semibold leading-snug text-slate-900">{t('public.preview.action')}</p>
            <div className="flex gap-2 px-3 pb-3">
              <span className="rounded-lg bg-seaweed-600 px-3 py-1.5 text-xs font-semibold text-white">{t('public.preview.done')}</span>
              <span className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300">{t('public.preview.report')}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-2"><p className="flex items-center gap-1 text-slate-500"><Thermometer className="h-3 w-3" aria-hidden />{t('public.preview.sea')}</p><p className="font-bold text-slate-900">+1.6°C</p></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2"><p className="flex items-center gap-1 text-slate-500"><Waves className="h-3 w-3" aria-hidden />{t('public.preview.waves')}</p><p className="font-bold text-slate-900">0.4 m</p></div>
          </div>
          <p className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1.5 text-[11px] font-medium text-violet-800"><ClipboardList className="h-3 w-3" aria-hidden />{t('public.preview.demoLabel')}</p>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-ocean-200">{t('public.preview.caption')}</figcaption>
    </figure>
  );
}
