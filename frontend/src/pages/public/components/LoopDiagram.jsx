import { useI18n } from '../../../i18n/I18nProvider.jsx';

/**
 * Monitor → Predict → Act → Learn loop as an inline SVG.
 * Four nodes on a circle joined by arrowed arcs; the centre holds the product promise.
 */
export function LoopDiagram() {
  const { t } = useI18n();
  const nodes = [
    { key: 'monitor', x: 160, y: 40, color: '#1f8daa' },
    { key: 'predict', x: 280, y: 160, color: '#ea580c' },
    { key: 'act', x: 160, y: 280, color: '#177f56' },
    { key: 'learn', x: 40, y: 160, color: '#0b4f6c' },
  ];
  // Quarter arcs between the nodes (radius 120 around the centre 160,160), trimmed so they do not overlap the node circles.
  const arcs = [
    'M 196 46 A 120 120 0 0 1 274 124',
    'M 274 196 A 120 120 0 0 1 196 274',
    'M 124 274 A 120 120 0 0 1 46 196',
    'M 46 124 A 120 120 0 0 1 124 46',
  ];
  return (
    <svg viewBox="0 0 320 320" className="h-auto w-full max-w-xs" role="img" aria-label={t('public.loop.aria')}>
      <defs>
        <marker id="loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#78cadd" />
        </marker>
      </defs>
      <circle cx="160" cy="160" r="120" fill="none" stroke="#d5eef5" strokeWidth="18" />
      {arcs.map((d) => <path key={d} d={d} fill="none" stroke="#78cadd" strokeWidth="3" markerEnd="url(#loop-arrow)" />)}
      <text x="160" y="152" textAnchor="middle" className="fill-ocean-900" fontSize="15" fontWeight="700">{t('public.loop.centre1')}</text>
      <text x="160" y="172" textAnchor="middle" className="fill-slate-500" fontSize="11">{t('public.loop.centre2')}</text>
      {nodes.map((n) => (
        <g key={n.key}>
          <circle cx={n.x} cy={n.y} r="34" fill={n.color} />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fill="#fff" fontSize="11.5" fontWeight="700">{t(`public.loop.${n.key}`)}</text>
        </g>
      ))}
    </svg>
  );
}

/** The full data loop as a responsive chip flow (wraps on small screens, arrows rotate). */
export function PipelineFlow() {
  const { t } = useI18n();
  const inputs = ['farmData', 'environment', 'observations'];
  const steps = ['aiRisk', 'validatedAction', 'farmerResponse', 'outcome', 'learningData'];
  const Arrow = () => <span aria-hidden className="text-lg font-bold text-ocean-400 max-md:rotate-90 md:mx-1">→</span>;
  return (
    <div className="flex flex-col items-center gap-2 md:flex-row md:flex-wrap md:justify-center">
      <div className="flex flex-col gap-1.5 rounded-xl border border-ocean-200 bg-white p-2.5">
        {inputs.map((k, i) => (
          <div key={k} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-xs font-bold text-ocean-500" aria-hidden>+</span>}
            <span className="rounded-lg bg-ocean-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ocean-800">{t(`public.flow.${k}`)}</span>
          </div>
        ))}
      </div>
      {steps.map((k, i) => (
        <div key={k} className="flex flex-col items-center gap-2 md:flex-row">
          <Arrow />
          <span className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide ${i === 0 ? 'bg-orange-50 text-orange-800 ring-1 ring-orange-200' : i === 1 ? 'bg-seaweed-50 text-seaweed-700 ring-1 ring-seaweed-100' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
            {t(`public.flow.${k}`)}
          </span>
        </div>
      ))}
      <p className="mt-1 w-full text-center text-xs text-slate-500 md:mt-3">↺ {t('public.flow.loopNote')}</p>
    </div>
  );
}
