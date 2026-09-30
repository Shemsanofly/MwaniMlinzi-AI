/**
 * Sea outlook calculations (pure functions, no I/O).
 * Inputs are Open-Meteo hourly series requested with timezone=Africa/Dar_es_Salaam, so every time is a local
 * `YYYY-MM-DDTHH:mm` string. Nothing here fills in missing values: no data in → no verdict out.
 */

export const TIMEZONE = 'Africa/Dar_es_Salaam';
export const WORK_WINDOW_SHARE = 0.25; // window = level within 25% of the tide range above the low
const DAYLIGHT = { from: 6 * 60, to: 18 * 60 + 30 };
const DRYING_HOURS = { from: 7, to: 18 }; // 07:00–17:59
const MIN_DRYING_HOURS = 9; // of 11: GOOD/CAUTION need (nearly) the whole drying day for both measures

/** Starter values awaiting local validation; the admin can change them (setting `drying.thresholds`). */
export const DEFAULT_DRYING_THRESHOLDS = { cautionProbability: 30, badProbability: 60, cautionRainMm: 1, badRainMm: 5 };
const VERDICT_LEVEL = { GOOD: 'LOW', CAUTION: 'MEDIUM', BAD: 'HIGH' };

const round2 = (v) => Math.round(v * 100) / 100;
const minutesOf = (time) => Number(time.slice(11, 13)) * 60 + Number(time.slice(14, 16));
const isNum = (v) => v != null && Number.isFinite(v);

/** Local date / date-time strings in Africa/Dar_es_Salaam, independent of the server's time zone. */
export function localDateTime(d = new Date(), tz = TIMEZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export const localDate = (d = new Date(), tz = TIMEZONE) => localDateTime(d, tz).slice(0, 10);

/**
 * Low and high tides (local extrema of the hourly sea level). Each LOW also gets `daylight` (06:00–18:30)
 * and a work `window`: the contiguous hours around it whose level is within 25% of the tide range above the low
 * (range measured to the lower of the neighbouring highs, so the window is never overstated).
 */
export function extractTides(times, levels) {
  const pts = times.map((time, i) => ({ time, level: levels[i] })).filter((p) => isNum(p.level));
  if (pts.length < 3) return [];
  // Runs of equal consecutive levels: a turning point is a run lower (or higher) than BOTH neighbouring runs,
  // placed at the middle of the run. A shelf on a rising/falling limb is therefore not a tide.
  const runs = [];
  pts.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.level === p.level) last.end = i;
    else runs.push({ level: p.level, start: i, end: i });
  });
  const events = [];
  for (let r = 1; r < runs.length - 1; r += 1) {
    const [a, b, c] = [runs[r - 1].level, runs[r].level, runs[r + 1].level];
    const idx = Math.floor((runs[r].start + runs[r].end) / 2);
    if (b < a && b < c) events.push({ type: 'LOW', time: pts[idx].time, levelM: round2(b), idx });
    else if (b > a && b > c) events.push({ type: 'HIGH', time: pts[idx].time, levelM: round2(b), idx });
  }
  const seriesMax = Math.max(...pts.map((p) => p.level));
  return events.map((e, k) => {
    const { idx, ...event } = e;
    if (e.type !== 'LOW') return event;
    const highs = [events[k - 1], events[k + 1]].filter((x) => x?.type === 'HIGH').map((x) => x.levelM);
    const high = highs.length ? Math.min(...highs) : seriesMax;
    const limit = e.levelM + WORK_WINDOW_SHARE * (high - e.levelM);
    let s = idx; let t = idx;
    while (s > 0 && pts[s - 1].level <= limit) s -= 1;
    while (t < pts.length - 1 && pts[t + 1].level <= limit) t += 1;
    const minutes = minutesOf(e.time);
    return { ...event, daylight: minutes >= DAYLIGHT.from && minutes <= DAYLIGHT.to, window: { start: pts[s].time, end: pts[t].time } };
  });
}

/** Per local day: max rain probability and total rain during drying hours → GOOD / CAUTION / BAD (null if no data). */
export function dryingDays(times, probability, rainMm, thresholds = DEFAULT_DRYING_THRESHOLDS) {
  const th = { ...DEFAULT_DRYING_THRESHOLDS, ...thresholds };
  const days = new Map();
  times.forEach((time, i) => {
    const hour = Number(time.slice(11, 13));
    if (hour < DRYING_HOURS.from || hour >= DRYING_HOURS.to) return;
    const date = time.slice(0, 10);
    if (!days.has(date)) days.set(date, { probs: [], mm: [] });
    const d = days.get(date);
    if (isNum(probability?.[i])) d.probs.push(probability[i]);
    if (isNum(rainMm?.[i])) d.mm.push(rainMm[i]);
  });
  return [...days.entries()].map(([date, d]) => {
    const maxRainProbability = d.probs.length ? Math.max(...d.probs) : null;
    const total = d.mm.length ? round2(d.mm.reduce((s, v) => s + v, 0)) : null;
    // A missing measure is never read as "no rain": one measure over BAD is enough for BAD, but GOOD/CAUTION
    // need both measures for most of the drying hours. Otherwise there is no verdict.
    let verdict = null;
    if ((maxRainProbability ?? -1) > th.badProbability || (total ?? -1) > th.badRainMm) verdict = 'BAD';
    else if (d.probs.length >= MIN_DRYING_HOURS && d.mm.length >= MIN_DRYING_HOURS) {
      verdict = maxRainProbability >= th.cautionProbability || total >= th.cautionRainMm ? 'CAUTION' : 'GOOD';
    }
    return { date, maxRainProbability, rainMm: total, verdict, level: verdict ? VERDICT_LEVEL[verdict] : null };
  });
}
