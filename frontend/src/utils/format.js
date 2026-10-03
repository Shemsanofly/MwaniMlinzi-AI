export const pct = (p, dp = 0) => (p == null ? '—' : `${(p * 100).toFixed(dp)}%`);
export const num = (v, dp = 1) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
export const kg = (v) => (v == null ? '—' : `${num(v, 0)} kg`);
export const tonnes = (v) => (v == null ? '—' : `${num(v / 1000, 2)} t`);
export const tzs = (v) => (v == null ? '—' : `TZS ${num(v, 0)}`);

const locale = (lang) => (lang === 'sw' ? 'sw-TZ' : 'en-GB');
export const date = (d, lang = 'en') => (d ? new Date(d).toLocaleDateString(locale(lang), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (d, lang = 'en') => (d ? new Date(d).toLocaleString(locale(lang), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const isoDate = (d = new Date()) => new Date(d).toISOString().slice(0, 10);

export function timeAgo(d, lang = 'en') {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'sw' ? 'sw' : 'en', { numeric: 'auto' });
  if (Math.abs(s) < 60) return rtf.format(-s, 'second');
  if (Math.abs(s) < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (Math.abs(s) < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  return rtf.format(-Math.round(s / 86400), 'day');
}

const SW_VALUE_WORDS = { yes: 'ndiyo', no: 'hapana', poor: 'mbaya', fair: 'wastani', good: 'nzuri', 'loose/broken': 'imelegea/imekatika' };
/**
 * Factor values come from the rule engine in English ("8 days", "0.3 m waves", "yes").
 * In Kiswahili, translate the few words they use so no English leaks onto a Kiswahili screen.
 */
export function factorValue(value, lang = 'en') {
  if (value == null || lang !== 'sw') return value;
  const v = String(value);
  if (SW_VALUE_WORDS[v]) return SW_VALUE_WORDS[v];
  return v
    .replace(/(\S+) days\b/g, 'siku $1')
    .replace(/ m waves\b/g, ' m mawimbi');
}
