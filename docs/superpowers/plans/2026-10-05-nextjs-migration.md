# Next.js Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Vite SPA (`frontend/`) and the Express API (`backend/`) into one native Next.js 16 App Router application with identical behaviour, still on PostgreSQL via Prisma.

**Architecture:** Server code moves to `src/server/` unchanged in logic. Every Express route becomes a Next Route Handler file under `app/api/**/route.js`, generated from one auditable route table (`src/server/http/routeTable.js`) whose entries mirror the old Express routers one-for-one. A small HTTP core (`defineRoute`) reproduces the Express pipeline: body parsing, rate limits, auth, validation, errors, CORS, security headers and logging. Controllers keep their `(req, res)` signature: `req` is a request-shaped context and `res` is a recording responder converted into a Web `Response`. Client code moves to `src/client/`. React Router is replaced by a thin adapter over `next/navigation`/`next/link` with the same API, so page components barely change. App Router layouts and pages wrap the existing components.

**Tech Stack:** Next.js 16 (App Router, Route Handlers, `instrumentation.js`), React 19, Prisma 6 + PostgreSQL, zod, node-cron, TanStack Query, Tailwind v4 (`@tailwindcss/postcss`), Leaflet (client-only via `next/dynamic`), Jest 29 (server), Vitest 5 (client), `node:test` (scripts).

**Spec:** `docs/superpowers/specs/2026-10-05-nextjs-migration-design.md`

## Global Constraints

- No hosting/deployment work: no PM2/Nginx/Vercel config and no `docs/DEPLOYMENT.md` edits (owner instruction, 2026-10-05).
- No Prisma schema or migration changes. Same `DATABASE_URL`, same seed.
- Every page URL and API path stays the same, including `/api/ussd/MwaniMlinzi`, `/api/integrations/africastalking/{ussd,sms,sms/delivery}`, `/api/integrations/sarufi/webhook`, `/api/docs`, `/api/docs.json` and `/api/health`.
- API bodies keep their shape: `{ success: true, data, message }` / `{ success: false, error: { code, message, details? } }`. USSD/SMS callbacks reply `text/plain`.
- Rate limits stay as they are: api 15 min/1500, auth 15 min/30, ai 1 min/30, location 1 min/20, integration 1 min/300 (429 body `END Too many requests. Please try again later.`). Every limit is 100000 when `NODE_ENV=test`.
- Body limits: JSON 200kb, urlencoded 50kb. Upload: one file, field `image`, jpeg/png/webp, `MAX_UPLOAD_MB` (default 5).
- Env var names are unchanged except `VITE_API_URL` → `NEXT_PUBLIC_API_URL` (default `/api`). `VITE_PROXY_TARGET` is removed (same origin now).
- Dev server default port: **5173** (the URL the team already uses). `PORT`/`MWANI_PORT` override it.
- Jobs: same schedules, `Africa/Dar_es_Salaam`, `ENABLE_JOBS` switch, never in tests or during `next build`.
- Offline cache: localStorage key `mwanimlinzi.cache`, `buster: 'v2'`, same `OFFLINE_KEYS`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Refinements vs. spec (call out in review)

1. Controllers are **not** rewritten to `ctx => Response`. They keep `(req, res)`: `req` is the ctx (it has every field they use) and `res` is a recording responder. This needs zero business-logic edits and is the lowest-risk way to keep behaviour identical.
2. Helmet-equivalent security headers are added by `defineRoute` on every API response (testable) rather than via `next.config` headers. Pages never had helmet (they were static hosting). `/api/docs` serves swagger-ui assets from `swagger-ui-dist` locally, as swagger-ui-express did, so the CSP stays `'self'`.
3. Source folders are moved with `git mv` in Task 1 (history kept; tag `pre-nextjs-migration` marks the old state). Leftover config in `frontend/` and `backend/` is removed in Task 8 after the gate.
4. The integration-test helper resolves URLs through the route table and then imports the matching `app/api/**/route.js` file. A separate test asserts the table and the files match one-to-one.
5. The client tree renders only after mount (`ClientOnly` in providers), exactly like today's empty `<div id="root">`. This keeps localStorage auth and offline cache identical and avoids hydration mismatches.

## Review Focus

1. **Unknown or wrong-method API paths.** Express answered unauthenticated unknown `/api/*` paths with 401 (the global `authenticate` ran first), `/api/admin/*` unknown paths for non-admins with 403, and everything else with 404 `Route METHOD /api/x not found`. The catch-all and method fallbacks must match → tests in Task 3 Step 1.
2. **Africa's Talking form posts.** These are `application/x-www-form-urlencoded` bodies with `?secret=` and come back `text/plain`. Also the sandbox alias `/api/ussd/MwaniMlinzi`, which depends on `req.path` being the full pathname → existing `channels.test.js` plus a `req.path` unit test in Task 2.
3. **Malformed or oversize bodies.** Non-object JSON or broken JSON → 400 `Malformed JSON body`. A body over 200kb → 413 `PAYLOAD_TOO_LARGE`. A missing content type → `req.body` undefined → tests in Task 2 Step 5.
4. **Photo upload/download.** Wrong mime is silently dropped (→ "No image uploaded"). Oversize → 400 `UPLOAD_ERROR` `File is too large`. Two files → 400 `UPLOAD_ERROR`. `GET /api/uploads/:id` with the file missing on disk → 404 JSON `File missing` → tests in Task 2 Step 7 and Task 3.
5. **Deep links and reloads in the browser.** Opening `/admin/farms/<id>`, `/farmer/history?…`, `/reset-password?token=…` directly, while logged out and logged in. Logged out must go to `/login` and come back to the same URL after login (navigation `state.from`) → adapter tests in Task 5 and the smoke run in Task 8.

---

## File Structure

```
MwaniMlinzi-AI/
├── app/
│   ├── layout.jsx                     root html/body, metadata, global CSS, <Providers>
│   ├── providers.jsx                  'use client' QueryClient+persister, I18nProvider, AuthProvider, ClientOnly
│   ├── not-found.jsx                  NotFound inside PublicLayout
│   ├── (public)/layout.jsx + 8 pages
│   ├── app/page.jsx                   HomeRedirect
│   ├── farmer/layout.jsx + 11 pages   (/farmer redirect + 10)
│   ├── (admin)/layout.jsx + admin/** (17 incl. /admin redirect) + tools/scenarios
│   ├── account/layout.jsx + 2 pages
│   └── api/
│       ├── route.js                   GET /api banner
│       ├── [...notFound]/route.js     Express-equivalent 404/401/403
│       ├── docs/route.js, docs/[asset]/route.js, docs.json/route.js
│       └── …/route.js                 generated, one per path pattern
├── src/
│   ├── client/                        (was frontend/src) + navigation.jsx + client/test/*
│   └── server/                        (was backend/src)
│       ├── http/                      context.js responder.js body.js rateLimit.js errors.js
│       │                              headers.js log.js defineRoute.js routeTable.js
│       ├── middleware/                auth.js validate.js upload.js  (ctx steps; errorHandler.js & rateLimit.js removed)
│       └── boot.js                    startup (was server.js)
├── prisma/  tests/  public/  uploads/  ai/  docs/
├── scripts/                           dev.mjs dev-service.mjs app-status.mjs always-on.mjs gen-api-routes.mjs
│                                      + former backend/scripts/*.js
├── instrumentation.js  next.config.mjs  postcss.config.mjs  vitest.config.mjs  eslint.config.js
├── jsconfig.json  .env.example  package.json
```

---

### Task 1: Single source tree (still running on Express + Vite)

Move the code into the final layout and merge the packages. Do not change behaviour yet. The deliverable is that every existing server and client test passes from the repo root.

**Files:**
- Move: `backend/src` → `src/server`, `backend/tests` → `tests`, `backend/prisma` → `prisma`, `backend/scripts/*.js` → `scripts/`, `frontend/src` → `src/client`, `frontend/public` → `public`, `backend/uploads/.gitkeep` → `uploads/.gitkeep`
- Create: `scripts/migrate/rewrite-imports.mjs` (temporary; deleted in Task 8), `package.json` (replace), `eslint.config.js`, `vitest.config.mjs`, `.env.example`, `jsconfig.json`
- Modify: `src/server/config/env.js`, `src/server/ai/paths.js`, `src/server/server.js:11`, `.gitignore`, `ai/scripts/trainModel.js` (imports), files with `backend/.env` text
- Delete: `backend/package.json`, `backend/package-lock.json`, `frontend/package.json`, `frontend/package-lock.json`, `backend/eslint.config.js`, `frontend/eslint.config.js`, `frontend/vite.config.js`

**Interfaces:**
- Produces: final paths used by every later task: `src/server/**`, `src/client/**`, `tests/**`, `prisma/**`. Root `package.json` scripts `test:server`, `test:client`, `test:scripts`, `test`, `lint`.

- [ ] **Step 1: Tag the pre-migration state and create the tree**

```bash
git tag pre-nextjs-migration
mkdir -p src scripts/migrate uploads
git mv backend/src src/server
git mv backend/tests tests
git mv backend/prisma prisma
for f in backend/scripts/*.js; do git mv "$f" scripts/; done
git mv frontend/src src/client
git mv frontend/public public
git mv backend/uploads/.gitkeep uploads/.gitkeep 2>/dev/null || touch uploads/.gitkeep
# untracked local data (ignored by git) moves too
[ -d backend/uploads ] && cp -r backend/uploads/. uploads/ && rm -rf backend/uploads
[ -d backend/backups ] && mv backend/backups backups
for f in backend/*.local.txt; do [ -f "$f" ] && mv "$f" .; done
```

- [ ] **Step 2: Write the import rewriter**

`scripts/migrate/rewrite-imports.mjs` rewrites relative import specifiers in files that moved *relative to their targets* (tests, prisma, scripts, ai) so they point at the new locations:

```js
// Temporary migration helper: rewrite relative imports after the folder move. Deleted in Task 8.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
// old dir (relative to root) → new dir
const MOVES = [
  ['backend/src', 'src/server'],
  ['backend/tests', 'tests'],
  ['backend/prisma', 'prisma'],
  ['backend/scripts', 'scripts'],
  ['frontend/src', 'src/client'],
];
const toNew = (oldAbs) => {
  const rel = path.relative(root, oldAbs).split(path.sep).join('/');
  for (const [from, to] of MOVES) if (rel === from || rel.startsWith(`${from}/`)) return path.join(root, to + rel.slice(from.length));
  return oldAbs;
};
const toOld = (newAbs) => {
  const rel = path.relative(root, newAbs).split(path.sep).join('/');
  for (const [from, to] of MOVES) if (rel === to || rel.startsWith(`${to}/`)) return path.join(root, from + rel.slice(to.length));
  return newAbs;
};
const SPEC = /((?:import|export)\s[^'"]*?from\s*|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"]+)\2/g;

function rewrite(file, source) {
  const oldFile = toOld(file);
  return source.replace(SPEC, (all, head, q, spec) => {
    const target = toNew(path.resolve(path.dirname(oldFile), spec));
    let next = path.relative(path.dirname(file), target).split(path.sep).join('/');
    if (!next.startsWith('.')) next = `./${next}`;
    return `${head}${q}${next}${q}`;
  });
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = path.join(dir, d.name);
  if (d.name === 'node_modules') return [];
  return d.isDirectory() ? walk(p) : /\.(m?js|jsx)$/.test(d.name) ? [p] : [];
});

// Arguments are moved folders or moved files. Never pass the root scripts/ folder: dev.mjs etc. did not move.
let changed = 0;
const targets = process.argv.slice(2).map((p) => path.join(root, p));
for (const file of targets.flatMap((p) => (fs.statSync(p).isDirectory() ? walk(p) : [p]))) {
  const before = fs.readFileSync(file, 'utf8');
  const after = rewrite(file, before);
  if (after !== before) { fs.writeFileSync(file, after); changed += 1; }
}
console.log(`[rewrite-imports] updated ${changed} files`);
```

- [ ] **Step 3: Run it on the cross-boundary folders and check the result**

```bash
node scripts/migrate/rewrite-imports.mjs tests prisma ai scripts/at-sms-diagnose.js scripts/backup-database.js scripts/email-verify.js scripts/install-damage-inspection-action.js scripts/verify-table-consolidation.js
git grep -n "backend/src\|frontend/src" -- '*.js' '*.mjs' '*.jsx'
```

Expected: `[rewrite-imports] updated N files` (N ≥ 20). The grep prints only `scripts/dev.mjs`, `scripts/always-on.mjs` and `scripts/tests/dev.test.mjs` (rewritten in Task 7). `ai/scripts/trainModel.js` must now import `../../src/server/...`; if it still says `backend/src`, edit those 6 imports by hand.

Intra-folder imports (`src/server/**` → `src/server/**`, `src/client/**` → `src/client/**`) are unchanged because whole folders moved together.

- [ ] **Step 4: Fix code that resolves paths from its own file location**

`src/server/config/env.js` line 4. Next bundles server code, so `import.meta.url` is not the source path. Both Next and Jest run with `cwd` = repo root:

```js
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
```

and its error message:

```js
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and set a long random JWT_SECRET.');
```

`src/server/ai/paths.js`:

```js
import path from 'node:path';

/** Repository root (…/MwaniMlinzi-AI). Next.js, Jest and the scripts all run from the repo root. */
export const REPO_ROOT = process.env.MWANI_REPO_ROOT ? path.resolve(process.env.MWANI_REPO_ROOT) : process.cwd();
```

(the rest of the file is unchanged; remove the `fileURLToPath` import and `here`).

`src/server/server.js` line 11 (this file is replaced in Task 4, but keep it working now):

```js
  const dir = path.join(process.cwd(), 'prisma', 'migrations');
```

Then update user-facing text that names the old folders:

```bash
git grep -n "backend/\.env\|backend/\.env\.example\|frontend/\.env\|cd backend" -- src tests scripts prisma
```

Replace `backend/.env` → `.env`, `backend/.env.example` → `.env.example`, `cd backend && ` → `` in each hit (including `src/client/utils/phone.js`, `src/server/controllers/adminController.js`, `src/server/providers/africastalking/smsClient.js`, and the assertion in `src/client/pages/admin/__tests__/Settings.test.jsx`, which must match the new text).

- [ ] **Step 5: Merge the packages**

Delete `backend/package.json`, `backend/package-lock.json`, `frontend/package.json`, `frontend/package-lock.json`. Replace the root `package.json` with:

