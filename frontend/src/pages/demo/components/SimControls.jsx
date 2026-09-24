import { useI18n } from '../../../i18n/I18nProvider.jsx';

/** Simulation inputs: backend override key, range and step. Ranges stay inside the backend simulationSchema. */
export const SIM_FIELDS = [
  { key: 'sstAnomalyC', envKey: 'sstAnomalyC', min: -2, max: 4, step: 0.1, unit: '°C', signed: true },
  { key: 'sstAnomalyDays', envKey: 'sstAnomalyDays', min: 0, max: 14, step: 1, unit: 'd', int: true },
  { key: 'waveHeightM', envKey: 'waveHeightM', min: 0, max: 4, step: 0.1, unit: 'm' },
  { key: 'windSpeedKmh', envKey: 'windSpeedKmh', min: 0, max: 80, step: 1, unit: 'km/h' },
  { key: 'rainfallMm', envKey: 'rainfallMm', min: 0, max: 100, step: 1, unit: 'mm' },
  { key: 'currentVelocityMs', envKey: 'currentVelocityMs', min: 0, max: 2, step: 0.05, unit: 'm/s' },
  { key: 'salinityPsu', envKey: 'salinityPsu', min: 20, max: 40, step: 0.5, unit: 'PSU' },
];

const clamp = (v, f) => Math.min(f.max, Math.max(f.min, v));
const round = (v, f) => (f.int ? Math.round(v) : Math.round(v / f.step) * f.step);

/** Initial slider values taken from the farm's current environment (clamped to the slider range). */
export function valuesFromEnv(env) {
  return Object.fromEntries(SIM_FIELDS.map((f) => {
    const raw = Number(env?.[f.envKey]);
    const v = Number.isFinite(raw) ? raw : f.min;
    return [f.key, Number(round(clamp(v, f), f).toFixed(2))];
  }));
}

export const PRESETS = {
  heatwave: { sstAnomalyC: 2, sstAnomalyDays: 8, waveHeightM: 0.3, windSpeedKmh: 8, rainfallMm: 0, currentVelocityMs: 0.1 },
  storm: { waveHeightM: 2.5, windSpeedKmh: 50, rainfallMm: 30 },
  rain: { rainfallMm: 60, salinityPsu: 30 },
};

export default function SimControls({ values, onChange, disabled }) {
  const { t } = useI18n();
  const set = (f, raw) => {
    if (raw === '' || Number.isNaN(Number(raw))) return;
    onChange({ ...values, [f.key]: Number(clamp(Number(raw), f).toFixed(2)) });
  };
  return (
    <div className="space-y-4">
      {SIM_FIELDS.map((f) => {
        const id = `sim-${f.key}`;
        const v = values[f.key];
        return (
          <div key={f.key}>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={id} className="text-sm font-medium text-slate-700">{t(`demo.sim.fields.${f.key}`)}</label>
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
              aria-label={`${t(`demo.sim.fields.${f.key}`)} (slider)`}
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
