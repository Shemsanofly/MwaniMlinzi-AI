import { useI18n } from '../../../i18n/I18nProvider.jsx';

/**
 * What-if inputs: backend override key, range and step. Ranges stay inside the backend simulationSchema.
 * `typical` is the starting value used only when the farm's latest real reading has no value for that field
 * (the input is then marked "no reading"), so a missing value is never silently shown as a measurement.
 */
export const SIM_FIELDS = [
  { key: 'sstAnomalyC', envKey: 'sstAnomalyC', min: -2, max: 4, step: 0.1, unit: '°C', signed: true, typical: 0 },
  { key: 'sstAnomalyDays', envKey: 'sstAnomalyDays', min: 0, max: 14, step: 1, unit: 'd', int: true, typical: 0 },
  { key: 'waveHeightM', envKey: 'waveHeightM', min: 0, max: 4, step: 0.1, unit: 'm', typical: 0.5 },
  { key: 'windSpeedKmh', envKey: 'windSpeedKmh', min: 0, max: 80, step: 1, unit: 'km/h', typical: 15 },
  { key: 'rainfallMm', envKey: 'rainfallMm', min: 0, max: 100, step: 1, unit: 'mm', typical: 0 },
  { key: 'currentVelocityMs', envKey: 'currentVelocityMs', min: 0, max: 2, step: 0.05, unit: 'm/s', typical: 0.2 },
  { key: 'salinityPsu', envKey: 'salinityPsu', min: 20, max: 40, step: 0.5, unit: 'PSU', typical: 35 },
];

const clamp = (v, f) => Math.min(f.max, Math.max(f.min, v));
const round = (v, f) => (f.int ? Math.round(v) : Math.round(v / f.step) * f.step);

/** Initial slider values taken from the farm's current environment (clamped to the slider range). */
const hasValue = (env, f) => env?.[f.envKey] != null && Number.isFinite(Number(env[f.envKey]));

/** Keys of the inputs that have no value in the latest real reading. */
export function missingFromEnv(env) {
  return SIM_FIELDS.filter((f) => !hasValue(env, f)).map((f) => f.key);
}

export function valuesFromEnv(env) {
  return Object.fromEntries(SIM_FIELDS.map((f) => {
    const v = hasValue(env, f) ? Number(env[f.envKey]) : f.typical;
    return [f.key, Number(round(clamp(v, f), f).toFixed(2))];
  }));
}

export const PRESETS = {
  heatwave: { sstAnomalyC: 2, sstAnomalyDays: 8, waveHeightM: 0.3, windSpeedKmh: 8, rainfallMm: 0, currentVelocityMs: 0.1 },
  storm: { waveHeightM: 2.5, windSpeedKmh: 50, rainfallMm: 30 },
  rain: { rainfallMm: 60, salinityPsu: 30 },
};

export default function WhatIfControls({ values, onChange, disabled, missing = [] }) {
  const { t } = useI18n();
  const set = (f, raw) => {
    if (raw === '' || Number.isNaN(Number(raw))) return;
    onChange({ ...values, [f.key]: Number(clamp(Number(raw), f).toFixed(2)) });
  };
  return (
    <div className="space-y-4">
      {SIM_FIELDS.map((f) => {
        const id = `whatif-${f.key}`;
        const v = values[f.key];
        return (
          <div key={f.key}>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={id} className="text-sm font-medium text-slate-700">
                {t(`tools.whatIf.fields.${f.key}`)}
                {missing.includes(f.key) && <span className="block text-xs font-normal text-slate-500">{t('tools.whatIf.noFieldReading')}</span>}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id={id}
                  type="number"
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm tabular-nums focus:border-ocean-500 focus:outline-none focus:ring-2 focus:ring-ocean-200"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={v}
                  disabled={disabled}
                  onChange={(e) => set(f, e.target.value)}
                />
                <span className="w-10 text-xs text-slate-500">{f.unit}</span>
              </div>
            </div>
            <input
              type="range"
              aria-label={`${t(`tools.whatIf.fields.${f.key}`)} (slider)`}
              className="mt-1 w-full accent-ocean-700"
              min={f.min}
              max={f.max}
              step={f.step}
              value={v}
              disabled={disabled}
              onChange={(e) => set(f, e.target.value)}
            />
            <div className="flex justify-between text-[11px] text-slate-400"><span>{f.signed && f.min > 0 ? '+' : ''}{f.min}</span><span>{f.signed ? '+' : ''}{f.max}</span></div>
          </div>
        );
      })}
    </div>
  );
}
