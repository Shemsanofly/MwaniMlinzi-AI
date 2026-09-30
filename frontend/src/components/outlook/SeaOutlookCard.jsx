import { useQuery } from '@tanstack/react-query';
import { CloudRain, CloudSun, Sun, Waves } from 'lucide-react';
import { farmApi } from '../../api/endpoints.js';
import { useI18n } from '../../i18n/I18nProvider.jsx';
import { Card, CardHeader, EmptyState, ErrorState, Spinner, cx } from '../ui/index.jsx';
import { timeAgo } from '../../utils/format.js';

const VERDICT_STYLE = {
  GOOD: { icon: Sun, box: 'bg-seaweed-50 text-seaweed-800 ring-seaweed-500/30' },
  CAUTION: { icon: CloudSun, box: 'bg-amber-50 text-amber-800 ring-amber-200' },
  BAD: { icon: CloudRain, box: 'bg-red-50 text-red-800 ring-red-200' },
};

const hhmm = (localTime) => localTime.slice(11, 16);
const weekday = (date, lang) => new Date(`${date}T12:00:00Z`).toLocaleDateString(lang === 'sw' ? 'sw-TZ' : 'en-GB', { weekday: 'short', timeZone: 'UTC' });

/**
 * "Today at sea": next daylight low tide + best work window, today's drying-weather verdict with the approved
 * advice, and a 3-day strip. Everything comes from the stored Open-Meteo forecast; nothing is shown when there is none.
 */
export default function SeaOutlookCard({ farmId }) {
  const { t, lang } = useI18n();
  const q = useQuery({ queryKey: ['outlook', farmId], queryFn: () => farmApi.outlook(farmId), enabled: !!farmId, staleTime: 15 * 60_000 });
  const outlook = q.data?.outlook;

  return (
    <Card className="mt-4 p-4" data-testid="sea-outlook">
      <CardHeader title={t('outlook.title')} subtitle={t('outlook.subtitle')} icon={Waves} />
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
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-lg bg-ocean-50 p-3 text-ocean-900">
        {w ? (
          <>
            <p className="text-lg font-bold">
              {t('outlook.lowTideAt', { day: w.time.slice(0, 10) === outlook.today.date ? t('outlook.today') : t('outlook.tomorrow'), time: hhmm(w.time) })}
            </p>
            <p className="text-sm">{t('outlook.workWindow', { start: hhmm(w.window.start), end: hhmm(w.window.end) })}</p>
          </>
        ) : <p className="text-sm font-medium">{outlook.tides?.length ? t('outlook.noDaylightLow') : t('outlook.noTide')}</p>}
      </div>

      <div className={cx('rounded-lg p-3 ring-1', style ? style.box : 'bg-slate-50 text-slate-700 ring-slate-200')}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{t('outlook.drying')}</p>
        {dry?.verdict ? (
          <>
            <p className="mt-1 flex items-center gap-2 text-lg font-bold">
              <style.icon className="h-5 w-5" aria-hidden />{t(`outlook.verdict.${dry.verdict}`)}
              {dry.maxRainProbability != null && <span className="text-sm font-medium">· {t('outlook.rainChance', { p: dry.maxRainProbability })}</span>}
            </p>
            {advice && <p className="mt-1 text-sm">{lang === 'en' ? advice.action : advice.actionSw}</p>}
          </>
        ) : <p className="mt-1 text-sm">{t('outlook.noDrying')}</p>}
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
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500">
        <span className="font-semibold">{t(`outlook.source.${outlook.source}`)}</span>
        {' · '}{t('outlook.updated', { when: timeAgo(outlook.fetchedAt, lang) })}
        {' · '}{outlook.note?.[lang] || outlook.note?.en}
      </p>
    </div>
  );
}
