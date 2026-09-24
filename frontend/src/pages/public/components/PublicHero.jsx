/** Dark ocean header band used by the public content pages. */
export default function PublicHero({ eyebrow, title, subtitle, children }) {
  return (
    <section className="bg-ocean-900 text-white">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-sm font-bold uppercase tracking-wider text-teal-300">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-3xl text-lg leading-relaxed text-ocean-100">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}
