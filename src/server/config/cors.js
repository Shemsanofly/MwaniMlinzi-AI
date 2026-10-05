/** Keep deployed origins explicit; allow local browser origins during development. */
export function isAllowedOrigin(origin, { corsOrigins, nodeEnv }) {
  if (!origin || corsOrigins.includes(origin)) return true;
  if (nodeEnv !== 'development') return false;
  try {
    const url = new URL(origin);
    return url.origin === origin
      && ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}