```json
{
  "name": "mwanimlinzi-ai",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "MwaniMlinzi AI - seaweed risk, harvest and decision-support (Next.js)",
  "engines": { "node": ">=20.9.0" },
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "test": "npm run test:server && npm run test:client && npm run test:scripts",
    "test:server": "node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand",
    "test:client": "vitest run",
    "test:scripts": "node --test --test-concurrency=1 scripts/tests/*.test.mjs",
    "test:dev": "node --test scripts/tests/dev.test.mjs",
    "test:always-on": "node --test scripts/tests/always-on.test.mjs",
    "lint": "eslint src tests prisma/seed.js prisma/data scripts",
    "seed": "node prisma/seed.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio",
    "ai:train": "node ai/scripts/trainModel.js",
    "at:diagnose": "node scripts/at-sms-diagnose.js",
    "email:verify": "node scripts/email-verify.js",
    "start:local": "node scripts/always-on.mjs",
    "stop:local": "node scripts/always-on.mjs --stop",
    "autostart:install": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart.ps1",
    "autostart:remove": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart.ps1 -Remove"
  },
  "prisma": { "seed": "node prisma/seed.js" },
  "dependencies": {
    "@fontsource-variable/fraunces": "^5.3.0",
    "@fontsource-variable/manrope": "^5.3.0",
    "@prisma/client": "^6.19.3",
    "@tanstack/query-sync-storage-persister": "^5.103.2",
    "@tanstack/react-query": "^5.103.2",
    "@tanstack/react-query-persist-client": "^5.103.2",
    "axios": "^1.20.0",
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.6",
    "dotenv": "^18.0.3",
    "express": "^5.2.1",
    "express-rate-limit": "^8.7.0",
    "helmet": "^8.3.0",
    "i18next": "^26.4.2",
    "jsonwebtoken": "^9.0.3",
    "leaflet": "^1.9.4",
    "lucide-react": "^1.47.0",
    "morgan": "^1.12.1",
    "multer": "^2.4.0",
    "node-cron": "^4.6.0",
    "nodemailer": "^10.0.14",
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "react-i18next": "^17.0.15",
    "react-leaflet": "^5.0.0",
    "react-router-dom": "^7.18.4",
    "recharts": "^3.10.1",
    "swagger-ui-express": "^5.0.1",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.5",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/user-event": "^14.6.7",
    "@vitejs/plugin-react": "^6.1.1",
    "eslint": "^9.39.5",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^7.1.1",
    "globals": "^17.12.0",
    "jest": "^29.7.0",
    "jsdom": "^30.1.1",
    "prisma": "^6.19.3",
    "supertest": "^7.3.0",
    "vite": "^8.3.0",
    "vitest": "^5.0.1"
  },
  "jest": {
    "testEnvironment": "node",
    "transform": {},
    "roots": ["<rootDir>/tests"],
    "globalSetup": "<rootDir>/tests/globalSetup.js",
    "globalTeardown": "<rootDir>/tests/globalTeardown.js",
    "setupFiles": ["<rootDir>/tests/setupEnv.js"],
    "testTimeout": 30000
  }
}
```

Express, multer, helmet, cors, morgan, express-rate-limit, swagger-ui-express and supertest leave in Task 3. react-router-dom leaves in Task 6.

- [ ] **Step 6: Root configs**

`vitest.config.mjs`:

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Keep Windows test workers within the available memory during local development.
    maxWorkers: 1,
    environment: 'jsdom',
    globals: true,
    include: ['src/client/**/*.test.{js,jsx}'],
    setupFiles: './src/client/test/setup.js',
    css: false,
  },
});
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

const unused = ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', ignoreRestSiblings: true }];

export default [
  { ignores: ['.next/**', 'node_modules/**', 'frontend/**', 'backend/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }] },
  },
  {
    files: ['src/client/**/*.{js,jsx}', 'app/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node }, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': unused,
    },
  },
  { files: ['src/client/**/*.test.{js,jsx}', 'src/client/**/__tests__/**', 'src/client/test/**'], languageOptions: { globals: { ...globals.vitest } } },
  { files: ['tests/**'], languageOptions: { globals: { ...globals.jest } } },
];
```

`jsconfig.json` (editor path hints only; code keeps relative imports):

```json
{ "compilerOptions": { "baseUrl": ".", "jsx": "preserve" }, "exclude": ["node_modules", ".next"] }
```

`.env.example`: concatenate `backend/.env.example` and the frontend example into one file at the root. Delete the `VITE_PROXY_TARGET` line and rename `VITE_API_URL` to `NEXT_PUBLIC_API_URL` with the comment `# Browser API base; leave empty for same-origin /api`. Then `git rm backend/.env.example frontend/.env.example`.

Local secrets (untracked): `cp backend/.env .env` if the root `.env` does not exist. If `frontend/.env` sets `VITE_API_URL`, append `NEXT_PUBLIC_API_URL=<same value>` to `.env`.

`.gitignore`: replace `backend/uploads/*` / `!backend/uploads/.gitkeep` with `uploads/*` / `!uploads/.gitkeep`, replace `backend/backups/` with `backups/`, replace `frontend/.ui-audit/` with `.ui-audit/`, and add `.next/` and `next-env.d.ts`.

Delete `backend/eslint.config.js`, `frontend/eslint.config.js`, `frontend/vite.config.js`.

- [ ] **Step 7: Install and run every test suite**

```bash
rm -rf backend/node_modules frontend/node_modules
npm install
npx prisma generate
npm run test:server
npm run test:client
```

Expected: both PASS with the same test counts as before the move. Before Step 1, run `npm --prefix backend test` and `npm --prefix frontend test` once on the tag and note the numbers. If a server test fails with `ENOENT … prisma/migrations` or `.env`, re-check Step 4. If an import is unresolved, run `node scripts/migrate/rewrite-imports.mjs <dir>` for that folder.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move frontend and backend sources into a single tree

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: HTTP core (Express pipeline as Web Request → Response)

**Files:**
- Create: `src/server/http/context.js`, `src/server/http/responder.js`, `src/server/http/body.js`, `src/server/http/rateLimit.js`, `src/server/http/errors.js`, `src/server/http/headers.js`, `src/server/http/log.js`, `src/server/http/defineRoute.js`, `src/server/middleware/upload.js`
- Modify: `src/server/middleware/auth.js` (authenticate/authorize become ctx steps), `src/server/middleware/validate.js` (ctx step)
- Test: `tests/unit/http/context.test.js`, `responder.test.js`, `body.test.js`, `rateLimit.test.js`, `errors.test.js`, `defineRoute.test.js`, `upload.test.js`

**Interfaces:**
- Consumes: `AppError` etc. from `src/server/utils/errors.js`; `env` from `src/server/config/env.js`; `isAllowedOrigin` from `src/server/config/cors.js`; `loadUser` and `hasRole` from `src/server/middleware/auth.js`.
- Produces:
  - `createContext(request: Request, params: object) → ctx`. `ctx` has `{ request, method, path, originalUrl, params, query, headers, get(name), ip, body, valid, user, file, responseHeaders: Headers }`.
  - `createResponder() → res`, with `status`, `set`, `setHeader`, `type`, `json`, `send`, `sendFile` and `headersSent`; plus `toResponse(res) → Promise<Response>`.
  - `parseBody(ctx) → Promise<void>`, which throws `{ type: 'entity.parse.failed' | 'entity.too.large' }`.
  - `limiters = { api, auth, ai, location, integration }`. Each is a step `(ctx) → Response | undefined`.
  - `toErrorResponse(err, ctx) → Response`.
  - `applySecurityHeaders(headers)`, `corsHeaders(request) → Headers`, `preflight(request) → Response`.
  - `logRequest(ctx, response, startedMs)`.
  - `defineRoute(steps: Step[], controller: (req, res) => any) → (request, { params }) => Promise<Response>`.
  - Step type: `(ctx) => void | Response | Promise<void | Response>`. Returning a `Response` ends the pipeline.
  - `authenticate: Step`, `authorize(...roles): Step`, `validate(schema, part='body', { partial }): Step`, `uploadSingle(field): Step`.

- [ ] **Step 1: Write failing tests for context and responder**

`tests/unit/http/context.test.js`:

```js
import { createContext } from '../../../src/server/http/context.js';

describe('createContext', () => {
  test('exposes Express-like request fields', () => {
    const req = new Request('http://localhost/api/ussd/MwaniMlinzi?secret=a&tag=x&tag=y', {
      method: 'POST', headers: { 'X-Callback-Secret': 's', 'x-forwarded-for': '10.0.0.1, 41.2.3.4' },
    });
    const ctx = createContext(req, { id: '7' });
    expect(ctx.method).toBe('POST');
    expect(ctx.path).toBe('/api/ussd/MwaniMlinzi');
    expect(ctx.originalUrl).toBe('/api/ussd/MwaniMlinzi?secret=a&tag=x&tag=y');
    expect(ctx.query).toEqual({ secret: 'a', tag: ['x', 'y'] });
    expect(ctx.params).toEqual({ id: '7' });
    expect(ctx.get('x-callback-secret')).toBe('s');
    expect(ctx.get('missing')).toBeUndefined();
    expect(ctx.headers['x-callback-secret']).toBe('s');
    expect(ctx.ip).toBe('41.2.3.4'); // trust proxy 1 → last hop
    expect(ctx.body).toBeUndefined();
  });

  test('falls back to x-real-ip, then 127.0.0.1', () => {
    expect(createContext(new Request('http://l/api', { headers: { 'x-real-ip': '1.2.3.4' } }), {}).ip).toBe('1.2.3.4');
    expect(createContext(new Request('http://l/api'), {}).ip).toBe('127.0.0.1');
  });
});
```

`tests/unit/http/responder.test.js`:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createResponder, toResponse } from '../../../src/server/http/responder.js';

