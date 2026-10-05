# Next.js migration — design

Date: 2026-10-05
Status: approved in conversation, awaiting written-spec review

## Goal

Convert the whole MwaniMlinzi AI system — today a Vite/React SPA (`frontend/`) plus an Express API (`backend/`) — into
**one native Next.js application** (App Router) with **no change in functionality**. The database stays
**PostgreSQL** with the existing Prisma schema and migrations.

## Scope

In scope: code only — pages, API, jobs, startup, tests, `package.json` scripts, README/ARCHITECTURE notes on the new
layout.

Out of scope (explicitly excluded by the owner): hosting, deployment, PM2/Nginx/Vercel configuration, and
`docs/DEPLOYMENT.md`. Database schema changes. New features, redesigns, refactors unrelated to the migration.

## Invariants (must not change)

- Every URL: page paths (`/`, `/login`, `/farmer/*`, `/admin/*`, `/admin/farms/:id`, `/account/*`, `/tools/scenarios`,
  `/app`, `/partner`, `/reset-password`, 404 page) and every API path (`/api/*`, including `/api/ussd/MwaniMlinzi`,
  `/api/integrations/africastalking/*`, `/api/integrations/sarufi/webhook`, `/api/docs`, `/api/docs.json`, `/api/health`).
- API contract: methods, status codes, `{ success, data, message }` / `{ success: false, error: { code, message, details? } }`
  bodies, `text/plain` `CON …`/`END …` USSD replies, rate-limit windows and limits, 429 bodies, upload limits
  (`MAX_UPLOAD_MB`, jpeg/png/webp, one file), JWT bearer auth with the user reloaded from PostgreSQL on every request,
  role rules (`FARMER`, `ADMIN`), CORS allow-list behaviour, query-string secret redaction in logs.
- UI: same screens, look, behaviour, Kiswahili-default i18n, localStorage auth token, offline React Query persistence
  (same keys, `buster: 'v2'`), Leaflet maps, Recharts charts, lazy loading.
- Data: same Prisma schema, migrations, seed, `DATABASE_URL`. Scheduled jobs: same schedules, timezone
  `Africa/Dar_es_Salaam`, `ENABLE_JOBS` switch, manual "Run now".
- Environment variables keep their names, except browser-exposed `VITE_*` → `NEXT_PUBLIC_*`
  (`VITE_API_URL` → `NEXT_PUBLIC_API_URL`; default stays `/api`, now same-origin so no proxy is needed).

## Target layout

```
MwaniMlinzi-AI/
├── app/                         Next.js App Router
│   ├── layout.jsx               root: fonts, global CSS, Leaflet CSS, <Providers>
│   ├── providers.jsx            'use client': React Query + offline persister, I18nProvider, AuthProvider
│   ├── not-found.jsx            NotFound inside PublicLayout
│   ├── (public)/layout.jsx      PublicLayout; pages: /, about, how-it-works, login, register,
│   │                            forgot-password, reset-password, partner
│   ├── app/page.jsx             HomeRedirect
│   ├── farmer/layout.jsx        Protected(FARMER) + FarmerLayout; 10 pages + /farmer → /farmer/dashboard
│   ├── (staff)/layout.jsx       Protected(ADMIN) + AppLayout; admin/* (16 pages incl. farms/[id]),
│   │                            tools/scenarios; /admin → /admin/dashboard
│   ├── account/layout.jsx       Protected(any) + AppLayout; settings, notifications
│   └── api/**/route.js          one Route Handler file per API path (104 endpoints)
├── src/
│   ├── client/                  former frontend/src minus main.jsx/App.jsx (components, hooks, i18n,
│   │                            layouts, pages bodies, api client, stores, utils, test setup)
│   └── server/                  former backend/src minus app.js/server.js/routes/middleware-as-express
│       ├── http/                defineRoute wrapper, ctx, errors→Response, rate limiter, body/multipart parsing, logging
│       ├── controllers/         same functions, ctx instead of (req, res)
│       ├── services/ ai/ rules/ providers/ validators/ jobs/ config/ utils/ db/   moved unchanged
├── prisma/                      moved from backend/prisma unchanged
├── tests/                       former backend/tests (Jest) — server unit + integration
├── instrumentation.js           boot: DB connect check, pending-migration warning, start scheduler
├── next.config.mjs              security headers (helmet-equivalent), serverExternalPackages for prisma
├── postcss.config.mjs           Tailwind v4 via @tailwindcss/postcss
├── vitest.config.mjs            client tests (jsdom)
├── ai/  docs/  scripts/
└── package.json                 single app: dev / build / start / test / lint / prisma / seed / ai:train …
```

Page files under `app/` are thin: `'use client'` wrappers that render the existing page component from
`src/client/pages/...`. Layout behaviour (bottom nav, sidebar, protected redirect) stays in the existing layout components,
adapted from `<Outlet/>` to `{children}`.

## API design

### `defineRoute(options, controller)` — `src/server/http/defineRoute.js`

Returns a Next Route Handler `(request, { params }) => Response`. Runs, in today's middleware order:

1. CORS: if `Origin` is present and not allowed by `isAllowedOrigin(origin, env)`, respond as cors() does today (no
   CORS headers); allowed origins get `Access-Control-Allow-Origin`. `OPTIONS` preflight handled by an exported
   `OPTIONS` from the same helper.
