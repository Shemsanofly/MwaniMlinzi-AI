import { extractTides, dryingDays, localDate, localDateTime, DEFAULT_DRYING_THRESHOLDS } from '../../src/ai/seaOutlook.js';

/** Hourly local times for `days` days starting 2026-09-30T00:00. */
const hours = (days = 2) => Array.from({ length: days * 24 }, (_, i) => {
  const d = 30 + Math.floor(i / 24);
  const date = d <= 30 ? `2026-09-${d}` : `2026-10-${String(d - 30).padStart(2, '0')}`;
  return `${date}T${String(i % 24).padStart(2, '0')}:00`;
});

// Real shape from Open-Meteo Marine at Paje (2026-09-30): highs ~05:00/18:00, lows ~12:00/00:00.
const PAJE_LEVELS = [
  -0.9, -0.2, 0.7, 1.5, 2.1, 2.27, 2.0, 1.3, 0.4, -0.4, -0.9, -1.15, -1.21, -1.0, -0.4, 0.2, 0.9, 1.4, 1.67, 1.5, 1.0, 0.3, -0.4, -0.9,
  -1.01, -0.6, 0.2, 1.0, 1.7, 2.05, 2.1, 1.6, 0.8, 0.0, -0.6, -0.9, -0.97, -0.8, -0.3, 0.3, 0.9, 1.3, 1.43, 1.2, 0.6, -0.1, -0.6, -0.9,
];

describe('extractTides', () => {
  const events = extractTides(hours(2), PAJE_LEVELS);

  test('finds alternating lows and highs at the right hours', () => {
    expect(events.map((e) => `${e.type} ${e.time.slice(5)}`)).toEqual([
      'HIGH 09-30T05:00', 'LOW 09-30T12:00', 'HIGH 09-30T18:00', 'LOW 10-01T00:00', 'HIGH 10-01T06:00', 'LOW 10-01T12:00', 'HIGH 10-01T18:00',
    ]);
    expect(events[1].levelM).toBe(-1.21);
  });

  test('work window covers the contiguous hours within 25% of the tide range above the low', () => {
    const low = events[1]; // -1.21, adjacent highs 2.27 and 1.67 → nearer (lower) high gives the smaller range: 1.67 - -1.21 = 2.88 → threshold -0.49
    expect(low.window).toEqual({ start: '2026-09-30T10:00', end: '2026-09-30T13:00' });
  });

  test('daylight is 06:00–18:30 local', () => {
    expect(events[1].daylight).toBe(true); // 12:00
    expect(events[3].daylight).toBe(false); // 00:00
    expect(events[0].daylight).toBeUndefined(); // highs carry no daylight/window
  });

  test('a shelf of equal levels on a falling limb is not a low tide; a flat bottom is one low at its middle', () => {
    const t8 = hours(1).slice(0, 8);
    const shelf = extractTides(t8, [2, 1.5, 1.2, 1.2, 0.5, -1, 0, 1]);
    expect(shelf.filter((e) => e.type === 'LOW').map((e) => e.time.slice(11))).toEqual(['05:00']);
    const flatBottom = extractTides(hours(1).slice(0, 7), [2, 0, -1, -1, -1, 0, 2]);
    expect(flatBottom.map((e) => `${e.type} ${e.time.slice(11)}`)).toEqual(['LOW 03:00']);
  });

  test('ignores null levels and returns nothing for too few points', () => {
    expect(extractTides(['a', 'b'], [1, 0])).toEqual([]);
    expect(extractTides(hours(1), Array(24).fill(null))).toEqual([]);
    const withGap = [...PAJE_LEVELS.slice(0, 24)];
    withGap[3] = null;
    expect(extractTides(hours(1), withGap).some((e) => e.type === 'LOW' && e.time.endsWith('12:00'))).toBe(true);
  });
});

describe('dryingDays', () => {
  const times = hours(1);
  const probs = (drying, other = 90) => times.map((t) => { const h = Number(t.slice(11, 13)); return h >= 7 && h < 18 ? drying : other; });
  const rain = (mm) => times.map((t) => (t.endsWith('T12:00') ? mm : 0));

  test('GOOD when rain chance stays low and no rain in drying hours (night rain ignored)', () => {
    const [d] = dryingDays(times, probs(20), times.map((t) => (t.endsWith('T02:00') ? 9 : 0)));
    expect(d).toMatchObject({ date: '2026-09-30', maxRainProbability: 20, rainMm: 0, verdict: 'GOOD', level: 'LOW' });
  });
  test('CAUTION from probability or a little rain', () => {
    expect(dryingDays(times, probs(45), rain(0))[0].verdict).toBe('CAUTION');
    expect(dryingDays(times, probs(10), rain(1.2))[0]).toMatchObject({ verdict: 'CAUTION', level: 'MEDIUM' });
  });
  test('BAD from high probability or heavy rain', () => {
    expect(dryingDays(times, probs(70), rain(0))[0]).toMatchObject({ verdict: 'BAD', level: 'HIGH' });
    expect(dryingDays(times, probs(10), rain(6))[0].verdict).toBe('BAD');
  });
  test('no data is unknown, never GOOD', () => {
    expect(dryingDays(times, times.map(() => null), times.map(() => null))[0]).toMatchObject({ verdict: null, level: null, maxRainProbability: null, rainMm: null });
  });
  test('a missing measure is never read as "no rain": GOOD/CAUTION need both measures for most drying hours', () => {
    const none = times.map(() => null);
    expect(dryingDays(times, none, rain(0))[0].verdict).toBeNull(); // no probability at all
    expect(dryingDays(times, probs(20), none)[0].verdict).toBeNull(); // no rain amounts at all
    const oneHour = times.map((t) => (t.endsWith('T12:00') ? 5 : null));
    expect(dryingDays(times, oneHour, times.map((t) => (t.endsWith('T12:00') ? 0 : null)))[0].verdict).toBeNull();
  });
  test('one measure over the BAD threshold is enough for BAD even when the other is missing', () => {
    expect(dryingDays(times, probs(75), times.map(() => null))[0].verdict).toBe('BAD');
    expect(dryingDays(times, times.map(() => null), rain(7))[0].verdict).toBe('BAD');
  });
  test('thresholds can be changed by the admin', () => {
    expect(dryingDays(times, probs(45), rain(0), { ...DEFAULT_DRYING_THRESHOLDS, badProbability: 40 })[0].verdict).toBe('BAD');
  });
});

describe('local time (Africa/Dar_es_Salaam, UTC+3)', () => {
  test('a late UTC evening is already the next local day', () => {
    expect(localDate(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10-01');
    expect(localDateTime(new Date('2026-09-30T09:05:00Z'))).toBe('2026-09-30T12:05');
  });
});