describe('responder', () => {
  test('status().json() → JSON Response', async () => {
    const res = createResponder();
    res.status(201).json({ success: true });
    const r = await toResponse(res);
    expect(r.status).toBe(201);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(await r.json()).toEqual({ success: true });
    expect(res.headersSent).toBe(true);
  });

  test('type(text/plain).send() → plain text', async () => {
    const res = createResponder();
    res.status(200).type('text/plain').send('CON Karibu');
    const r = await toResponse(res);
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await r.text()).toBe('CON Karibu');
  });

  test('sendFile streams the file with preset headers', async () => {
    const file = path.join(os.tmpdir(), `resp-${Date.now()}.png`);
    fs.writeFileSync(file, Buffer.from([1, 2, 3]));
    const res = createResponder();
    res.setHeader('Content-Type', 'image/png');
    res.sendFile(file, () => {});
    const r = await toResponse(res);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await r.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  test('sendFile on a missing file runs the callback, which may answer 404', async () => {
    const res = createResponder();
    res.sendFile('/no/such/file', (err) => { if (err && !res.headersSent) res.status(404).json({ success: false }); });
    const r = await toResponse(res);
    expect(r.status).toBe(404);
  });

  test('nothing sent → 500 INTERNAL_ERROR', async () => {
    const r = await toResponse(createResponder());
    expect(r.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npm run test:server -- tests/unit/http`
Expected: FAIL, `Cannot find module '../../../src/server/http/context.js'`.

- [ ] **Step 3: Implement context and responder**

`src/server/http/context.js`:

```js
/** Request-shaped context handed to steps and controllers as `req` (the fields controllers used on Express's req). */
export function parseQuery(searchParams) {
  const query = {};
  for (const [key, value] of searchParams) {
    if (!Object.hasOwn(query, key)) query[key] = value;
    else query[key] = [].concat(query[key], value); // Express 5 "simple" parser: repeated keys → array
  }
  return query;
}

/** Express `trust proxy 1`: the client is the last X-Forwarded-For hop. */
export function clientIp(headers) {
  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return headers.get('x-real-ip') || '127.0.0.1';
}

export function createContext(request, params = {}) {
  const url = new URL(request.url);
  const headers = Object.fromEntries([...request.headers].map(([k, v]) => [k.toLowerCase(), v]));
  return {
    request,
    method: request.method,
    path: url.pathname,
    originalUrl: `${url.pathname}${url.search}`,
    params,
    query: parseQuery(url.searchParams),
    headers,
    get: (name) => request.headers.get(name) ?? undefined,
    ip: clientIp(request.headers),
    body: undefined,
    valid: undefined,
    user: undefined,
    file: undefined,
    responseHeaders: new Headers(),
  };
}
```

`src/server/http/responder.js`:

```js
import fs from 'node:fs/promises';

const TYPES = { 'text/plain': 'text/plain; charset=utf-8', text: 'text/plain; charset=utf-8', json: 'application/json; charset=utf-8', html: 'text/html; charset=utf-8' };

/** An Express-`res`-shaped recorder. Controllers call it exactly as before; toResponse() turns it into a Web Response. */
export function createResponder() {
  const state = { status: 200, headers: new Headers(), body: null, file: null, sent: false };
  const res = {
    state,
    get headersSent() { return state.sent; },
    status(code) { state.status = code; return res; },
    setHeader(name, value) { state.headers.set(name, String(value)); return res; },
    set(name, value) {
      if (typeof name === 'object') for (const [k, v] of Object.entries(name)) state.headers.set(k, String(v));
      else state.headers.set(name, String(value));
      return res;
    },
    type(type) { state.headers.set('Content-Type', TYPES[type] || type); return res; },
    json(obj) {
      if (!state.headers.has('Content-Type')) state.headers.set('Content-Type', TYPES.json);
      state.body = JSON.stringify(obj);
      state.sent = true;
      return res;
    },
    send(body) {
      if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
      if (!state.headers.has('Content-Type')) state.headers.set('Content-Type', TYPES.html);
      state.body = body ?? '';
      state.sent = true;
      return res;
    },
    sendFile(filePath, callback) { state.file = { filePath, callback }; return res; },
  };
  return res;
}

export async function toResponse(res) {
  const { state } = res;
  if (state.file) {
    const { filePath, callback } = state.file;
    state.file = null;
    try {
      const data = await fs.readFile(filePath);
      state.sent = true;
      return new Response(data, { status: state.status, headers: state.headers });
    } catch (err) {
      callback?.(err);
      if (!state.sent) return toResponse(res);
    }
  }
  if (!state.sent) {
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } }, { status: 500 });
  }
  return new Response(state.body, { status: state.status, headers: state.headers });
}
```

- [ ] **Step 4: Run the context/responder tests**

Run: `npm run test:server -- tests/unit/http/context.test.js tests/unit/http/responder.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Failing tests for body parsing and errors**

`tests/unit/http/body.test.js`:

```js
import { createContext } from '../../../src/server/http/context.js';
import { parseBody } from '../../../src/server/http/body.js';

const ctxFor = (body, type) => createContext(new Request('http://l/api/x', { method: 'POST', body, headers: type ? { 'content-type': type } : {} }), {});

describe('parseBody', () => {
  test('JSON object', async () => { const c = ctxFor('{"a":1}', 'application/json'); await parseBody(c); expect(c.body).toEqual({ a: 1 }); });
  test('JSON with charset', async () => { const c = ctxFor('[1]', 'application/json; charset=utf-8'); await parseBody(c); expect(c.body).toEqual([1]); });
  test('empty JSON body → {}', async () => { const c = ctxFor('', 'application/json'); await parseBody(c); expect(c.body).toEqual({}); });
  test('malformed JSON → entity.parse.failed', async () => { await expect(parseBody(ctxFor('{bad', 'application/json'))).rejects.toMatchObject({ type: 'entity.parse.failed' }); });
  test('non-object JSON (strict) → entity.parse.failed', async () => { await expect(parseBody(ctxFor('"x"', 'application/json'))).rejects.toMatchObject({ type: 'entity.parse.failed' }); });
  test('JSON over 200kb → entity.too.large', async () => {
    await expect(parseBody(ctxFor(JSON.stringify({ a: 'x'.repeat(205000) }), 'application/json'))).rejects.toMatchObject({ type: 'entity.too.large' });
  });
  test('urlencoded with repeated keys', async () => {
    const c = ctxFor('text=1*2&phoneNumber=%2B255&x=a&x=b', 'application/x-www-form-urlencoded');
    await parseBody(c);
    expect(c.body).toEqual({ text: '1*2', phoneNumber: '+255', x: ['a', 'b'] });
  });
  test('urlencoded over 50kb → entity.too.large', async () => {
    await expect(parseBody(ctxFor(`a=${'x'.repeat(52000)}`, 'application/x-www-form-urlencoded'))).rejects.toMatchObject({ type: 'entity.too.large' });
  });
  test('no content-type → body stays undefined', async () => { const c = ctxFor('hello'); await parseBody(c); expect(c.body).toBeUndefined(); });
  test('multipart is left for the upload step', async () => { const c = ctxFor('--x--', 'multipart/form-data; boundary=x'); await parseBody(c); expect(c.body).toBeUndefined(); });
  test('GET is not parsed', async () => { const c = createContext(new Request('http://l/api/x'), {}); await parseBody(c); expect(c.body).toBeUndefined(); });
});
```

`tests/unit/http/errors.test.js`:

```js
import { Prisma } from '@prisma/client';
import { toErrorResponse, UploadError } from '../../../src/server/http/errors.js';
import { badRequest } from '../../../src/server/utils/errors.js';
import { createContext } from '../../../src/server/http/context.js';

const ctx = createContext(new Request('http://l/api/x'), {});
const body = async (err) => { const r = toErrorResponse(err, ctx); return { status: r.status, json: await r.json() }; };

describe('toErrorResponse', () => {
  test('AppError with details', async () => {
    expect(await body(badRequest('Invalid input', [{ path: 'a', message: 'm' }]))).toEqual({ status: 400, json: { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: [{ path: 'a', message: 'm' }] } } });
  });
  test('upload errors', async () => {
    expect(await body(new UploadError('LIMIT_FILE_SIZE'))).toEqual({ status: 400, json: { success: false, error: { code: 'UPLOAD_ERROR', message: 'File is too large' } } });
    expect((await body(new UploadError('LIMIT_FILE_COUNT'))).json.error.message).toBe('Too many files');
  });
  test('prisma P2002 / P2025 / P1001', async () => {
    const known = (code) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '6', meta: { target: 'email' } });
    expect((await body(known('P2002'))).status).toBe(409);
    expect((await body(known('P2025'))).json.error).toEqual({ code: 'NOT_FOUND', message: 'Record not found' });
    expect((await body(known('P1001'))).status).toBe(503);
  });
  test('body parser errors', async () => {
    expect((await body({ type: 'entity.parse.failed' })).json.error).toEqual({ code: 'VALIDATION_ERROR', message: 'Malformed JSON body' });
    expect((await body({ type: 'entity.too.large' })).status).toBe(413);
  });
  test('unknown error → 500 without leaking the message', async () => {
    expect(await body(new Error('SELECT secret'))).toEqual({ status: 500, json: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } } });
  });
});
```

Run: `npm run test:server -- tests/unit/http/body.test.js tests/unit/http/errors.test.js` → FAIL (modules missing).

- [ ] **Step 6: Implement body parsing and errors**

`src/server/http/body.js`:

```js
import { parseQuery } from './context.js';

const JSON_LIMIT = 200 * 1024; // express.json({ limit: '200kb' })
const FORM_LIMIT = 50 * 1024; // express.urlencoded({ limit: '50kb' })
const parseError = (type) => Object.assign(new Error(type), { type });

const mediaType = (request) => (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

async function readLimited(request, limit) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw parseError('entity.too.large');
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > limit) throw parseError('entity.too.large');
  return buf.toString('utf8');
}

/** Same behaviour as Express 5's json + urlencoded parsers: unmatched content types leave body undefined. */
export async function parseBody(ctx) {
  const { request } = ctx;
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return;
  const type = mediaType(request);
  if (type === 'application/json') {
    const text = await readLimited(request, JSON_LIMIT);
    if (!text.trim()) { ctx.body = {}; return; }
    if (!/^[\s]*[[{]/.test(text)) throw parseError('entity.parse.failed'); // strict mode
    try { ctx.body = JSON.parse(text); } catch { throw parseError('entity.parse.failed'); }
  } else if (type === 'application/x-www-form-urlencoded') {
    ctx.body = parseQuery(new URLSearchParams(await readLimited(request, FORM_LIMIT)));
  }
}
```

`src/server/http/errors.js` (moved logic of the old `middleware/errorHandler.js`):

```js
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { env } from '../config/env.js';

const UPLOAD_MESSAGES = { LIMIT_FILE_SIZE: 'File is too large', LIMIT_FILE_COUNT: 'Too many files', LIMIT_UNEXPECTED_FILE: 'Unexpected field' };
/** Replaces multer.MulterError: same codes and messages. */
export class UploadError extends Error {
  constructor(code) { super(UPLOAD_MESSAGES[code] || code); this.code = code; }
}

const errorBody = (status, code, message, details) => Response.json({ success: false, error: { code, message, ...(details ? { details } : {}) } }, { status });

export const notFoundResponse = (ctx) => errorBody(404, 'NOT_FOUND', `Route ${ctx.method} ${ctx.originalUrl} not found`);

export function toErrorResponse(err, ctx) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof UploadError) {
    status = 400; code = 'UPLOAD_ERROR'; message = err.message;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') { status = 409; code = 'CONFLICT'; message = `A record with this ${err.meta?.target || 'value'} already exists`; }
    else if (err.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; }
    else if (err.code === 'P2023') { status = 404; code = 'NOT_FOUND'; message = 'Record not found'; } // malformed id
    else if (err.code === 'P2003') { status = 400; code = 'VALIDATION_ERROR'; message = 'Related record does not exist'; }
    else if (['P1001', 'P1002', 'P1017'].includes(err.code)) { status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'Database is unavailable. Please try again shortly.'; }
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    status = 503; code = 'DATABASE_UNAVAILABLE'; message = 'Database is unavailable. Check DATABASE_URL and that PostgreSQL is running.';
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid data';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body too large';
  }

  if (status >= 500 && !env.isTest) console.error('[error]', ctx?.method, ctx?.originalUrl, err);
  // Never leak stack traces, SQL or secrets to clients.
  return errorBody(status, code, message, details);
}
```

Run the two test files → PASS.

- [ ] **Step 7: Failing tests for rate limiting, upload, headers and defineRoute**

`tests/unit/http/rateLimit.test.js`:

```js
import { createLimiter } from '../../../src/server/http/rateLimit.js';
import { createContext } from '../../../src/server/http/context.js';

const ctx = (ip = '1.1.1.1') => createContext(new Request('http://l/api/x', { headers: { 'x-forwarded-for': ip } }), {});

describe('createLimiter', () => {
  test('allows `limit` hits per window per IP, then 429 JSON with draft-7 headers', async () => {
    let now = 0;
    const step = createLimiter({ windowMs: 1000, limit: 2, now: () => now, isTest: false });
    expect(step(ctx())).toBeUndefined();
    const second = ctx();
    expect(step(second)).toBeUndefined();
    expect(second.responseHeaders.get('RateLimit')).toBe('limit=2, remaining=0, reset=1');
    expect(second.responseHeaders.get('RateLimit-Policy')).toBe('2;w=1');
    const blocked = step(ctx());
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } });
    expect(step(ctx('2.2.2.2'))).toBeUndefined(); // other client unaffected
    now = 1001;
    expect(step(ctx())).toBeUndefined(); // window reset
  });

  test('plain-text variant for Africa\'s Talking', async () => {
    const step = createLimiter({ windowMs: 1000, limit: 0, text: 'END Too many requests. Please try again later.', isTest: false });
    const r = step(ctx());
    expect(r.status).toBe(429);
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await r.text()).toBe('END Too many requests. Please try again later.');
  });
});
```

`tests/unit/http/upload.test.js`:

```js
import { createContext } from '../../../src/server/http/context.js';
import { uploadSingle } from '../../../src/server/middleware/upload.js';

const form = (entries) => { const fd = new FormData(); for (const [k, v, name] of entries) fd.append(k, v, name); return fd; };
const ctxFor = (fd) => createContext(new Request('http://l/api/uploads', { method: 'POST', body: fd }), {});
const png = () => new Blob([Buffer.from([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });

describe('uploadSingle', () => {
  test('exposes the multer file shape and text fields', async () => {
    const c = ctxFor(form([['image', png(), 'leaf.png'], ['note', 'hi']]));
    await uploadSingle('image', { maxBytes: 1024 })(c);
    expect(c.file).toMatchObject({ fieldname: 'image', originalname: 'leaf.png', mimetype: 'image/png', size: 4 });
    expect(Buffer.isBuffer(c.file.buffer)).toBe(true);
    expect(c.body).toEqual({ note: 'hi' });
  });
  test('disallowed mime is silently dropped (multer fileFilter)', async () => {
    const c = ctxFor(form([['image', new Blob(['x'], { type: 'text/plain' }), 'x.txt']]));
    await uploadSingle('image', { maxBytes: 1024 })(c);
    expect(c.file).toBeUndefined();
  });
  test('too large → UploadError LIMIT_FILE_SIZE', async () => {
    await expect(uploadSingle('image', { maxBytes: 2 })(ctxFor(form([['image', png(), 'a.png']])))).rejects.toMatchObject({ code: 'LIMIT_FILE_SIZE' });
  });
  test('two files → LIMIT_FILE_COUNT; other field → LIMIT_UNEXPECTED_FILE', async () => {
    await expect(uploadSingle('image', { maxBytes: 1024 })(ctxFor(form([['image', png(), 'a.png'], ['image', png(), 'b.png']])))).rejects.toMatchObject({ code: 'LIMIT_FILE_COUNT' });
    await expect(uploadSingle('image', { maxBytes: 1024 })(ctxFor(form([['photo', png(), 'a.png']])))).rejects.toMatchObject({ code: 'LIMIT_UNEXPECTED_FILE' });
  });
  test('non-multipart request → no file, no error', async () => {
    const c = createContext(new Request('http://l/api/uploads', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), {});
    await uploadSingle('image', { maxBytes: 1024 })(c);
    expect(c.file).toBeUndefined();
  });
});
```

`tests/unit/http/defineRoute.test.js`:

```js
import { defineRoute } from '../../../src/server/http/defineRoute.js';
import { badRequest } from '../../../src/server/utils/errors.js';
import { ok } from '../../../src/server/utils/response.js';

const call = (handler, url, init = {}, params = {}) => handler(new Request(`http://localhost${url}`, init), { params: Promise.resolve(params) });

describe('defineRoute', () => {
  test('runs steps in order, then the controller with (req, res)', async () => {
    const order = [];
    const h = defineRoute([() => { order.push('a'); }, (req) => { order.push('b'); req.user = { id: 'u' }; }], (req, res) => ok(res, { id: req.params.id, user: req.user.id, body: req.body }));
    const r = await call(h, '/api/x/9', { method: 'POST', body: '{"n":1}', headers: { 'content-type': 'application/json' } }, { id: '9' });
    expect(order).toEqual(['a', 'b']);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ success: true, data: { id: '9', user: 'u', body: { n: 1 } }, message: 'OK' });
  });

  test('a step returning a Response short-circuits', async () => {
    const h = defineRoute([() => new Response('no', { status: 429 })], () => { throw new Error('should not run'); });
    expect((await call(h, '/api/x')).status).toBe(429);
  });

  test('thrown AppError → error JSON', async () => {
    const h = defineRoute([], () => { throw badRequest('Nope'); });
    const r = await call(h, '/api/x');
    expect(r.status).toBe(400);
    expect((await r.json()).error.message).toBe('Nope');
  });

  test('malformed JSON is rejected before steps run', async () => {
    let ran = false;
    const h = defineRoute([() => { ran = true; }], () => {});
    const r = await call(h, '/api/x', { method: 'POST', body: '{bad', headers: { 'content-type': 'application/json' } });
    expect(r.status).toBe(400);
    expect(ran).toBe(false);
  });

  test('security headers, CORS for allowed origin, step headers', async () => {
    const h = defineRoute([(req) => { req.responseHeaders.set('RateLimit', 'limit=1, remaining=0, reset=1'); }], (_req, res) => ok(res));
    const r = await call(h, '/api/x', { headers: { origin: 'http://localhost:5173' } });
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(r.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(r.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(r.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(r.headers.get('vary')).toContain('Origin');
    expect(r.headers.get('ratelimit')).toBe('limit=1, remaining=0, reset=1');
  });

  test('disallowed origin gets no CORS header but the request still runs', async () => {
    const h = defineRoute([], (_req, res) => ok(res));
    const r = await call(h, '/api/x', { headers: { origin: 'https://evil.example' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });
});
```

Run: `npm run test:server -- tests/unit/http` → FAIL for the three new files.

- [ ] **Step 8: Implement rate limiting, upload, headers, logging and defineRoute**

`src/server/http/rateLimit.js` (replaces `src/server/middleware/rateLimit.js`, which is deleted in Task 3):

```js
import { env } from '../config/env.js';

/** Fixed-window in-memory limiter, equivalent to express-rate-limit's MemoryStore with draft-7 headers. */
export function createLimiter({ windowMs, limit, text, now = Date.now, isTest = env.isTest }) {
  const hits = new Map();
  const max = isTest ? 100000 : limit;
  return function rateLimitStep(ctx) {
    const t = now();
    let entry = hits.get(ctx.ip);
    if (!entry || t >= entry.resetAt) { entry = { count: 0, resetAt: t + windowMs }; hits.set(ctx.ip, entry); }
    entry.count += 1;
    const reset = Math.max(0, Math.ceil((entry.resetAt - t) / 1000));
    const headers = {
      'RateLimit-Policy': `${max};w=${Math.round(windowMs / 1000)}`,
      RateLimit: `limit=${max}, remaining=${Math.max(0, max - entry.count)}, reset=${reset}`,
    };
    if (entry.count > max) {
      const init = { status: 429, headers: { ...headers, 'Retry-After': String(reset) } };
      return text
        ? new Response(text, { ...init, headers: { ...init.headers, 'Content-Type': 'text/plain; charset=utf-8' } })
        : Response.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } }, init);
    }
    for (const [k, v] of Object.entries(headers)) ctx.responseHeaders.set(k, v);
    return undefined;
  };
}

export const limiters = {
  api: createLimiter({ windowMs: 15 * 60 * 1000, limit: 1500 }),
  auth: createLimiter({ windowMs: 15 * 60 * 1000, limit: 30 }),
  ai: createLimiter({ windowMs: 60 * 1000, limit: 30 }),
  location: createLimiter({ windowMs: 60 * 1000, limit: 20 }),
  /** Africa's Talking callbacks: generous (all traffic comes from AT's IPs) but bounded. */
  integration: createLimiter({ windowMs: 60 * 1000, limit: 300, text: 'END Too many requests. Please try again later.' }),
};
```

The unit test passes `isTest: false` to exercise real limits. The shared `limiters` use the default (`env.isTest`), so they stay at 100000 under the test suite, exactly like the Express limiters.

`src/server/middleware/upload.js`:

```js
import { env } from '../config/env.js';
import { UploadError } from '../http/errors.js';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** multer.memoryStorage().single(field) equivalent: { fieldname, originalname, mimetype, size, buffer } on req.file. */
export const uploadSingle = (field, { maxBytes = env.maxUploadBytes } = {}) => async (req) => {
  const type = (req.request.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('multipart/form-data')) return;
  let form;
  try { form = await req.request.formData(); } catch { throw new UploadError('Malformed multipart body'); }
  const files = [];
  const body = {};
  for (const [name, value] of form) {
    if (typeof value === 'string') { body[name] = Object.hasOwn(body, name) ? [].concat(body[name], value) : value; continue; }
    if (name !== field) throw new UploadError('LIMIT_UNEXPECTED_FILE');
    files.push(value);
  }
  if (files.length > 1) throw new UploadError('LIMIT_FILE_COUNT');
  req.body = body;
  const [file] = files;
  if (!file || !ALLOWED.includes(file.type)) return;
  if (file.size > maxBytes) throw new UploadError('LIMIT_FILE_SIZE');
  req.file = { fieldname: field, originalname: file.name || 'upload', mimetype: file.type, size: file.size, buffer: Buffer.from(await file.arrayBuffer()) };
};
```

`src/server/http/headers.js`:

```js
import { env } from '../config/env.js';
import { isAllowedOrigin } from '../config/cors.js';

/** helmet() v8 defaults with crossOriginResourcePolicy: 'cross-origin' (as the Express app used). */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-XSS-Protection': '0',
};

export function applySecurityHeaders(headers) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
}

/** cors({ origin: isAllowedOrigin, credentials: false }) for simple requests. */
export function applyCors(request, headers) {
  const origin = request.headers.get('origin');
  headers.append('Vary', 'Origin');
  if (origin && isAllowedOrigin(origin, env)) headers.set('Access-Control-Allow-Origin', origin);
}

/** cors() preflight: 204 with methods/headers; ACAO only for allowed origins. */
export function preflight(request) {
  const headers = new Headers({ 'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE', 'Content-Length': '0' });
  applyCors(request, headers);
  const asked = request.headers.get('access-control-request-headers');
  if (asked) { headers.set('Access-Control-Allow-Headers', asked); headers.append('Vary', 'Access-Control-Request-Headers'); }
  applySecurityHeaders(headers);
  return new Response(null, { status: 204, headers });
}
```

`src/server/http/log.js`:

```js
import { env } from '../config/env.js';

// Never write query-string secrets (e.g. the Africa's Talking callback ?secret=) to access logs.
export const redactUrl = (url) => url.replace(/([?&](?:key|token|apiKey|secret)=)[^&]*/gi, '$1[REDACTED]');

export function logRequest(ctx, response, startedMs) {
  if (env.isTest) return;
  const ms = (performance.now() - startedMs).toFixed(1);
  console.log(`[api] ${ctx.method} ${redactUrl(ctx.originalUrl)} ${response.status} ${ms} ms`);
}
```

`src/server/http/defineRoute.js`:

```js
import { createContext } from './context.js';
import { createResponder, toResponse } from './responder.js';
import { parseBody } from './body.js';
import { toErrorResponse } from './errors.js';
import { applyCors, applySecurityHeaders } from './headers.js';
import { logRequest } from './log.js';

/**
 * Next Route Handler that reproduces the Express pipeline:
 * body parsers → route steps (limiters, authenticate, authorize, validate, upload) → controller(req, res) → error handler.
 */
export function defineRoute(steps, controller) {
  return async function routeHandler(request, context = {}) {
    const started = performance.now();
    const ctx = createContext(request, (await context.params) || {});
    let response;
    try {
      await parseBody(ctx);
      for (const step of steps) {
        const early = await step(ctx);
        if (early instanceof Response) { response = early; break; }
      }
      if (!response) {
        const res = createResponder();
        const returned = await controller(ctx, res);
        response = returned instanceof Response ? returned : await toResponse(res);
      }
    } catch (err) {
      response = toErrorResponse(err, ctx);
    }
    for (const [k, v] of ctx.responseHeaders) if (!response.headers.has(k)) response.headers.set(k, v);
    applyCors(request, response.headers);
    applySecurityHeaders(response.headers);
    logRequest(ctx, response, started);
    return response;
  };
}
```

- [ ] **Step 9: Convert auth and validate middleware to steps**

In `src/server/middleware/auth.js`, keep `ROLES`, `ACTIVE_ROLE_NAMES`, `STAFF_ROLES`, `CROSS_COOP_STAFF`, `signToken`, `loadUser` and `hasRole` unchanged. Replace `authenticate` and `authorize`:

```js
export async function authenticate(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user = await loadUser(payload.sub);
  if (!user || !user.isActive) throw unauthorized('Account not found or disabled');
  req.user = user;
}

/** authorize('ADMIN') or authorize('FARMER', 'ADMIN') — any matching active role passes. */
export const authorize = (...roles) => (req) => {
  if (!req.user) throw unauthorized();
  if (!hasRole(req.user, ...roles)) throw forbidden();
};
```

In `src/server/middleware/validate.js`, change only the signature and the error path:

```js
export const validate = (schema, part = 'body', { partial = false } = {}) => (req) => {
  const input = req[part] ?? {};
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw badRequest('Invalid input', details);
  }
  let data = result.data;
  if (partial && data && typeof data === 'object') {
    data = Object.fromEntries(Object.entries(data).filter(([k]) => Object.prototype.hasOwnProperty.call(input, k)));
  }
  req.valid = { ...(req.valid || {}), [part]: data };
};
```

The Express routers still import these and will break until Task 3 replaces them. Task 3 deletes the routers and `app.js`. For this task's test run, use only `tests/unit`.

- [ ] **Step 10: Run the unit suite**

Run: `npm run test:server -- tests/unit`
Expected: PASS, including the 7 new `tests/unit/http/*` files. (Integration tests are expected to fail until Task 3 because `src/server/app.js` still uses Express-style middleware.)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(server): add Next route pipeline equivalent to the Express middleware chain

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API route table, Route Handler files, test helper; remove Express

**Files:**
- Create: `src/server/http/routeTable.js`, `scripts/gen-api-routes.mjs`, `app/api/**/route.js` (generated), `app/api/route.js`, `app/api/[...notFound]/route.js`, `app/api/docs/route.js`, `app/api/docs/[asset]/route.js`, `app/api/docs.json/route.js`, `tests/unit/http/routeTable.test.js`, `tests/integration/routing.test.js`
- Modify: `tests/helpers.js` (supertest-compatible shim)
- Delete: `src/server/app.js`, `src/server/routes/`, `src/server/middleware/errorHandler.js`, `src/server/middleware/rateLimit.js`
- Packages: remove `express cors helmet morgan multer express-rate-limit swagger-ui-express supertest`; add `swagger-ui-dist`

**Interfaces:**
- Consumes: `defineRoute`, `limiters`, `notFoundResponse`, `preflight`, `applySecurityHeaders`, `authenticate`, `authorize`, `validate` and `uploadSingle` from Task 2. Controllers in `src/server/controllers/*` are unchanged.
- Produces:
  - `ROUTES: Array<{ method, pattern, steps, controller }>` (pattern like `/farms/:id/cycles/:cycleId`, relative to `/api`).
  - `handlersFor(pattern) → { GET, POST, PUT, PATCH, DELETE, OPTIONS }`.
  - `matchRoute(pathname) → { pattern, params } | null`, using Next precedence (static before dynamic).
  - `patternToDir(pattern) → 'farms/[id]/cycles/[cycleId]'`.
  - `notFoundHandler: (request) => Promise<Response>`.

- [ ] **Step 1: Failing tests: table ↔ files, matching, Express-equivalent fallbacks**

`tests/unit/http/routeTable.test.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import { ROUTES, matchRoute, patternToDir } from '../../../src/server/http/routeTable.js';

const apiDir = path.join(process.cwd(), 'app', 'api');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === 'route.js' ? [path.join(d, e.name)] : []));
const HAND_WRITTEN = new Set(['', '[...notFound]', 'docs', 'docs/[asset]', 'docs.json']);

describe('route table', () => {
  test('has the 114 Express endpoints', () => { expect(ROUTES).toHaveLength(114); });

  test('no duplicate method+pattern', () => {
    const keys = ROUTES.map((r) => `${r.method} ${r.pattern}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every pattern has exactly one generated route file and vice versa', () => {
    const fromTable = new Set(ROUTES.map((r) => patternToDir(r.pattern)));
    const onDisk = new Set(walk(apiDir).map((f) => path.relative(apiDir, path.dirname(f)).split(path.sep).join('/')).filter((d) => !HAND_WRITTEN.has(d)));
    expect([...onDisk].sort()).toEqual([...fromTable].sort());
    for (const dir of fromTable) {
      const src = fs.readFileSync(path.join(apiDir, dir, 'route.js'), 'utf8');
      const pattern = ROUTES.find((r) => patternToDir(r.pattern) === dir).pattern;
      expect(src).toContain(`handlersFor('${pattern}')`);
    }
  });

  test('static segments win over dynamic ones', () => {
    expect(matchRoute('/api/farms/predictions/abc')).toEqual({ pattern: '/farms/predictions/:predictionId', params: { predictionId: 'abc' } });
    expect(matchRoute('/api/farms/f1')).toEqual({ pattern: '/farms/:id', params: { id: 'f1' } });
    expect(matchRoute('/api/cooperatives/mine/dashboard').pattern).toBe('/cooperatives/mine/dashboard');
    expect(matchRoute('/api/notifications/read-all').pattern).toBe('/notifications/read-all');
    expect(matchRoute('/api/ussd/MwaniMlinzi').pattern).toBe('/ussd/MwaniMlinzi');
    expect(matchRoute('/api/nope/at/all')).toBeNull();
  });
});
```

`tests/integration/routing.test.js` (Review Focus 1):

```js
import { api, auth, login } from '../helpers.js';

describe('Express-equivalent fallbacks', () => {
  test('unknown /api path without a token → 401 (global authenticate ran first)', async () => {
    const res = await api().get('/api/does-not-exist');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
  test('unknown /api path with a token → 404 Route … not found', async () => {
    const res = await api().get('/api/does-not-exist?x=1').set(auth(await login('farmer')));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: { code: 'NOT_FOUND', message: 'Route GET /api/does-not-exist?x=1 not found' } });
  });
  test('unknown /api/admin path for a farmer → 403', async () => {
    const res = await api().get('/api/admin/nothing').set(auth(await login('farmer')));
    expect(res.status).toBe(403);
  });
  test('wrong method on a known public path → 401 without token', async () => {
    expect((await api().delete('/api/health')).status).toBe(401);
  });
  test('GET /api banner and docs', async () => {
    expect((await api().get('/api')).body.data.name).toBe('MwaniMlinzi AI API');
    expect((await api().get('/api/docs.json')).body.openapi).toBeDefined();
    const docs = await api().get('/api/docs');
    expect(docs.status).toBe(200);
    expect(docs.text).toContain('swagger-ui');
  });
});
```

Check the login role names in `tests/fixtures/people.js`. If the farmer fixture role key is not `farmer`, use the key that `login()` is called with elsewhere (for example in `tests/integration/authorization.test.js`).

Run: `npm run test:server -- tests/unit/http/routeTable.test.js` → FAIL (module missing).

- [ ] **Step 2: Write the route table**

`src/server/http/routeTable.js`. Each entry copies one Express registration: same method, path (minus `/api`), and middleware in the same order. `api` is the global apiLimiter, and `AUTH` is the global `api.use(authenticate)`.

```js
import { defineRoute } from './defineRoute.js';
import { limiters } from './rateLimit.js';
import { notFoundResponse, toErrorResponse } from './errors.js';
import { preflight, applyCors, applySecurityHeaders } from './headers.js';
import { createContext } from './context.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadSingle } from '../middleware/upload.js';
import * as s from '../validators/schemas.js';
import * as authC from '../controllers/authController.js';
import * as farm from '../controllers/farmController.js';
import * as core from '../controllers/coreController.js';
import * as dash from '../controllers/dashboardController.js';
import * as admin from '../controllers/adminController.js';
import * as pub from '../controllers/publicController.js';
import * as integrations from '../controllers/integrationController.js';
import * as sarufi from '../controllers/sarufiController.js';

const API = [limiters.api];
const AUTH = [limiters.api, authenticate];
const INT = [limiters.integration];
const STAFF = ['ADMIN'];
const farmViewers = authorize('FARMER', 'ADMIN');
const recorders = authorize('FARMER', 'ADMIN');
const ADMIN = [...AUTH, authorize('ADMIN')];

const r = (method, pattern, steps, controller) => ({ method, pattern, steps, controller });

export const ROUTES = [
  // Public
  r('GET', '/health', API, core.health),
  r('GET', '/species', API, core.species),
  r('GET', '/cooperatives/public', API, core.publicCooperatives),
  // Signed-token exports for buyers/processors (forecasts) and programmes/NGOs (adoption).
  r('GET', '/public/forecasts', API, pub.forecasts),
  r('GET', '/public/adoption', API, pub.adoption),

  // Auth
  r('POST', '/auth/register', [...API, limiters.auth, validate(s.registerSchema)], authC.register),
  r('POST', '/auth/login', [...API, limiters.auth, validate(s.loginSchema)], authC.login),
  r('GET', '/auth/me', AUTH, authC.me),
  r('PATCH', '/auth/me', [...AUTH, validate(s.profileSchema, 'body', { partial: true })], authC.updateMe),
  r('POST', '/auth/change-password', [...API, limiters.auth, authenticate, validate(s.changePasswordSchema)], authC.changePassword),
  r('POST', '/auth/logout', AUTH, authC.logout),
  r('POST', '/auth/forgot-password', [...API, limiters.auth, validate(s.forgotPasswordSchema)], authC.forgotPassword),
  r('POST', '/auth/reset-password', [...API, limiters.auth, validate(s.resetPasswordSchema)], authC.resetPassword),

  // Farms: owners see their own farms; administrators see all farms.
  r('GET', '/farms', [...AUTH, farmViewers], farm.listFarms),
  r('POST', '/farms', [...AUTH, authorize('FARMER', 'ADMIN'), validate(s.farmSchema)], farm.createFarm),
  r('GET', '/farms/predictions/:predictionId', [...AUTH, farmViewers], farm.latestPrediction),
  r('GET', '/farms/:id', [...AUTH, farmViewers], farm.getFarm),
  r('PATCH', '/farms/:id', [...AUTH, recorders, validate(s.farmUpdateSchema, 'body', { partial: true })], farm.updateFarm),
  r('GET', '/farms/:id/cycles', [...AUTH, farmViewers], farm.listCycles),
  r('POST', '/farms/:id/cycles', [...AUTH, recorders, validate(s.cycleSchema)], farm.createCycle),
  r('PATCH', '/farms/:id/cycles/:cycleId', [...AUTH, recorders, validate(s.cycleUpdateSchema)], farm.updateCycle),
  r('GET', '/farms/:id/observations', [...AUTH, farmViewers], farm.listObservations),
  r('POST', '/farms/:id/observations', [...AUTH, recorders, validate(s.observationSchema)], farm.createObservation),
  r('GET', '/farms/:id/harvests', [...AUTH, farmViewers], farm.listHarvests),
  r('POST', '/farms/:id/harvests', [...AUTH, recorders, validate(s.harvestSchema)], farm.createHarvest),
  r('GET', '/farms/:id/losses', [...AUTH, farmViewers], farm.listLosses),
  r('POST', '/farms/:id/losses', [...AUTH, recorders, validate(s.lossSchema)], farm.createLoss),
  r('GET', '/farms/:id/records/summary', [...AUTH, farmViewers], farm.recordSummary),
  ...[['sales', s.saleSchema], ['costs', s.costSchema], ['work', s.workSchema]].flatMap(([kind, schema]) => [
    r('GET', `/farms/:id/${kind}`, [...AUTH, farmViewers], farm.listRecords(kind)),
    r('POST', `/farms/:id/${kind}`, [...AUTH, recorders, validate(schema)], farm.createRecord(kind)),
    r('DELETE', `/farms/:id/${kind}/:recordId`, [...AUTH, recorders], farm.deleteRecord(kind)),
  ]),
  r('GET', '/farms/:id/risks', [...AUTH, farmViewers], farm.getRisks),
  r('GET', '/farms/:id/intelligence', [...AUTH, farmViewers], farm.farmIntelligence),
  r('POST', '/farms/:id/risks/run', [...AUTH, farmViewers], farm.runRisks),
  r('GET', '/farms/:id/risks/history', [...AUTH, farmViewers], farm.riskHistory),
  r('GET', '/farms/:id/recommendations', [...AUTH, farmViewers], farm.listRecommendations),
  r('PATCH', '/farms/:id/recommendations/:recId', [...AUTH, recorders, validate(s.recommendationUpdateSchema)], farm.updateRecommendation),
  r('GET', '/farms/:id/actions', [...AUTH, farmViewers], farm.listActions),
  r('POST', '/farms/:id/actions', [...AUTH, recorders, validate(s.farmerActionSchema)], farm.createAction),
  r('GET', '/farms/:id/outcomes', [...AUTH, farmViewers], farm.listOutcomes),
  r('POST', '/farms/:id/outcomes', [...AUTH, recorders, validate(s.outcomeSchema)], farm.createOutcome),
  r('GET', '/farms/:id/history', [...AUTH, farmViewers], farm.farmHistoryTimeline),
  r('GET', '/farms/:id/environment', [...AUTH, farmViewers], farm.farmEnvironment),
  r('GET', '/farms/:id/outlook', [...AUTH, farmViewers], farm.farmOutlook),
  r('GET', '/farms/:id/alerts', [...AUTH, farmViewers], farm.farmAlerts),
  r('GET', '/farms/:id/notes', [...AUTH, farmViewers], farm.listNotes),
  r('POST', '/farms/:id/notes', [...AUTH, authorize('ADMIN'), validate(s.extensionNoteSchema)], farm.createNote),

  // Everything below requires a valid JWT
  r('GET', '/location/reverse', [...AUTH, authorize('FARMER', 'ADMIN'), limiters.location, validate(s.reverseGeocodeSchema, 'query')], core.reverseGeocode),
  r('GET', '/environment/current', [...AUTH, authorize('FARMER', ...STAFF)], core.environmentCurrent),
  r('GET', '/environment/history', [...AUTH, authorize('FARMER', ...STAFF)], core.environmentHistory),
  r('GET', '/environment/providers', AUTH, core.environmentProviders),
  // What-if planner (overrides on request body) is admin-only; a plain forecast request has no overrides.
  r('POST', '/risk/predict', [...AUTH, authorize('FARMER', ...STAFF), validate(s.simulationSchema)], core.predict),
  r('GET', '/risk/:farmId', [...AUTH, authorize('FARMER', ...STAFF)], core.riskForFarm),
  r('POST', '/risk/predictions/:id/flag', [...AUTH, authorize('ADMIN'), validate(s.flagPredictionSchema)], core.flagPrediction),
  r('GET', '/actions', [...AUTH, authorize(...STAFF, 'FARMER')], admin.listActionLibrary),
  r('GET', '/actions/:id', [...AUTH, authorize(...STAFF, 'FARMER')], admin.getActionLibrary),
  r('POST', '/actions', [...AUTH, authorize('ADMIN'), validate(s.actionLibrarySchema)], admin.createActionLibrary),
  r('PATCH', '/actions/:id', [...AUTH, authorize('ADMIN'), validate(s.actionLibraryUpdateSchema, 'body', { partial: true })], admin.updateActionLibrary),
  r('POST', '/actions/:id/validate', [...AUTH, authorize('ADMIN'), validate(s.actionValidateSchema)], admin.validateActionLibrary),
  r('GET', '/alerts', AUTH, core.listAlerts),
  r('PATCH', '/alerts/:id', [...AUTH, authorize('FARMER', ...STAFF)], core.updateAlert),
  r('GET', '/notifications', AUTH, core.listNotifications),
  r('POST', '/notifications/read-all', AUTH, core.readAllNotifications),
  r('PATCH', '/notifications/:id/read', AUTH, core.readNotification),
  r('GET', '/cooperatives', AUTH, dash.listCooperatives),
  r('POST', '/cooperatives', [...AUTH, authorize('ADMIN'), validate(s.cooperativeSchema)], admin.createCooperative),
  r('PATCH', '/cooperatives/:id', [...AUTH, authorize('ADMIN'), validate(s.cooperativeSchema.partial(), 'body', { partial: true })], admin.updateCooperative),
  r('GET', '/cooperatives/mine/dashboard', [...AUTH, authorize(...STAFF)], dash.myCooperativeDashboard),
  r('GET', '/cooperatives/:id/dashboard', [...AUTH, authorize(...STAFF)], dash.cooperativeDashboard),
  r('GET', '/cooperatives/:id/farmers', [...AUTH, authorize(...STAFF)], dash.cooperativeFarmers),
  // Field operations across cooperatives: administrator access only.
  r('GET', '/extension/dashboard', [...AUTH, authorize(...STAFF)], dash.extensionDashboard),
  r('GET', '/extension/observations', [...AUTH, authorize(...STAFF)], dash.extensionObservations),
  r('PATCH', '/extension/observations/:id/review', [...AUTH, authorize(...STAFF), validate(s.reviewSchema)], dash.reviewObservation),
  r('GET', '/extension/recommendations', [...AUTH, authorize(...STAFF)], dash.extensionRecommendations),
  r('PATCH', '/extension/recommendations/:id/review', [...AUTH, authorize(...STAFF), validate(s.reviewSchema)], dash.reviewRecommendation),
  r('GET', '/forecasts/harvest', [...AUTH, validate(s.forecastQuerySchema, 'query')], core.harvestForecasts),
  r('POST', '/forecasts/harvest/generate', [...AUTH, authorize('ADMIN')], core.generateForecasts),
  // Slide-11 pilot targets, scoped by role.
  r('GET', '/dashboard/impact', [...AUTH, authorize(...STAFF)], dash.impactMetrics),
  r('POST', '/ai/chat', [...AUTH, limiters.ai, validate(s.chatSchema)], core.chat),
  r('GET', '/ai/status', AUTH, core.aiStatus),
  r('POST', '/uploads', [...AUTH, authorize('FARMER', 'ADMIN'), uploadSingle('image')], admin.uploadImage),
  r('GET', '/uploads/:id', AUTH, admin.getUpload),

  // Admin
  r('GET', '/admin/dashboard', ADMIN, dash.adminDashboard),
  r('GET', '/admin/users', ADMIN, admin.listUsers),
  r('POST', '/admin/users', [...ADMIN, validate(s.adminUserCreateSchema)], admin.createUser),
  r('PATCH', '/admin/users/:id', [...ADMIN, validate(s.adminUserUpdateSchema, 'body', { partial: true })], admin.updateUser),
  r('GET', '/admin/roles', ADMIN, admin.listRoles),
  r('GET', '/admin/settings', ADMIN, admin.getSettings),
  r('PUT', '/admin/settings/:key', [...ADMIN, validate(s.settingUpdateSchema)], admin.updateSetting),
  r('GET', '/admin/models', ADMIN, admin.listModels),
  r('PATCH', '/admin/models/:id', [...ADMIN, validate(s.modelStatusSchema)], admin.updateModel),
  r('GET', '/admin/audit', ADMIN, admin.listAudit),
  r('GET', '/admin/jobs', ADMIN, admin.listJobs),
  r('POST', '/admin/jobs/:name/run', ADMIN, admin.runJobNow),
  r('GET', '/admin/notification-logs', ADMIN, admin.notificationLogs),
  r('GET', '/admin/integrations/africastalking', ADMIN, admin.africasTalkingStatus),
  r('POST', '/admin/integrations/africastalking/test-sms', [...ADMIN, validate(s.testSmsSchema)], admin.testSms),
  // Issue, list and revoke signed access tokens for the buyer/NGO public export endpoints.
  r('GET', '/admin/public-tokens', ADMIN, admin.listPublicTokens),
  r('POST', '/admin/public-tokens', [...ADMIN, validate(s.publicAccessTokenCreateSchema)], admin.createPublicToken),
  r('DELETE', '/admin/public-tokens/:id', ADMIN, admin.revokePublicToken),
  r('GET', '/admin/tma-bulletin', ADMIN, admin.getTmaBulletin),
  r('PUT', '/admin/tma-bulletin', ADMIN, admin.putTmaBulletin),

  // External provider callbacks: own limiter + shared secret, not the API limiter.
  r('POST', '/integrations/africastalking/ussd', INT, integrations.ussd),
  r('POST', '/integrations/africastalking/sms', INT, integrations.smsInbound),
  r('POST', '/integrations/africastalking/sms/delivery', INT, integrations.smsDelivery),
  // Sarufi (WhatsApp gateway): the GET is a health probe Sarufi's dashboard hits when you paste the URL.
  r('GET', '/integrations/sarufi/webhook', INT, sarufi.health),
  r('POST', '/integrations/sarufi/webhook', INT, sarufi.webhook),
  r('POST', '/ussd/MwaniMlinzi', INT, integrations.ussd), // AT channel callback alias
];

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const segments = (p) => p.split('/').filter(Boolean);

export const patternToDir = (pattern) => segments(pattern).map((seg) => (seg.startsWith(':') ? `[${seg.slice(1)}]` : seg)).join('/');

/** Matches like Next's App Router: at each level a static segment beats a dynamic one. */
export function matchRoute(pathname) {
  const parts = segments(pathname.replace(/^\/api(?=\/|$)/, ''));
  const patterns = [...new Set(ROUTES.map((x) => x.pattern))].map((p) => ({ p, segs: segments(p) })).filter((x) => x.segs.length === parts.length);
  const score = (segs) => segs.map((seg) => (seg.startsWith(':') ? '1' : '0')).join('');
  const hits = patterns
    .filter(({ segs }) => segs.every((seg, i) => seg.startsWith(':') || seg === parts[i]))
    .sort((a, b) => score(a.segs).localeCompare(score(b.segs)));
  if (!hits.length) return null;
  const { p, segs } = hits[0];
  const params = {};
  segs.forEach((seg, i) => { if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]); });
  return { pattern: p, params };
}

