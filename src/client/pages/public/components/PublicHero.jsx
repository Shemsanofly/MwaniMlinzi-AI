import Waves from './Waves.jsx';

/** Dark ocean header band used by the public content pages. */
export default function PublicHero({ eyebrow, title, subtitle, children, wide = false }) {
  return (
    <section className="ocean-band relative overflow-hidden text-white">
      <div className={`relative mx-auto px-4 pb-24 pt-14 sm:px-6 sm:pb-28 sm:pt-20 ${wide ? 'max-w-6xl' : 'max-w-5xl'}`}>
        <p className="inline-flex animate-rise items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-lagoon-300">
          <span className="h-px w-6 bg-lagoon-300/70" aria-hidden />{eyebrow}
        </p>
        <h1 className="display mt-4 max-w-3xl animate-rise text-4xl font-medium leading-[1.08] [animation-delay:80ms] sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-5 max-w-2xl animate-rise text-lg leading-relaxed text-ocean-100/90 [animation-delay:160ms]">{subtitle}</p>}
        {children}
      </div>
      <Waves />
    </section>
  );
}
