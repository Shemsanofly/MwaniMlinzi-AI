import { isAllowedOrigin } from '../../src/server/config/cors.js';

const config = { corsOrigins: ['https://app.example.org'], nodeEnv: 'development' };

describe('browser API origins', () => {
  test.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5174', 'http://localhost:4173'])(
    'accepts local development origin %s', (origin) => {
      expect(isAllowedOrigin(origin, config)).toBe(true);
      expect(isAllowedOrigin(origin, { ...config, nodeEnv: 'production' })).toBe(false);
    },
  );

  test.each(['https://app.example.org', undefined])('accepts configured origins and non-browser requests', (origin) => {
    expect(isAllowedOrigin(origin, config)).toBe(true);
    expect(isAllowedOrigin(origin, { ...config, nodeEnv: 'production' })).toBe(true);
  });

  test.each(['https://untrusted.example', 'http://localhost.evil.example:5173', 'http://127.0.0.1:5173/path', 'null', 'invalid'])(
    'rejects unconfigured or malformed origin %s', (origin) => {
      expect(isAllowedOrigin(origin, config)).toBe(false);
    },
  );
});