/**
 * Express fell through to `api.use(authenticate)` (and `adm.use(authorize('ADMIN'))` under /admin)
 * before its 404 handler, so unknown paths answer 401/403 first. Integration paths fell through too.
 */
const fallbackSteps = (path) => [...AUTH, ...(path.startsWith('/api/admin/') ? [authorize('ADMIN')] : [])];
export async function notFoundHandler(request) {
  const path = new URL(request.url).pathname;
  return defineRoute(fallbackSteps(path), (req) => notFoundResponse(req))(request, {});
}

export function handlersFor(pattern) {
  const handlers = {};
  for (const method of METHODS) {
    const route = ROUTES.find((x) => x.pattern === pattern && x.method === method);
    handlers[method] = route ? defineRoute(route.steps, route.controller) : notFoundHandler;
  }
  handlers.OPTIONS = async (request) => preflight(request);
  return handlers;
}

export { applyCors, applySecurityHeaders, createContext, toErrorResponse };
```

Before running, count every `api.*`/`r.*`/`adm.*` registration across the four old router files and compare with the 114 entries (auth 8 + farms 40 incl. the sales/costs/work loop + index 60 + integrations 5 + USSD alias 1). The loop over sales/costs/work expands to 9.

- [ ] **Step 3: Generator for route files**

`scripts/gen-api-routes.mjs`:

```js
// Writes one Next Route Handler file per route-table pattern. Re-run after editing src/server/http/routeTable.js.
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV ||= 'development';
process.env.JWT_SECRET ||= 'route-generator-only';
const { ROUTES, patternToDir } = await import('../src/server/http/routeTable.js');
const apiDir = path.join(process.cwd(), 'app', 'api');

