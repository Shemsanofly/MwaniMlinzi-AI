import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Server mode resolution (ruling R20).
 *
 * `next build` inlines `process.env.NODE_ENV` into the server bundle and `next start` forces it to
 * 'production' at runtime, so the plain value no longer reflects the root `.env` the way it did under
 * the old `node src/server.js` + dotenv runner. Order:
 *   1. runtime NODE_ENV === 'test'  → 'test' (the test runners set it explicitly)
 *   2. NODE_ENV defined in the root `.env` file → that value
 *   3. runtime NODE_ENV, defaulting to 'development'
 */
export function resolveNodeEnv({ runtime, fileValue } = {}) {
  if (runtime === 'test') return 'test';
  if (fileValue) return fileValue;
  return runtime || 'development';
}

/** NODE_ENV as written in a dotenv file, or undefined when the file or the key is missing. */
export function readEnvFileNodeEnv(file = path.join(process.cwd(), '.env')) {
  try {
    return dotenv.parse(fs.readFileSync(file)).NODE_ENV?.trim() || undefined;
  } catch {
    return undefined;
  }
}

// Computed key: the bundler only inlines the literal `process.env.NODE_ENV` member expression.
const NODE_ENV_KEY = ['NODE', 'ENV'].join('_');

/** The live runtime NODE_ENV, read in a way Next/Turbopack cannot replace at build time. */
export function runtimeNodeEnv(source = process.env) {
  return source[NODE_ENV_KEY];
}
