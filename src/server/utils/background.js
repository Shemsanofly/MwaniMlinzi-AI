/**
 * Fire-and-forget work (SMS sends, risk re-runs after a callback has been answered).
 * Errors are logged, never thrown. Tests call flushBackground() to wait for everything started so far.
 */
const pending = new Set();

export function runInBackground(promiseOrFn, label = 'task') {
  const p = Promise.resolve()
    .then(() => (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn))
    .catch((err) => console.warn(`[background:${label}] failed:`, err.message))
    .finally(() => pending.delete(p));
  pending.add(p);
  return p;
}

export async function flushBackground() {
  while (pending.size) await Promise.all([...pending]);
}