for (const pattern of new Set(ROUTES.map((r) => r.pattern))) {
  const dir = path.join(apiDir, ...patternToDir(pattern).split('/'));
  const rel = path.relative(dir, path.join(process.cwd(), 'src', 'server', 'http', 'routeTable.js')).split(path.sep).join('/');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'route.js'), `// Generated by scripts/gen-api-routes.mjs from src/server/http/routeTable.js. Do not edit.
import { handlersFor } from '${rel}';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const h = handlersFor('${pattern}');
export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const PATCH = h.PATCH;
export const DELETE = h.DELETE;
export const OPTIONS = h.OPTIONS;
`);
}
console.log(`[gen-api-routes] wrote ${new Set(ROUTES.map((r) => r.pattern)).size} route files`);
```

Add to `package.json` scripts: `"gen:api": "node scripts/gen-api-routes.mjs"`. Then run `npm run gen:api`.

- [ ] **Step 4: Hand-written API routes**

`app/api/route.js`:

```js
import { defineRoute } from '../../src/server/http/defineRoute.js';
import { handlersFor } from '../../src/server/http/routeTable.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const fallback = handlersFor('/__none__');
/** Former Express `GET /` banner (that origin no longer exists separately; `/` is now the landing page). */
export const GET = defineRoute([], (_req, res) => res.json({ success: true, data: { name: 'MwaniMlinzi AI API', docs: '/api/docs', health: '/api/health' }, message: 'Know the risk. Know the next action.' }));
export const POST = fallback.POST;
export const PUT = fallback.PUT;
export const PATCH = fallback.PATCH;
export const DELETE = fallback.DELETE;
export const OPTIONS = fallback.OPTIONS;
```

`app/api/[...notFound]/route.js`:

```js
import { handlersFor } from '../../../src/server/http/routeTable.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const h = handlersFor('/__none__');
export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const PATCH = h.PATCH;
export const DELETE = h.DELETE;
export const OPTIONS = h.OPTIONS;
```

`app/api/docs.json/route.js`:

```js
import { openApiSpec } from '../../../src/server/config/openapi.js';
import { applySecurityHeaders } from '../../../src/server/http/headers.js';

export const runtime = 'nodejs';
export const GET = () => { const r = Response.json(openApiSpec); applySecurityHeaders(r.headers); return r; };
```

`app/api/docs/route.js` (CSP `'self'` holds because every asset is served locally):

```js
import { applySecurityHeaders } from '../../../src/server/http/headers.js';

export const runtime = 'nodejs';

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MwaniMlinzi AI API</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/api/docs/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="/api/docs/swagger-ui-bundle.js"></script>
<script src="/api/docs/swagger-ui-standalone-preset.js"></script><script src="/api/docs/swagger-initializer.js"></script></body></html>`;

export const GET = () => {
  const r = new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  applySecurityHeaders(r.headers);
  return r;
};
```

`app/api/docs/[asset]/route.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { applySecurityHeaders } from '../../../../src/server/http/headers.js';

export const runtime = 'nodejs';

const require = createRequire(import.meta.url);
const ASSETS = { 'swagger-ui.css': 'text/css', 'swagger-ui-bundle.js': 'text/javascript', 'swagger-ui-standalone-preset.js': 'text/javascript' };
const INIT = `window.onload = () => { window.ui = SwaggerUIBundle({ url: '/api/docs.json', dom_id: '#swagger-ui', presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'StandaloneLayout' }); };`;

export async function GET(_request, { params }) {
  const { asset } = await params;
  let body; let type;
  if (asset === 'swagger-initializer.js') { body = INIT; type = 'text/javascript'; }
  else if (ASSETS[asset]) { body = await fs.readFile(path.join(require('swagger-ui-dist').getAbsoluteFSPath(), asset)); type = ASSETS[asset]; }
  else return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  const r = new Response(body, { headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'public, max-age=86400' } });
  applySecurityHeaders(r.headers);
  return r;
}
```

- [ ] **Step 5: Supertest-compatible test helper**

Replace `tests/helpers.js` with the version below. Every integration test keeps its `api().get(...).set(...).send(...)` chains unchanged.

```js
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchRoute, patternToDir } from '../src/server/http/routeTable.js';
import { TEST_PASSWORD } from './testDb.js';

const API_DIR = path.join(process.cwd(), 'app', 'api');
const routeFile = (dir) => pathToFileURL(path.join(API_DIR, ...dir.split('/').filter(Boolean), 'route.js')).href;

/** Resolve a URL the way Next's file router does for this app. */
async function resolve(pathname) {
  if (pathname === '/api' || pathname === '/api/') return { mod: await import(routeFile('')), params: {} };
  if (pathname === '/api/docs.json') return { mod: await import(routeFile('docs.json')), params: {} };
  if (pathname === '/api/docs') return { mod: await import(routeFile('docs')), params: {} };
  if (pathname.startsWith('/api/docs/')) return { mod: await import(routeFile('docs/[asset]')), params: { asset: pathname.slice(10) } };
  const hit = matchRoute(pathname);
  if (hit) return { mod: await import(routeFile(patternToDir(hit.pattern))), params: hit.params };
  return { mod: await import(routeFile('[...notFound]')), params: { notFound: pathname.split('/').slice(2) } };
}

const FORM = 'application/x-www-form-urlencoded';

/** The subset of supertest's API the suite uses: set, type, send, attach, field, query; awaitable. */
class TestRequest {
  constructor(method, url) {
    this.method = method; this.url = url; this.headers = {}; this.body = undefined; this.contentType = undefined; this.form = null;
  }
  set(name, value) { if (typeof name === 'object') Object.assign(this.headers, name); else this.headers[name] = value; return this; }
  type(t) { this.contentType = t === 'form' ? FORM : t === 'json' ? 'application/json' : t; return this; }
  query(q) { const u = new URL(this.url, 'http://localhost'); for (const [k, v] of Object.entries(q)) u.searchParams.append(k, v); this.url = `${u.pathname}${u.search}`; return this; }
  send(body) {
    if (body && typeof body === 'object' && this.body && typeof this.body === 'object') Object.assign(this.body, body);
    else this.body = body;
    return this;
  }
  field(name, value) { (this.form ||= new FormData()).append(name, value); return this; }
  attach(field, buffer, opts = {}) {
    const { filename = 'file', contentType = 'application/octet-stream' } = typeof opts === 'string' ? { filename: opts } : opts;
    (this.form ||= new FormData()).append(field, new Blob([buffer], { type: contentType }), filename);
    return this;
  }
  async exec() {
    const headers = new Headers(this.headers);
    let body;
    if (this.form) body = this.form;
    else if (this.body !== undefined) {
      const type = this.contentType || (typeof this.body === 'string' ? (headers.get('content-type') || FORM) : 'application/json');
      if (!headers.has('content-type')) headers.set('content-type', type);
      body = typeof this.body === 'string' ? this.body
        : type === FORM ? new URLSearchParams(Object.entries(this.body).flatMap(([k, v]) => [].concat(v).map((x) => [k, String(x)]))).toString()
          : JSON.stringify(this.body);
    } else if (this.contentType) headers.set('content-type', this.contentType);
    if (!headers.has('x-forwarded-for')) headers.set('x-forwarded-for', '127.0.0.1');
    const request = new Request(`http://localhost${this.url}`, { method: this.method, headers, body });
    const { mod, params } = await resolve(new URL(request.url).pathname);
    const handler = mod[this.method];
    if (!handler) throw new Error(`No ${this.method} export for ${this.url}`);
    const response = await handler(request, { params: Promise.resolve(params) });
    const text = await response.text();
    const isJson = (response.headers.get('content-type') || '').includes('json');
    const out = { status: response.status, statusCode: response.status, headers: Object.fromEntries(response.headers), text, body: isJson && text ? JSON.parse(text) : {} };
    out.header = out.headers;
    out.type = (response.headers.get('content-type') || '').split(';')[0];
    return out;
  }
  then(resolveFn, rejectFn) { return this.exec().then(resolveFn, rejectFn); }
}

