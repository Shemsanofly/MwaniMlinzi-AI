/** fetch with timeout; throws on non-2xx so providers can fall back. */
export async function fetchJson(url, { timeoutMs = 8000, ...init } = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}: ${body.slice(0, 200)}`);
  }
  return res.json();
}
