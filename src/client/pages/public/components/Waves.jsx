/**
 * Layered, slowly moving waves at the foot of a dark band. Each layer is a tile repeated twice and
 * translated by half its width, so the loop is seamless. `fill` should match the section below.
 */
const PATHS = [
  'M0 38 C 120 18 240 18 360 38 S 600 58 720 38 V80 H0 Z',
  'M0 46 C 150 28 210 30 360 46 S 570 62 720 46 V80 H0 Z',
  'M0 54 C 90 42 270 42 360 54 S 630 66 720 54 V80 H0 Z',
];

export default function Waves({ fill = 'var(--color-sand-50)', className = '' }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 overflow-hidden sm:h-20 ${className}`} aria-hidden>
      {PATHS.map((d, i) => (
        <svg
          key={d}
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0 h-full w-[200%]"
          style={{ animation: `wave-x ${[22, 16, 11][i]}s linear infinite${i === 1 ? ' reverse' : ''}`, opacity: [0.18, 0.35, 1][i] }}
        >
          <path d={d} fill={i === 2 ? fill : 'var(--color-lagoon-300)'} />
          <path d={d} transform="translate(720 0)" fill={i === 2 ? fill : 'var(--color-lagoon-300)'} />
        </svg>
      ))}
    </div>
  );
}