const client = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map((m) => [m, (url) => new TestRequest(m.toUpperCase(), url)]));
export const api = () => client;
const tokens = {};

export async function login(role) {
  if (tokens[role]) return tokens[role];
  const res = await api().post('/api/auth/login').send({ email: `${role}@example.test`, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login ${role} failed: ${JSON.stringify(res.body)}`);
  tokens[role] = res.body.data.token;
  return tokens[role];
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export async function farmByCode(token, code) {
  const res = await api().get(`/api/farms?search=${code}`).set(auth(token));
  return res.body.data.farms.find((f) => f.farmCode === code);
}
```

Check that no test imports `app` from helpers: `git grep -n "import { app\|, app }" tests`. If any does, change it to use `api()`.

- [ ] **Step 6: Delete Express and swap packages**

```bash
git rm -r src/server/routes src/server/app.js src/server/middleware/errorHandler.js src/server/middleware/rateLimit.js
npm uninstall express cors helmet morgan multer express-rate-limit swagger-ui-express supertest
npm install swagger-ui-dist
git grep -n "from 'express'\|from 'multer'\|from 'helmet'\|middleware/rateLimit\|middleware/errorHandler\|createApp" -- src tests scripts
```

Expected: the grep only shows `src/server/server.js` (`createApp`), which is removed in Task 4. For now, in `src/server/server.js` remove the `createApp` import and the `listen` block. Leave a temporary comment saying Task 4 replaces this file, so Jest never imports it.

- [ ] **Step 7: Run the whole server suite**

Run: `npm run test:server`
Expected: PASS for all unit and integration files, including the new `routing.test.js` and `routeTable.test.js`.

Common fixes:
- A test that reads `res.headers['content-type']` gets the Web value (`text/plain; charset=utf-8`), the same as Express.
- A sarufi test that sends `.type('json').send('<string>')` passes the raw string through as JSON. It must not be URL-encoded; the helper's `typeof body === 'string'` branch does that.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): serve every endpoint through Next Route Handlers and drop Express

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Server boot via `instrumentation.js`

**Files:**
- Create: `src/server/boot.js`, `instrumentation.js`, `tests/unit/boot.test.js`
- Delete: `src/server/server.js`

**Interfaces:**
- Consumes: `prisma` (`src/server/config/prisma.js`), `env`, `startScheduler()` (`src/server/jobs/scheduler.js`; it returns cron tasks with `.destroy()`).
- Produces: `boot({ startScheduler, prismaClient, logger, migrationsDir }) → Promise<{ tasks, shutdown }>`, which is idempotent per process (`globalThis.__mwaniBoot`); `pendingMigrations(prismaClient, dir) → Promise<string[]>`.

- [ ] **Step 1: Failing test**

`tests/unit/boot.test.js`:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { boot, pendingMigrations } from '../../src/server/boot.js';

const fakePrisma = (applied = []) => ({
  $connect: jest.fn().mockResolvedValue(),
  $disconnect: jest.fn().mockResolvedValue(),
  $queryRaw: jest.fn().mockResolvedValue(applied.map((migration_name) => ({ migration_name }))),
});
const migrationsDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  fs.mkdirSync(path.join(dir, '001_init')); fs.mkdirSync(path.join(dir, '002_more'));
  return dir;
};
const quiet = { log: jest.fn(), error: jest.fn() };

beforeEach(() => { delete globalThis.__mwaniBoot; });

test('pendingMigrations lists folders not yet applied', async () => {
  expect(await pendingMigrations(fakePrisma(['001_init']), migrationsDir())).toEqual(['002_more']);
});

test('boot connects, warns about pending migrations and starts jobs only when enabled', async () => {
  const start = jest.fn(() => [{ destroy: jest.fn() }]);
  const prismaClient = fakePrisma(['001_init']);
  const { tasks } = await boot({ startScheduler: start, prismaClient, logger: quiet, migrationsDir: migrationsDir(), enableJobs: true });
  expect(prismaClient.$connect).toHaveBeenCalled();
  expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('002_more'));
  expect(start).toHaveBeenCalledTimes(1);
  expect(tasks).toHaveLength(1);
});

test('boot is idempotent and keeps serving when the database is down', async () => {
  const start = jest.fn(() => []);
  const prismaClient = { ...fakePrisma(), $connect: jest.fn().mockRejectedValue(new Error('down')) };
  const first = await boot({ startScheduler: start, prismaClient, logger: quiet, migrationsDir: migrationsDir(), enableJobs: false });
  const second = await boot({ startScheduler: start, prismaClient, logger: quiet, migrationsDir: migrationsDir(), enableJobs: false });
  expect(second).toBe(first);
  expect(start).not.toHaveBeenCalled();
  expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('could not connect to PostgreSQL'), 'down');
});
```

Run: `npm run test:server -- tests/unit/boot.test.js` → FAIL.

- [ ] **Step 2: Implement**

`src/server/boot.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import prisma from './config/prisma.js';
import { env } from './config/env.js';
import { startScheduler as defaultStartScheduler } from './jobs/scheduler.js';

export async function pendingMigrations(prismaClient, dir) {
  const expected = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const applied = new Set((await prismaClient.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL`).map((r) => r.migration_name));
  return expected.filter((m) => !applied.has(m));
}

/** Process startup for the Next server (called once from instrumentation.js). Former src/server.js main(). */
export async function boot({
  startScheduler = defaultStartScheduler,
  prismaClient = prisma,
  logger = console,
  migrationsDir = path.join(process.cwd(), 'prisma', 'migrations'),
  enableJobs = env.enableJobs,
} = {}) {
  if (globalThis.__mwaniBoot) return globalThis.__mwaniBoot;
  const state = { tasks: [], shutdown: null };
  globalThis.__mwaniBoot = state;
  try {
    await prismaClient.$connect();
    logger.log('[db] connected to PostgreSQL');
    // The code expects the latest schema; an unapplied migration shows up as 500s on many pages, so say so loudly.
    const pending = await pendingMigrations(prismaClient, migrationsDir);
    if (pending.length) {
      logger.error(`[db] ${pending.length} database migration(s) not applied: ${pending.join(', ')}\n[db] Run: npx prisma migrate deploy   (pages will fail until you do)`);
    }
  } catch (err) {
    // Keep serving: /api/health reports the outage and requests get a clear 503 instead of a crash.
    logger.error('[db] could not connect to PostgreSQL — check DATABASE_URL and that the server is running:', err.message);
  }
  if (enableJobs) state.tasks = startScheduler();

  let stopping = false;
  state.shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.log(`[api] ${signal} received, shutting down`);
    await Promise.allSettled(state.tasks.map((task) => task.destroy()));
    await prismaClient.$disconnect().catch(() => {});
  };
  return state;
}
```

`instrumentation.js` (repo root):

```js
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
```

`git rm src/server/server.js`

- [ ] **Step 3: Run tests**

Run: `npm run test:server`
Expected: PASS, including `boot.test.js` (3 tests).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(server): start database checks and scheduled jobs from Next instrumentation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Next.js scaffold, providers and the navigation adapter

**Files:**
- Create: `next.config.mjs`, `postcss.config.mjs`, `app/layout.jsx`, `app/providers.jsx`, `src/client/navigation.jsx`, `src/client/test/nextNavigation.jsx`, `src/client/test/nextLink.jsx`, `src/client/test/nextDynamic.jsx`, `src/client/test/router.jsx`, `src/client/__tests__/navigation.test.jsx`, `scripts/migrate/rewrite-router-imports.mjs` (temporary)
- Modify: `src/client/test/setup.js`; every file importing `react-router-dom` (48 files); `src/client/layouts/{ProtectedRoute,PublicLayout,FarmerLayout,AppLayout}.jsx` (`Outlet` → `children`); `src/client/api/client.js:20` and `src/client/pages/public/Partner.jsx:10` (`NEXT_PUBLIC_API_URL`)
- Delete: `src/client/main.jsx` (moved into `app/providers.jsx`), `frontend/index.html` (moved into `app/layout.jsx`)
- Packages: add `next@^16.3.8`, `@tailwindcss/postcss@^4.3.3`, `tailwindcss@^4.3.3`

**Interfaces:**
- Consumes: nothing from the server tasks.
- Produces (`src/client/navigation.jsx`, React Router–compatible):
  - `Link({ to, replace, state, ...a })`
  - `NavLink({ to, end, className|fn, style|fn, children|fn })`
  - `Navigate({ to, replace, state })`
  - `useNavigate() → (to | delta, { replace, state })`
  - `useLocation() → { pathname, search, hash, state }`
  - `useParams() → object`
  - `useSearchParams() → [URLSearchParams, setParams(next | fn, { replace })]`
  - `saveNavState(to, state)`
- Produces (`src/client/test/router.jsx`): everything above plus `MemoryRouter({ initialEntries })`, `Routes`, `Route({ path, element })`.

- [ ] **Step 1: Install and write configs**

```bash
npm install next@^16.3.8
npm install -D @tailwindcss/postcss@^4.3.3 tailwindcss@^4.3.3
```

`next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false, // app.disable('x-powered-by')
  reactStrictMode: true,
  // Node-only packages stay external to the server bundle (native engines, require-time file access).
  serverExternalPackages: ['@prisma/client', '.prisma/client', 'bcryptjs', 'nodemailer', 'node-cron', 'swagger-ui-dist'],
};

export default nextConfig;
```

`postcss.config.mjs`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } };
```

Add `"build": "next build"` and `"start": "next start"` to `package.json` scripts.

- [ ] **Step 2: Failing adapter tests**

`src/client/__tests__/navigation.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate, useParams, useSearchParams } from '../test/router.jsx';

function Where() { const l = useLocation(); return <p data-testid="where">{l.pathname}{l.search}|{JSON.stringify(l.state)}</p>; }

test('Link navigates and NavLink marks the active route', async () => {
  render(
    <MemoryRouter initialEntries={['/farmer/dashboard']}>
      <NavLink to="/farmer/dashboard" className={({ isActive }) => (isActive ? 'on' : 'off')}>Dash</NavLink>
      <NavLink to="/farmer/risk">Risk</NavLink>
      <Link to="/farmer/risk?tab=2" state={{ from: 'x' }}>Go</Link>
      <Where />
    </MemoryRouter>,
  );
  expect(screen.getByText('Dash')).toHaveClass('on');
  expect(screen.getByText('Dash')).toHaveAttribute('aria-current', 'page');
  await userEvent.click(screen.getByText('Go'));
  expect(screen.getByTestId('where')).toHaveTextContent('/farmer/risk?tab=2|{"from":"x"}');
  expect(screen.getByText('Risk')).toHaveClass('active');
});

test('Navigate with state, useParams via Routes, useSearchParams setter', async () => {
  function Detail() {
    const { id } = useParams();
    const [params, setParams] = useSearchParams();
    const navigate = useNavigate();
    return (
      <div>
        <p data-testid="id">{id}:{params.get('tab') || 'none'}</p>
        <button onClick={() => setParams({ tab: 'notes' }, { replace: true })}>tab</button>
        <button onClick={() => navigate('/login', { replace: true, state: { from: '/admin/farms/9' } })}>out</button>
      </div>
    );
  }
  render(
    <MemoryRouter initialEntries={['/admin/farms/9']}>
      <Routes>
        <Route path="/admin/farms/:id" element={<Detail />} />
        <Route path="/login" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('id')).toHaveTextContent('9:none');
  await userEvent.click(screen.getByText('tab'));
  expect(screen.getByTestId('id')).toHaveTextContent('9:notes');
  await userEvent.click(screen.getByText('out'));
  expect(screen.getByTestId('where')).toHaveTextContent('/login|{"from":"/admin/farms/9"}');
});

test('Navigate redirects on mount; object entries carry state', () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/old', state: { identifier: 'a@b.c' } }]}>
      <Routes>
        <Route path="/old" element={<Navigate to="/new" replace state={{ keep: 1 }} />} />
        <Route path="/new" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByTestId('where')).toHaveTextContent('/new|{"keep":1}');
});
```

Run: `npm run test:client -- src/client/__tests__/navigation.test.jsx` → FAIL (modules missing).

- [ ] **Step 3: Implement the adapter**

`src/client/navigation.jsx`:

```jsx
'use client';
import { forwardRef, useCallback, useEffect, useMemo } from 'react';
import NextLink from 'next/link';
import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';

/**
 * React Router–compatible navigation on top of next/navigation, so page components keep their code.
 * Navigation `state` (e.g. ProtectedRoute's `from`) is kept in sessionStorage for the target path.
 */
const STATE_KEY = 'mwanimlinzi.navState';
const pathOf = (to) => String(typeof to === 'object' ? to.pathname || '' : to).split(/[?#]/)[0] || '/';
const hrefOf = (to) => (typeof to === 'object' ? `${to.pathname || ''}${to.search || ''}${to.hash || ''}` : to);

export function saveNavState(to, state) {
  try {
    if (state === undefined || state === null) sessionStorage.removeItem(STATE_KEY);
    else sessionStorage.setItem(STATE_KEY, JSON.stringify({ path: pathOf(to), state }));
  } catch { /* storage unavailable */ }
}
function readNavState(pathname) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null');
    return saved && saved.path === pathname ? saved.state : null;
  } catch { return null; }
}

export function useNavigate() {
  const router = useRouter();
  return useCallback((to, { replace = false, state } = {}) => {
    if (typeof to === 'number') { if (to < 0) router.back(); else router.forward(); return; }
    saveNavState(to, state);
    if (replace) router.replace(hrefOf(to)); else router.push(hrefOf(to));
  }, [router]);
}

export function useLocation() {
  const pathname = usePathname() || '/';
  const sp = useNextSearchParams();
  const qs = sp ? sp.toString() : '';
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  return useMemo(() => ({ pathname, search: qs ? `?${qs}` : '', hash, state: readNavState(pathname) }), [pathname, qs, hash]);
}

export function useParams() {
  return useNextParams() || {};
}

