/** Runs once when the Next.js server starts (not in the browser, not during `next build`). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    await import('./instrumentation-node.js');
  }
}
