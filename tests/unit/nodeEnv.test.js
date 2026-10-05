import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveNodeEnv, readEnvFileNodeEnv, runtimeNodeEnv } from '../../src/server/config/nodeEnv.js';

// Ruling R20: `next build` inlines process.env.NODE_ENV and `next start` forces it to 'production',
// so the root .env (as under the old `node src/server.js` + dotenv runner) decides the server mode.
describe('resolveNodeEnv (R20)', () => {
  test('a runtime NODE_ENV of test always wins', () => {
    expect(resolveNodeEnv({ runtime: 'test', fileValue: 'development' })).toBe('test');
    expect(resolveNodeEnv({ runtime: 'test', fileValue: 'production' })).toBe('test');
    expect(resolveNodeEnv({ runtime: 'test' })).toBe('test');
  });

  test('the .env value beats the runtime value set by next start / next dev', () => {
    expect(resolveNodeEnv({ runtime: 'production', fileValue: 'development' })).toBe('development');
    expect(resolveNodeEnv({ runtime: 'development', fileValue: 'production' })).toBe('production');
    expect(resolveNodeEnv({ runtime: undefined, fileValue: 'production' })).toBe('production');
  });

  test('without a .env value the runtime value is used, defaulting to development', () => {
    expect(resolveNodeEnv({ runtime: 'production', fileValue: undefined })).toBe('production');
    expect(resolveNodeEnv({ runtime: 'production', fileValue: '' })).toBe('production');
    expect(resolveNodeEnv({ runtime: undefined, fileValue: undefined })).toBe('development');
    expect(resolveNodeEnv({ runtime: '', fileValue: '' })).toBe('development');
    expect(resolveNodeEnv()).toBe('development');
  });
});

describe('readEnvFileNodeEnv', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwani-nodeenv-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('reads NODE_ENV from a dotenv file', () => {
    const file = path.join(dir, 'with.env');
    fs.writeFileSync(file, 'PORT=5000\r\nNODE_ENV=development\r\nJWT_SECRET=x\r\n');
    expect(readEnvFileNodeEnv(file)).toBe('development');
  });

  test('returns undefined when the file has no NODE_ENV or does not exist', () => {
    const file = path.join(dir, 'without.env');
    fs.writeFileSync(file, 'PORT=5000\n');
    expect(readEnvFileNodeEnv(file)).toBeUndefined();
    expect(readEnvFileNodeEnv(path.join(dir, 'missing.env'))).toBeUndefined();
  });
});

describe('runtimeNodeEnv', () => {
  test('reads NODE_ENV from the given environment object', () => {
    expect(runtimeNodeEnv({ NODE_ENV: 'production' })).toBe('production');
    expect(runtimeNodeEnv({})).toBeUndefined();
  });

  test('reads the live process environment by default', () => {
    expect(runtimeNodeEnv()).toBe('test');
  });
});

describe('env.js uses the resolved value', () => {
  test('env.nodeEnv is test under the test runner', async () => {
    const { env } = await import('../../src/server/config/env.js');
    expect(env.nodeEnv).toBe('test');
    expect(env.isTest).toBe(true);
    expect(env.isProduction).toBe(false);
  });
});