export function useSearchParams() {
  const sp = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname() || '/';
  const qs = sp ? sp.toString() : '';
  const params = useMemo(() => new URLSearchParams(qs), [qs]);
  const setParams = useCallback((next, { replace = false } = {}) => {
    const value = typeof next === 'function' ? next(new URLSearchParams(qs)) : next;
    const search = new URLSearchParams(value).toString();
    const href = search ? `${pathname}?${search}` : pathname;
    if (replace) router.replace(href, { scroll: false }); else router.push(href, { scroll: false });
  }, [qs, pathname, router]);
  return [params, setParams];
}

export const Link = forwardRef(function Link({ to, replace, state, onClick, ...rest }, ref) {
  return (
    <NextLink
      ref={ref}
      href={hrefOf(to)}
      replace={replace}
      onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) saveNavState(to, state); }}
      {...rest}
    />
  );
});

const isActivePath = (pathname, to, end) => {
  const path = pathOf(to);
  if (pathname === path) return true;
  if (end || path === '/') return false;
  return pathname.startsWith(path.endsWith('/') ? path : `${path}/`);
};

export const NavLink = forwardRef(function NavLink({ to, end = false, className, style, children, ...rest }, ref) {
  const pathname = usePathname() || '/';
  const isActive = isActivePath(pathname, to, end);
  const status = { isActive, isPending: false, isTransitioning: false };
  const cls = typeof className === 'function' ? className(status) : [className, isActive ? 'active' : null].filter(Boolean).join(' ') || undefined;
  return (
    <Link
      ref={ref}
      to={to}
      className={cls}
      style={typeof style === 'function' ? style(status) : style}
      aria-current={isActive ? 'page' : undefined}
      {...rest}
    >
      {typeof children === 'function' ? children(status) : children}
    </Link>
  );
});

export function Navigate({ to, replace = false, state }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to, { replace, state }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
```

- [ ] **Step 4: Test doubles for Next in Vitest**

`src/client/test/nextNavigation.jsx`:

```jsx
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

/** In-memory stand-in for next/navigation used by every client test. */
let loc = { pathname: '/', search: '' };
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
export function __setLocation(href) {
  const u = new URL(href, 'http://localhost');
  loc = { pathname: u.pathname, search: u.search };
  emit();
}
export function __reset() { loc = { pathname: '/', search: '' }; }
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => loc;
const useLoc = () => useSyncExternalStore(subscribe, snapshot, snapshot);

export const ParamsContext = createContext(null);
export const usePathname = () => useLoc().pathname;
export function useSearchParams() { const { search } = useLoc(); return useMemo(() => new URLSearchParams(search), [search]); }
export function useParams() { return useContext(ParamsContext) || {}; }
const router = {
  push: (href) => __setLocation(href),
  replace: (href) => __setLocation(href),
  back() {}, forward() {}, refresh() {}, prefetch() {},
};
export const useRouter = () => router;
export function redirect(href) { __setLocation(href); }
export function notFound() {}
```

`src/client/test/nextLink.jsx`:

```jsx
import { forwardRef } from 'react';
import { useRouter } from './nextNavigation.jsx';

const Link = forwardRef(function Link({ href, replace, prefetch: _p, scroll: _s, onClick, children, ...rest }, ref) {
  const router = useRouter();
  return (
    <a ref={ref} href={href} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) { e.preventDefault(); (replace ? router.replace : router.push)(href); } }} {...rest}>
      {children}
    </a>
  );
});
export default Link;
```

`src/client/test/nextDynamic.jsx`:

```jsx
import { lazy, Suspense } from 'react';

export default function dynamic(loader, { loading: Loading } = {}) {
  const Lazy = lazy(async () => { const m = await loader(); return { default: m.default ?? m }; });
  return function DynamicComponent(props) {
    return <Suspense fallback={Loading ? <Loading /> : null}><Lazy {...props} /></Suspense>;
  };
}
```

`src/client/test/router.jsx`:

```jsx
import { Children, isValidElement, useState } from 'react';
import { __setLocation, ParamsContext, usePathname } from './nextNavigation.jsx';
import { saveNavState } from '../navigation.jsx';

export * from '../navigation.jsx';

/** Test-only replacement for React Router's MemoryRouter/Routes/Route on top of the next/navigation double. */
export function MemoryRouter({ initialEntries = ['/'], children }) {
  useState(() => {
    const entry = initialEntries[initialEntries.length - 1];
    const href = typeof entry === 'object' ? `${entry.pathname || '/'}${entry.search || ''}` : entry;
    if (typeof entry === 'object' && entry.state !== undefined) saveNavState(href, entry.state);
    __setLocation(href);
    return null;
  });
  return children;
}

function match(pattern, pathname) {
  if (pattern === '*') return {};
  const p = pattern.split('/').filter(Boolean);
  const a = pathname.split('/').filter(Boolean);
  const splat = p[p.length - 1] === '*';
  if (splat ? a.length < p.length - 1 : a.length !== p.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i] === '*') { params['*'] = a.slice(i).join('/'); break; }
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Routes({ children }) {
  const pathname = usePathname();
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const params = match(child.props.path ?? '*', pathname);
    if (params) return <ParamsContext.Provider value={params}>{child.props.element}</ParamsContext.Provider>;
  }
  return null;
}

export function Route() { return null; }
```

`src/client/test/setup.js`:

```js
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

vi.mock('next/navigation', () => import('./nextNavigation.jsx'));
vi.mock('next/link', () => import('./nextLink.jsx'));
vi.mock('next/dynamic', () => import('./nextDynamic.jsx'));

afterEach(async () => {
  (await import('./nextNavigation.jsx')).__reset();
  try { sessionStorage.clear(); } catch { /* ignore */ }
});
```

Run: `npm run test:client -- src/client/__tests__/navigation.test.jsx` → PASS (3 tests).

- [ ] **Step 5: Repoint every `react-router-dom` import**

`scripts/migrate/rewrite-router-imports.mjs`:

```js
// Temporary migration helper: react-router-dom → src/client/navigation.jsx (tests → src/client/test/router.jsx).
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src', 'client');
const nav = path.join(root, 'navigation.jsx');
const testRouter = path.join(root, 'test', 'router.jsx');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|jsx)$/.test(e.name) ? [path.join(d, e.name)] : []));
let n = 0;
for (const file of walk(root)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes("'react-router-dom'")) continue;
  const isTest = /__tests__|\.test\.|[\\/]test[\\/]/.test(file);
  let rel = path.relative(path.dirname(file), isTest ? testRouter : nav).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  fs.writeFileSync(file, src.replaceAll("'react-router-dom'", `'${rel}'`));
  n += 1;
}
console.log(`[rewrite-router-imports] updated ${n} files`);
```

```bash
node scripts/migrate/rewrite-router-imports.mjs
git grep -n "react-router-dom" -- src
```

Expected: about 48 files updated. The grep shows only `src/client/App.jsx` and `src/client/main.jsx` (both removed in Step 6/Task 6).

- [ ] **Step 6: Layouts take `children`; providers; root layout**

In `ProtectedRoute.jsx`, `PublicLayout.jsx`, `FarmerLayout.jsx` and `AppLayout.jsx`:
- Add a `children` prop to the default export's parameters (e.g. `export default function FarmerLayout({ children })`).
- Replace each `<Outlet />` with `{children}`.
- Remove `Outlet` from the import list.

`ProtectedRoute.jsx` becomes:

```jsx
import { Navigate, useLocation } from '../navigation.jsx';
import { useAuth } from '../stores/AuthContext.jsx';
import { PageLoader, ErrorState } from '../components/ui/index.jsx';

/** Requires login; if `roles` is given, one of them (ADMIN always passes — superadmins see every tree). */
export default function ProtectedRoute({ roles, children }) {
  const { status, user, hasRole } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  if (roles && !hasRole(...roles, 'ADMIN')) {
    return <div className="p-6"><ErrorState error={{ status: 403 }} /></div>;
  }
  return user ? children : <PageLoader />;
}
```

`src/client/layouts/__tests__/ResponsiveLayouts.test.jsx` renders `<FarmerLayout />` with no children. That still works, because `{children}` renders nothing.

`app/providers.jsx` (former `main.jsx`, same QueryClient and persister settings):

```jsx
'use client';
import { useEffect, useState, Suspense } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { AuthProvider } from '../src/client/stores/AuthContext.jsx';
import { I18nProvider } from '../src/client/i18n/I18nProvider.jsx';
import { PageLoader } from '../src/client/components/ui/index.jsx';

const DAY = 24 * 60 * 60 * 1000;
const makeQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: DAY, // keep data long enough to be saved for offline use
      refetchOnWindowFocus: false,
      retry: (count, err) => count < 1 && !(err?.status >= 400 && err?.status < 500),
    },
    // Fail fast when offline instead of waiting silently; the UI shows the network error.
    mutations: { networkMode: 'always' },
  },
});

/**
 * Low-connectivity support: the farmer's own data (farms, risk, alerts, conditions) is saved in this
 * browser so the last known risk and advice stay visible without a connection. Logging out clears it.
 */
const OFFLINE_KEYS = new Set(['farms', 'farm', 'risks', 'farmAlerts', 'env', 'health', 'notifications']);
function makePersistOptions() {
  let storage;
  try { storage = window.localStorage; } catch { storage = undefined; }
  return {
    persister: createSyncStoragePersister({ storage, key: 'mwanimlinzi.cache' }),
    maxAge: DAY,
    buster: 'v2',
    dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && OFFLINE_KEYS.has(q.queryKey[0]) },
  };
}

/** The app is browser-only (localStorage auth, offline cache, Leaflet), like the former SPA's empty #root. */
export default function Providers({ children }) {
  const [client, setClient] = useState(null);
  useEffect(() => {
    // Scroll-reveal animations only run where they can finish (IntersectionObserver) and are wanted.
    if (typeof IntersectionObserver !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      document.documentElement.classList.add('motion-ok');
    }
    setClient({ queryClient: makeQueryClient(), persistOptions: makePersistOptions() });
  }, []);
  if (!client) return null;
  return (
    <PersistQueryClientProvider client={client.queryClient} persistOptions={client.persistOptions}>
      <I18nProvider>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>{children}</Suspense>
        </AuthProvider>
      </I18nProvider>
    </PersistQueryClientProvider>
  );
}
```

`app/layout.jsx` (former `index.html` + CSS imports from `main.jsx`):

```jsx
import '@fontsource-variable/manrope';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import 'leaflet/dist/leaflet.css';
import '../src/client/index.css';
import Providers from './providers.jsx';

export const metadata = {
  title: 'MwaniMlinzi AI',
  description: 'MwaniMlinzi AI — seaweed risk, harvest and decision support for Zanzibar. Know the risk. Know the next action.',
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#051f29',
};