2. Rate limit(s): `api` (15 min/1500) for everything under `/api` except integrations; plus per-route `auth`
   (15 min/30), `ai` (1 min/30), `location` (1 min/20); `integration` (1 min/300, plain-text 429). In-memory
   fixed-window store keyed by client IP (`x-forwarded-for` first hop, as Express `trust proxy 1`), disabled-in-effect
   in tests exactly like today (limit 100000). Emits `RateLimit` draft-7 headers.
3. Body parsing: JSON (limit 200kb → 413 `PAYLOAD_TOO_LARGE`; malformed → 400 `Malformed JSON body`),
   `application/x-www-form-urlencoded` (50kb), `multipart/form-data` via `request.formData()` when `upload` is set
   (single field name as today, size limit → 400 `UPLOAD_ERROR` `File is too large`, disallowed mime ignored like
   multer's fileFilter). The file is exposed as `{ buffer, mimetype, originalname, size }` — the multer shape the
   services already consume.
4. Auth (`auth: true` or `roles`): same Bearer check and `loadUser`, same 401/403 messages.
5. Validation (`validate: [{ schema, part, partial }]`): same logic as today's `validate`, result on `ctx.valid`.
6. Controller `(ctx) => Response | Promise<Response>`.
7. Errors: the existing `errorHandler` mapping moved to `toErrorResponse(err, ctx)` (multer branch replaced by the upload
   error). Logging of 5xx unchanged.
8. Access log line (non-test) with secrets redacted using today's regex.

`ctx` = `{ request, method, path, originalUrl, params, query, body, valid, user, file, ip, headers, get(name) }`.
`query` is a plain object built from `URLSearchParams` (repeated keys → arrays, as Express's default parser does for
the cases used). `ok/created` in `utils/response.js` return `Response.json(...)` with the same status/bodies;
`res.setHeader` / `res.sendFile` call sites become explicit `new Response(...)` with headers / file stream.

Unknown `/api/*` paths: `app/api/[...notFound]/route.js` returns today's 404 JSON
(`Route METHOD /api/... not found`). Wrong method on a known path returns the same 404 shape.

The Express `GET /` JSON banner moves to `GET /api` (same body), because `/` on the single origin is the landing page,
exactly as on today's frontend origin.

`/api/docs`: a Route Handler returning a small HTML page loading `swagger-ui-dist` from cdnjs against
`/api/docs.json` (same spec object).

### Integration tests

`tests/helpers/request.js` provides a supertest-like `request(method, url, { headers, body, form, file })` that
resolves the URL against the `app/api` file tree (static segments before `[param]`, then `[...catchAll]`), imports the
route module, builds a `Request`, calls the exported method with `{ params: Promise.resolve(params) }`, and returns
`{ status, headers, body, text }`. Existing assertions stay as written; only the call sites change.

## Pages design

- React Router → Next: `Link`/`NavLink` → `next/link` (+ `usePathname` for active state), `useNavigate` →
  `useRouter().push/replace`, `useParams` → `next/navigation` `useParams`, `useSearchParams` → `next/navigation`
  (read-only; writes via `router.replace` with new query), `useLocation` → `usePathname` + `useSearchParams`,
  `<Navigate>` → `redirect()` in server page files or `router.replace` in client effects, `<Outlet/>` → `children`.
- `ProtectedRoute` keeps its logic (loading → `PageLoader`, unauthenticated → `/login` with return path, wrong role →
  home path) as a client wrapper used by the protected layouts.
- Leaflet components loaded through `next/dynamic(..., { ssr: false })`. Anything touching `window`/`localStorage`
  at module scope moves inside effects or guarded checks.
- `main.jsx` setup (motion-ok class, QueryClient defaults, persister) moves to `app/providers.jsx` unchanged in
  behaviour.
- Fonts via the existing `@fontsource-variable/*` CSS imports in the root layout.
- `import.meta.env.VITE_API_URL` → `process.env.NEXT_PUBLIC_API_URL`.

## Jobs and startup

`instrumentation.js` `register()` (Node runtime only, not during `next build`): connect Prisma, log, run
`warnOnPendingMigrations`, then `startScheduler()` if `env.enableJobs`; register SIGINT/SIGTERM handlers that destroy
cron tasks and disconnect Prisma. A module-level guard prevents double registration in dev hot-reload.

## Testing

- Server: Jest (existing config, globalSetup/teardown, test PostgreSQL) for all 27 unit + integration files; imports
  repointed to `src/server/...`; integration tests use the new request helper.
- Client: Vitest + jsdom + Testing Library for existing client tests, with a shared `next/navigation` mock.
- Workspace `scripts/tests/*.test.mjs` updated for the single-process dev script.

## Completion gate

All server and client tests pass, `npm run lint` passes, `next build` succeeds, and a local smoke run works: landing
page, login as Farmer and Admin, farmer dashboard, admin map, photo observation upload, a USSD callback via curl,
`/api/docs`, one job via "Run now". Only then are `frontend/` and `backend/` deleted.

## Risks

- Hidden React Router usages (e.g. `state` on navigate, `useMatch`) — inventoried during the plan; `state` replaced
  by query params or sessionStorage where used.
- Prisma/ESM bundling in Next — handled by `serverExternalPackages: ['@prisma/client', 'bcryptjs', 'nodemailer']`
  and Node runtime on every route (`export const runtime = 'nodejs'`).
- In-memory rate limit is per process — same as today's express-rate-limit default store.
