import { useQuery } from '@tanstack/react-query';
import { ChevronDown, CloudRain, CloudSun, RefreshCw, Sun, Waves } from 'lucide-react';
import { farmApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Button, Card, CardHeader, EmptyState, ErrorState, Spinner, cx } from '../ui/index.jsx';
import { dateTime, timeAgo } from '../../utils/format.js';

const VERDICT_STYLE = {
  GOOD: { icon: Sun, box: 'bg-seaweed-50 text-seaweed-800 ring-seaweed-500/30' },
  CAUTION: { icon: CloudSun, box: 'bg-amber-50 text-amber-800 ring-amber-200' },
  BAD: { icon: CloudRain, box: 'bg-red-50 text-red-800 ring-red-200' },
};

const hhmm = (localTime) => localTime.slice(11, 16);
const weekday = (date, lang) => new Date(`${date}T12:00:00Z`).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });

/**
 * Current API model estimate, next estimated low-water window, remaining drying forecast and upcoming days.
 * Every weather value comes from Open-Meteo; current precipitation never comes from a future probability.
 */
export default function SeaOutlookCard({ farmId }) {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['outlook', farmId], queryFn: () => farmApi.outlook(farmId), enabled: !!farmId, staleTime: 5 * 60_000, refetchInterval: 15 * 60_000 });
  const outlook = q.data?.outlook;

  return (
    <Card className="mt-4 p-4" data-testid="sea-outlook">
      <div className="flex items-start justify-between gap-2">
        <CardHeader title={t('outlook.title')} subtitle={t('outlook.subtitle')} icon={Waves} className="min-w-0 flex-1 border-0 px-0 py-0 sm:px-0" />
        <Button variant="ghost" size="sm" className="min-w-11 shrink-0" icon={RefreshCw} aria-label={t('outlook.refresh')} loading={q.isFetching} onClick={() => q.refetch()}><span className="hidden min-[380px]:inline">{t('outlook.refresh')}</span></Button>
      </div>
      {q.isLoading ? <div className="flex justify-center p-4"><Spinner /></div>
        : q.error ? <ErrorState error={q.error} onRetry={q.refetch} compact />
        : !outlook ? <EmptyState icon={Waves} title={t('outlook.none')} message={t('outlook.noneText')} />
        : <OutlookBody outlook={outlook} t={t} lang={lang} />}
    </Card>
  );
}

function OutlookBody({ outlook, t, lang }) {
  const w = outlook.today.nextWorkWindow;
  const dry = outlook.today.drying;
  const style = dry?.verdict ? VERDICT_STYLE[dry.verdict] : null;
  const advice = outlook.today.advice;
  const current = outlook.current;
  const tomorrow = new Date(`${outlook.today.date}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tideDay = w && (w.time.startsWith(outlook.today.date) ? t('outlook.today') : w.time.startsWith(tomorrow.toISOString().slice(0, 10)) ? t('outlook.tomorrow') : `${weekday(w.time.slice(0, 10), lang)} ${w.time.slice(8, 10)}/${w.time.slice(5, 7)}`);
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg bg-slate-50 p-3 text-slate-800" data-testid="weather-now">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t('outlook.currentTitle')}</p>
        {current ? <>
          <p className="mt-1 font-semibold">{t(current.precipitationMm > 0 ? 'outlook.currentRain' : 'outlook.currentDry')}</p>
          <p className="text-sm">{t('outlook.currentAmount', { mm: current.precipitationMm, minutes: current.intervalMinutes })}{current.temperatureC != null ? ` · ${current.temperatureC}°C` : ''}</p>
          <p className="mt-1 text-xs text-slate-500">{current.provider} · {dateTime(current.observedAt, lang)}</p>
        </> : <p className="mt-1 text-sm">{t('outlook.noCurrent')}</p>}
      </div>
      <div className="rounded-lg bg-ocean-50 p-3 text-ocean-900">
        {w ? (
          <>
            <p className="text-lg font-bold">
              {t('outlook.lowTideAt', { day: tideDay, time: hhmm(w.time) })}
            </p>
            <p className="text-sm">{t('outlook.workWindow', { start: hhmm(w.window.start), end: hhmm(w.window.end) })}</p>
          </>
        ) : <p className="text-sm font-medium">{outlook.tides?.length ? t('outlook.noDaylightLow') : t('outlook.noTide')}</p>}
      </div>

      <div className={cx('rounded-lg p-3 ring-1', style ? style.box : 'bg-slate-50 text-slate-700 ring-slate-200')}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{t('outlook.drying')}</p>
        {dry?.verdict ? (
          <>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-lg font-bold">
              <style.icon className="h-5 w-5" aria-hidden />{t(`outlook.verdict.${dry.verdict}`)}
              {dry.maxRainProbability != null && <span className="text-sm font-medium">· {t('outlook.rainChance', { p: dry.maxRainProbability })}</span>}
            </p>
            {dry.windowStart && dry.windowEnd && <p className="mt-1 text-sm">{t('outlook.forecastWindow', { start: hhmm(dry.windowStart), end: hhmm(dry.windowEnd) })}{dry.rainMm != null ? ` · ${t('outlook.forecastAmount', { mm: dry.rainMm })}` : ''}</p>}
            {advice && <p className="mt-1 text-sm">{lang === 'en' ? advice.action : advice.actionSw}</p>}
          </>
        ) : <p className="mt-1 text-sm">{t(outlook.today.dryingDayEnded ? 'outlook.dayEnded' : 'outlook.noDrying')}</p>}
      </div>

      {outlook.days.length > 1 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">{t('outlook.next3')}</p>
          <ul className="grid grid-cols-3 gap-2">
            {outlook.days.slice(0, 3).map((d) => {
              const s = d.verdict ? VERDICT_STYLE[d.verdict] : null;
              const Icon = s?.icon || CloudSun;
              return (
                <li key={d.date} data-testid="drying-day" className={cx('rounded-lg p-2 text-center text-xs ring-1', s ? s.box : 'bg-slate-50 text-slate-500 ring-slate-200')}>
                  <span className="block font-semibold capitalize">{weekday(d.date, lang)}</span>
                  <Icon className="mx-auto my-1 h-4 w-4" aria-hidden />
                  <span className="block">{d.verdict ? t(`outlook.verdictShort.${d.verdict}`) : '—'}</span>
                  {d.maxRainProbability != null && <span className="mt-1 block">{t('outlook.rainChance', { p: d.maxRainProbability })}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500">
        <span className="font-semibold">{t(`outlook.source.${outlook.source}`)}</span>
        {' · '}{t('outlook.updated', { when: timeAgo(outlook.fetchedAt, lang) })}
      </p>
      <details className="group border-t border-slate-100 text-xs text-slate-500">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg font-semibold text-ocean-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocean-500/40 [&::-webkit-details-marker]:hidden">
          {t('outlook.details')}
          <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="space-y-2 pb-2 [overflow-wrap:anywhere]">
          {outlook.note && <p>{outlook.note[lang] || outlook.note.en}</p>}
          <p>{t('outlook.rainMeaning')}</p>
          <p>{[
            outlook.providers?.rain && `${t('outlook.weatherSource')}: ${outlook.providers.rain}${outlook.partTimes?.rain ? ` · ${timeAgo(outlook.partTimes.rain, lang)}` : ''}`,
            outlook.providers?.tide && `${t('outlook.tideSource')}: ${outlook.providers.tide}${outlook.partTimes?.tide ? ` · ${timeAgo(outlook.partTimes.tide, lang)}` : ''}`,
          ].filter(Boolean).join(' / ')}</p>
        </div>
      </details>
    </div>
  );
}