export default function RootLayout({ children }) {
  return (
    <html lang="sw" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

`suppressHydrationWarning` is needed because `I18nProvider` sets `<html lang>` and the `motion-ok` class on the client.

```bash
git rm src/client/main.jsx frontend/index.html public/_redirects frontend/vercel.json
```

(`_redirects` and `vercel.json` were SPA fallback rules for static hosts; the App Router makes them dead files. This is not hosting work.)

- [ ] **Step 7: Browser env variable**

`src/client/api/client.js:20` and `src/client/pages/public/Partner.jsx:10`: replace `import.meta.env.VITE_API_URL` with `process.env.NEXT_PUBLIC_API_URL`. Next inlines it at build time. Vitest leaves it `undefined`, so the code falls back to `'/api'` as before.

Check: `git grep -n "import.meta.env" -- src app` → no output.

- [ ] **Step 8: Run the client suite**

Run: `npm run test:client`
Expected: PASS, with the same count as Task 1 plus 3. If a test fails:
- It asserted on `react-router` internals. Rewrite the assertion to match the visible behaviour; for example, a NavLink's active class still comes from its `className` function.
- It rendered `<App />`. That test belongs to Task 6; move it there.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(client): add Next root layout, providers and React Router-compatible navigation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: App Router pages and layouts

**Files:**
- Create: the `app/**` page and layout files in the table below, `app/not-found.jsx`, `src/client/components/map/{BaseMapTiles,FarmMap,LocationPicker}.client.jsx` (moved implementation), `tests/unit/pages.test.js`
- Modify: `src/client/components/map/{BaseMapTiles,FarmMap,LocationPicker}.jsx` (become `next/dynamic` wrappers)
- Delete: `src/client/App.jsx`
- Packages: remove `react-router-dom`

**Interfaces:**
- Consumes: `ProtectedRoute({ roles, children })`, `PublicLayout({ children })`, `FarmerLayout({ children })` and `AppLayout({ children })` from Task 5. Page components are the default exports under `src/client/pages/**`.
- Produces: the final URL map (spec invariant).

- [ ] **Step 1: Failing test that pins every URL**

`tests/unit/pages.test.js`:

```js
import fs from 'node:fs';
import path from 'node:path';

const appDir = path.join(process.cwd(), 'app');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'api' ? [] : walk(path.join(d, e.name))) : e.name === 'page.jsx' ? [path.join(d, e.name)] : []));
const toUrl = (file) => `/${path.relative(appDir, path.dirname(file)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join('/')}`.replace(/\[(\w+)\]/g, ':$1').replace(/\/$/, '') || '/';

const EXPECTED = [
  '/', '/about', '/how-it-works', '/login', '/register', '/forgot-password', '/reset-password', '/partner', '/app',
  '/farmer', '/farmer/dashboard', '/farmer/farm', '/farmer/risk', '/farmer/observations', '/farmer/harvest', '/farmer/history',
  '/farmer/records', '/farmer/assistant', '/farmer/alerts', '/farmer/settings',
  '/admin', '/admin/dashboard', '/admin/users', '/admin/field', '/admin/farms', '/admin/farms/:id', '/admin/risk-map', '/admin/reviews',
  '/admin/alerts', '/admin/forecast', '/admin/actions', '/admin/models', '/admin/settings', '/admin/audit', '/admin/tokens', '/admin/tma',
  '/admin/impact', '/tools/scenarios', '/account/settings', '/account/notifications',
];

test('App Router pages cover exactly the former React Router paths', () => {
  expect(walk(appDir).map(toUrl).sort()).toEqual([...EXPECTED].sort());
  expect(fs.existsSync(path.join(appDir, 'not-found.jsx'))).toBe(true);
});
```

Run: `npm run test:server -- tests/unit/pages.test.js` → FAIL.

- [ ] **Step 2: Layout files**

`app/(public)/layout.jsx`:

```jsx
'use client';
import PublicLayout from '../../src/client/layouts/PublicLayout.jsx';

export default function Layout({ children }) { return <PublicLayout>{children}</PublicLayout>; }
```

`app/farmer/layout.jsx`:

```jsx
'use client';
import ProtectedRoute from '../../src/client/layouts/ProtectedRoute.jsx';
import FarmerLayout from '../../src/client/layouts/FarmerLayout.jsx';

export default function Layout({ children }) {
  return <ProtectedRoute roles={['FARMER']}><FarmerLayout>{children}</FarmerLayout></ProtectedRoute>;
}
```

`app/(admin)/layout.jsx` (admin: system-wide control; shares every operator screen under /admin/* for continuity):

```jsx
'use client';
import ProtectedRoute from '../../src/client/layouts/ProtectedRoute.jsx';
import AppLayout from '../../src/client/layouts/AppLayout.jsx';

export default function Layout({ children }) {
  return <ProtectedRoute roles={['ADMIN']}><AppLayout>{children}</AppLayout></ProtectedRoute>;
}
```

`app/account/layout.jsx`:

```jsx
'use client';
import ProtectedRoute from '../../src/client/layouts/ProtectedRoute.jsx';
import AppLayout from '../../src/client/layouts/AppLayout.jsx';

export default function Layout({ children }) {
  return <ProtectedRoute><AppLayout>{children}</AppLayout></ProtectedRoute>;
}
```

`app/not-found.jsx`:

```jsx
'use client';
import PublicLayout from '../src/client/layouts/PublicLayout.jsx';
import NotFound from '../src/client/pages/public/NotFound.jsx';

export default function NotFoundPage() { return <PublicLayout><NotFound /></PublicLayout>; }
```

- [ ] **Step 3: Page files**

Every page file uses this template. `<rel>` is the relative path from the page file to `src/client/`, for example `../../../src/client` for `app/(public)/about/page.jsx`:

```jsx
'use client';
import Page from '<rel>/pages/<Component path>';

export default function Route() { return <Page />; }
```

| Page file | Component path |
|---|---|
| `app/(public)/page.jsx` | `public/Landing.jsx` |
| `app/(public)/about/page.jsx` | `public/About.jsx` |
| `app/(public)/how-it-works/page.jsx` | `public/HowItWorks.jsx` |
| `app/(public)/login/page.jsx` | `public/Login.jsx` |
| `app/(public)/register/page.jsx` | `public/Register.jsx` |
| `app/(public)/forgot-password/page.jsx` | `public/ForgotPassword.jsx` |
| `app/(public)/reset-password/page.jsx` | `public/ForgotPassword.jsx` |
| `app/(public)/partner/page.jsx` | `public/Partner.jsx` |
| `app/farmer/dashboard/page.jsx` | `farmer/Dashboard.jsx` |
| `app/farmer/farm/page.jsx` | `farmer/Farm.jsx` |
| `app/farmer/risk/page.jsx` | `farmer/Risk.jsx` |
| `app/farmer/observations/page.jsx` | `farmer/Observations.jsx` |
| `app/farmer/harvest/page.jsx` | `farmer/Harvest.jsx` |
| `app/farmer/history/page.jsx` | `farmer/History.jsx` |
| `app/farmer/records/page.jsx` | `farmer/RecordBook.jsx` |
| `app/farmer/assistant/page.jsx` | `farmer/Assistant.jsx` |
| `app/farmer/alerts/page.jsx` | `account/Notifications.jsx` |
| `app/farmer/settings/page.jsx` | `account/Settings.jsx` |
| `app/(admin)/admin/dashboard/page.jsx` | `admin/Dashboard.jsx` |
| `app/(admin)/admin/users/page.jsx` | `admin/Users.jsx` |
| `app/(admin)/admin/field/page.jsx` | `extension/Dashboard.jsx` |
| `app/(admin)/admin/farms/page.jsx` | `extension/Farms.jsx` |
| `app/(admin)/admin/farms/[id]/page.jsx` | `extension/FarmDetail.jsx` |
| `app/(admin)/admin/risk-map/page.jsx` | `extension/RiskMap.jsx` |
| `app/(admin)/admin/reviews/page.jsx` | `extension/Reviews.jsx` |
| `app/(admin)/admin/alerts/page.jsx` | `cooperative/Alerts.jsx` |
| `app/(admin)/admin/forecast/page.jsx` | `cooperative/Forecast.jsx` |
| `app/(admin)/admin/actions/page.jsx` | `admin/Actions.jsx` |
| `app/(admin)/admin/models/page.jsx` | `admin/Models.jsx` |
| `app/(admin)/admin/settings/page.jsx` | `admin/Settings.jsx` |
| `app/(admin)/admin/audit/page.jsx` | `admin/Audit.jsx` |
| `app/(admin)/admin/tokens/page.jsx` | `admin/AccessTokens.jsx` |
| `app/(admin)/admin/tma/page.jsx` | `admin/TmaBulletin.jsx` |
| `app/(admin)/admin/impact/page.jsx` | `shared/Impact.jsx` |
| `app/(admin)/tools/scenarios/page.jsx` | `tools/WhatIf.jsx` |
| `app/account/settings/page.jsx` | `account/Settings.jsx` |
| `app/account/notifications/page.jsx` | `account/Notifications.jsx` |

Redirect pages are server components (no `'use client'`). The layout's ProtectedRoute still guards the target, as `<Navigate>` inside the protected tree did.

`app/farmer/page.jsx`:

```jsx
import { redirect } from 'next/navigation';

export default function FarmerIndex() { redirect('/farmer/dashboard'); }
```

`app/(admin)/admin/page.jsx`:

```jsx
import { redirect } from 'next/navigation';

export default function AdminIndex() { redirect('/admin/dashboard'); }
```

`app/app/page.jsx` (HomeRedirect, outside every layout like the old `/app` route):

```jsx
'use client';
import { Navigate } from '../../src/client/navigation.jsx';
import { useAuth } from '../../src/client/stores/AuthContext.jsx';
import { PageLoader } from '../../src/client/components/ui/index.jsx';

export default function HomeRedirect() {
  const { status, homePath } = useAuth();
  if (status === 'loading') return <PageLoader />;
  return <Navigate to={status === 'authenticated' ? homePath : '/login'} replace />;
}
```

Run: `npm run test:server -- tests/unit/pages.test.js` → PASS.

- [ ] **Step 4: Leaflet stays browser-only**

For each of `BaseMapTiles`, `FarmMap` and `LocationPicker`:

```bash
git mv src/client/components/map/FarmMap.jsx src/client/components/map/FarmMap.client.jsx
```

Inside the three `*.client.jsx` files, change sibling imports to the `.client.jsx` names (e.g. `./BaseMapTiles.jsx` → `./BaseMapTiles.client.jsx`). Then create each public wrapper with the original name. Example `src/client/components/map/FarmMap.jsx`:

```jsx
'use client';
import dynamic from 'next/dynamic';

/** Leaflet touches `window` at import time, so the map loads only in the browser. */
export default dynamic(() => import('./FarmMap.client.jsx'), { ssr: false });
```

If a `*.client.jsx` file has named exports besides the default (`git grep -n "^export " src/client/components/map`), move those named exports into a sibling `*.shared.js` without Leaflet imports and re-export them from the wrapper. Consumers and the existing `vi.mock('…/components/map/FarmMap.jsx')` calls keep working unchanged.

- [ ] **Step 5: Remove the React Router app**

```bash
git rm src/client/App.jsx
npm uninstall react-router-dom
git grep -n "react-router" -- src app tests
```

Expected: no output.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully` and a route list that includes every page and `ƒ /api/...` handler.

Typical failures and their fixes:
- `window is not defined` / `localStorage is not defined` during "Collecting page data". A module touches the browser at import time. Wrap the access in a function or `typeof window !== 'undefined'` check, or load the component through `next/dynamic` with `ssr: false` (as in Step 4).
- `useSearchParams() should be wrapped in a suspense boundary`. Wrap that page file's `<Page />` in `<Suspense fallback={null}>`.
- Prisma client not found. Run `npx prisma generate` and confirm `serverExternalPackages` in `next.config.mjs`.

- [ ] **Step 7: Run every test suite**

```bash
npm run test:server && npm run test:client
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(client): route every screen through the Next App Router

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Local dev scripts and docs for the single process

**Files:**
- Modify: `scripts/dev.mjs`, `scripts/dev-service.mjs`, `scripts/app-status.mjs`, `scripts/always-on.mjs`, `scripts/tests/dev.test.mjs`, `scripts/tests/always-on.test.mjs`, `README.md`, `docs/ARCHITECTURE.md`, `../package.json` (workspace wrapper one level up, outside this git repo)
- Not touched: `docs/DEPLOYMENT.md`, `scripts/install-autostart.ps1` (it calls `npm run start:local`, unchanged)

**Interfaces:**
- Consumes: `GET /api` banner (`data.name === 'MwaniMlinzi AI API'`) and `GET /api/health` (`data.database === 'ok'`).
- Produces:
  - `npm run dev` runs one supervised `next dev` on `MWANI_PORT || PORT || 5173`.
  - The background runner reports `{ name: 'MwaniMlinzi AI runner', appPort }`.

- [ ] **Step 1: Update the tests first**

In `scripts/tests/dev.test.mjs`:
- Drop the backend/frontend port pair; use one random `appPort`, passed to the child as `MWANI_PORT`.
- `ready()` waits for `[dev] SUCCESS:`, then asserts `GET http://localhost:${appPort}/api/health` → 200 with `data.database === 'ok'`, and `GET /login` → 200 with `<title>MwaniMlinzi AI</title>` in the HTML.
- Keep the first test's loop (normal stop, duplicate launch reuses the running app, abrupt kill, restart). The duplicate run asserts `/Reusing the running app/`.
- Replace the two "occupied port" tests with one: an unrelated server on `appPort` → exit code 1 and output matching `/app port \d+ is already in use by another program/`.
- Delete the "standalone API listen failure" test (there is no separate API process now).

In `scripts/tests/always-on.test.mjs`, apply the same single-port change: status JSON has `appPort`, and there is one service.

Run: `npm run test:dev` → FAIL (scripts still start two services).

- [ ] **Step 2: Update the scripts**

`scripts/app-status.mjs`: replace `appStatus` with:

```js
export async function appStatus(service) {
  let owned = false;
  const controller = new AbortController();
  // Keep the startup deadline referenced until fetch/body reads settle (see git history for the exit-code-13 note).
  const deadline = setTimeout(() => controller.abort(), 5000);
  try {
    const origin = `http://localhost:${service.port}`;
    const response = await fetch(`${origin}/api`, { signal: controller.signal });
    if (!response.ok) return { owned: false, healthy: false };
    owned = (await response.json()).data?.name === 'MwaniMlinzi AI API';
    if (!owned) return { owned: false, healthy: false };
    const health = await fetch(`${origin}/api/health`, { signal: controller.signal });
    return { owned: true, healthy: health.ok && (await health.json()).data?.database === 'ok' };
  } catch {
    // A slow health check does not change the identity we already verified.
    return { owned, healthy: false };
  } finally {
    clearTimeout(deadline);
  }
}
```

`scripts/dev-service.mjs`: replace the `commands` map and `cwd`:

```js
const name = process.argv[2];
const port = process.env.MWANI_PORT || process.env.PORT || '5173';
const commands = {
  app: [
    'node_modules/next/dist/bin/next',
    ...(process.env.MWANI_ALWAYS_ON === '1' ? ['start'] : ['dev']),
    '--port', port, '--hostname', 'localhost',
  ],
};
```

and `cwd: fileURLToPath(new URL('../', import.meta.url)),`. The rest (taskkill tree stop, signal handling) is unchanged.

When always-on uses `next start`, it needs a production build. The always-on runner runs `npm run build` once when `.next/BUILD_ID` is missing, before spawning, using `spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { cwd: root, stdio: 'inherit' })`.

`scripts/dev.mjs`, top section:

```js
const root = new URL('../', import.meta.url);
const port = Number(process.env.MWANI_PORT || process.env.PORT || 5173);
const services = [{ name: 'app', port, host: 'localhost' }];

if (!existsSync(new URL('node_modules/', root))) {
  console.error('[dev] Missing dependencies. Run: npm install');
  process.exit(1);
}
if (!existsSync(new URL('.env', root))) {
  console.error('[dev] Create .env from .env.example and configure DATABASE_URL and JWT_SECRET.');
  process.exit(1);
}
```

In the rest of the file:
- Delete `backendOnly`, `frontendArgs`, the `env` import and the `VITE_PROXY_TARGET` env entry.
- The spawn passes `['app', ...process.argv.slice(2)]` with `env: { ...process.env, MWANI_PORT: String(port) }`.
- The error text reads ``The ${service.name} port ${service.port} is already in use by another program.`` (it becomes "app port").
- The success line reads `[dev] SUCCESS: app ready; database connected.` followed by `[dev] Login: http://localhost:${port}/login`.
- `backgroundStatus` comparisons use `background?.appPort === service.port`.

`scripts/always-on.mjs`:
- Delete the `env` import.
- `services = [{ name: 'app', port: Number(process.env.MWANI_PORT || process.env.PORT || 5173), host: 'localhost' }]`.
- The status reply is `{ name: 'MwaniMlinzi AI runner', appPort: services[0].port }`.
- The spawn env is `{ ...process.env, MWANI_ALWAYS_ON: '1', MWANI_PORT: String(services[0].port) }`.
- Add the build-once check described above.
- The final log is ``Monitoring the app server. Open http://localhost:${services[0].port}/login``.

- [ ] **Step 3: Run the script tests**

Run: `npm run test:scripts`
Expected: PASS. These tests start real servers against the dev database, so PostgreSQL must be running.

- [ ] **Step 4: Docs (code layout only)**

Make these edits:
- `README.md`: the quick start becomes `npm install` → `cp .env.example .env` → `npx prisma migrate deploy` → `npm run seed` → `npm run dev` → open `http://localhost:5173`. Replace the folder overview with the File Structure tree above, and the test commands with `npm test` / `test:server` / `test:client`. Do not add hosting instructions.
- `docs/ARCHITECTURE.md`: the browser box becomes "Next.js App Router (client components)". The API box becomes "Next.js Route Handlers (`app/api/**`) → `defineRoute` pipeline (rate limit · body · authenticate · authorize · zod validate · errors)". "node-cron" now starts from `instrumentation.js`. Replace the "Repository layout" block with the File Structure tree.

One level up, outside the git repo, edit `E:\PROJECTS\MwaniMvuvi AI\package.json`: `build` becomes `npm --prefix MwaniMlinzi-AI run build` and `test` becomes `npm --prefix MwaniMlinzi-AI test`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(dev): run the single Next.js process from the local dev scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Verification gate and cleanup

**Files:**
- Delete: `frontend/`, `backend/` (only untracked leftovers such as `.env` should remain by now; any tracked leftovers are removed here), `scripts/migrate/`
- Modify: `package.json` (remove `vite` from devDependencies only if `vitest` does not need it; `vitest` peers on `vite`, so keep it)

- [ ] **Step 1: Full automated gate**

```bash
npm run lint
npm test
npm run build
```

Expected: lint exits 0, every suite passes, and the build succeeds. Fix any failures before continuing. Do not skip.

- [ ] **Step 2: Smoke run (record the results in the PR or handoff message)**

```bash
npm run build && npx next start --port 5173
```

Check by hand in the browser and with curl:

1. `http://localhost:5173/` shows the landing page in Kiswahili. `/about` and `/how-it-works` render.
2. Log in as the demo Farmer. You land on `/farmer/dashboard`, and the bottom nav works. Reload `/farmer/history?…`: the page reloads on the same URL.
3. Log out, open `http://localhost:5173/admin/farms`, and get sent to `/login`. Log in as Admin and land back on `/admin/farms`. Open a farm (`/admin/farms/<id>`), then open the map on `/admin/risk-map`.
4. Farmer → Observations → add a photo and save. The image displays; the `GET /api/uploads/<id>` request returns 200 `image/*`.
5. USSD: `curl -s -X POST "http://localhost:5173/api/integrations/africastalking/ussd?secret=$AT_CALLBACK_SECRET" -H "content-type: application/x-www-form-urlencoded" --data "sessionId=s1&serviceCode=*384*64265%23&phoneNumber=%2B255700000000&text="` prints `CON …`.
6. `http://localhost:5173/api/docs` shows Swagger UI listing the endpoints.
7. Admin → Settings/Jobs → "Run now" on one job. It succeeds, and a new row appears in the job list.
8. Start with `ENABLE_JOBS=true`; the log shows `[jobs] scheduled N jobs`. Start with `ENABLE_JOBS=false`; it does not.
9. Turn the network off in DevTools and reload `/farmer/dashboard`. The last known risk still shows, which confirms the offline cache.

- [ ] **Step 3: Remove the old folders and migration helpers**

```bash
git ls-files frontend backend
```

Expected: empty. Otherwise `git rm -r` those leftovers.

```bash
rm -rf frontend backend scripts/migrate
git status --short
```

Do not delete untracked secrets without moving them first. Make sure `.env` exists at the root before deleting `backend/.env`.

- [ ] **Step 4: Final run and commit**

```bash
npm test && npm run build
git add -A
git commit -m "chore: remove the pre-Next.js frontend and backend folders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
