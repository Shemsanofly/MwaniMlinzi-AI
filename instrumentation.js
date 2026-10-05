/** Runs once when the Next.js server starts (not in the browser, not during `next build`). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  const { boot } = await import('./src/server/boot.js');
  const state = await boot();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await state.shutdown(signal); process.exit(0); });
  }
}
