# MwaniMlinzi AI

**Know the risk. Know the next action.** · *Jua hatari. Jua hatua inayofuata.*

MwaniMlinzi AI is a Zanzibar-focused, AI-assisted **seaweed farming risk, harvest and decision-support platform**.
It combines farm data, environmental data and farmer observations to answer one question:

> "Given my farm, crop stage and current environmental conditions, what should I do during the next 24–72 hours?"

```
FARM DATA + ENVIRONMENTAL DATA + FARMER OBSERVATIONS
        → AI RISK PREDICTION → EXPLANATION → VALIDATED ACTION
        → FARMER RESPONSE → OUTCOME → FUTURE LEARNING DATA
```

Everything in that loop is real backend logic stored in PostgreSQL — no mock UI, no hard-coded risk values.

| Layer | Technology |
|---|---|
| App | One Next.js 16 app (App Router): React 19 client components, TanStack Query, Tailwind CSS, Recharts, Leaflet + OpenStreetMap |
| API | Next.js Route Handlers (`app/api/**`) on Node.js (≥20.9), JavaScript (ES modules), Prisma ORM, Zod, JWT, bcryptjs, rate limiting, node-cron, SMTP email |
| Database | PostgreSQL (managed with pgAdmin) |
| AI | Rule-based risk engine (always on) + optional dependency-free JavaScript logistic regression, with an optional Python LightGBM / XGBoost microservice (`ai/ml-service/`) that the server prefers when it is reachable; Action Engine; optional LLM for explanation/translation only |
| Runtime | No Docker. `npm` + PostgreSQL on Windows, Linux or macOS |

The database has **29 application tables (30 including Prisma migration history)**. See [the database guide](docs/DATABASE.md#schema-overview) for the consolidated schema and data-preserving migration.

## What is built

- **Roles:** **Farmer** and **Admin** only. Farmers access their own farms and records. Admins manage all farms, cooperatives, field reviews and system settings. JWT authentication, role checks and ownership checks protect every endpoint.
- **Self-registration:** farmers register on the web (phone number + password, optional cooperative) or through the USSD menu, then add their farm on a map; risk is calculated straight away.
- **Farms & records:** farm profiles with locations, planting cycles (crop age always derived from the planting date), an observation wizard with optional photo upload, harvests (expected vs actual, difference, loss %), losses, quality, drying.
- **Environmental data:** live weather (Open-Meteo by default) and ocean data (Open-Meteo Marine by default), both free and keyless, with **LIVE → CACHED → no reading** fallback. Every record stores its `source` and provider; missing values stay empty and are never invented.
- **AI risk engine:** four risks — Heat/Ice-Ice, Storm/Line damage, Poor growth, Harvest window — each with probability, level (thresholds stored in PostgreSQL), confidence, horizon and **structured, explainable factors**.
- **Hybrid ML (optional):** the rule-based engine is the default. The training pipeline (`ai/scripts`) learns only from recorded field outcomes (predictions labelled by what farmers later reported) and refuses to train until there are enough of them. Models are registered in PostgreSQL with held-out precision/recall/F1/confusion matrix and are only used when an admin activates them. The UI always shows which model produced a prediction.
- **Action Engine:** recommendations come **only** from the curated, bilingual Action Library (validated by the admin with local experts). The LLM can never invent farming actions.
- **Alerts & notifications:** high/critical heat and storm, poor growth, harvest window, risk increases, missing reports → in-app notifications, plus **real SMS through Africa's Talking** for important events only (HIGH/CRITICAL risk, harvest reminders), respecting each user's SMS preferences. Every SMS is logged with provider status (QUEUED/SENT/DELIVERED/FAILED/NOT_CONFIGURED) and delivery reports.
- **Feedback loop:** prediction → recommendation → farmer action → outcome → automatic model-feedback label → field evaluation metrics and future training data.
- **Dashboards:**
  - Mobile-first **farmer** app (English/Kiswahili) — current risk in plain words, next action, record book.
  - **Admin** console — users, action library, models, TMA bulletin uploader, access tokens for buyer/NGO exports, impact dashboard (slide-11 targets live), settings, audit log, jobs.
  - **Partner view** at `/partner` — a public page where a buyer, programme or NGO pastes their signed access token and sees the cooperative aggregates they are authorised to see; no login, nothing farmer-identifying.
- **Daily farm tools:** *Today at sea* — the next daylight low tide with the best hours to work, and whether today is good for drying seaweed (Good / Caution / Bad from the live rain forecast, with approved advice to keep seaweed off the ground), on the web, USSD and — for farms at harvest when rain is likely — by SMS. Calculated every morning at 06:00 (and refreshed at 14:00) from Open-Meteo forecasts for each farm's point.
- **Record book:** sales (kg × price, buyer, paid / not yet paid), costs by category and daily work, per planting — with income, costs, **profit**, money still owed and unsold stock, all from the farmer's own entries. On the web (*Record book*, dashboard *This season* card) and on any phone via USSD (*4 Rekodi mavuno → Mauzo / Gharama / Kazi*, *1 → 3 Faida ya msimu*).
- **SMS & USSD (Africa's Talking):** a real USSD application with the menu *1 Hali ya shamba · 2 Tahadhari · 3 Ripoti tatizo · 4 Rekodi mavuno · 5 Msaada* (risk and action, low tide and drying, alerts, symptom reports, harvest, advice, language), consent at registration, sessions stored in PostgreSQL, and incoming SMS commands. Sandbox first; see [docs/AFRICASTALKING.md](docs/AFRICASTALKING.md). There are no web simulators.
- **English | Kiswahili** everywhere (web, SMS, USSD). The choice is saved in the browser and in the user's profile. Farmers register and log in with their phone number (any Tanzanian format).
- **Simple farmer dashboard:** current risk in words + icon + colour, plain-language reasons, the next action and when to do it; technical values stay under *See details / Angalia maelezo*. Works on low connectivity: the last saved information stays visible offline.
- **AI assistant** grounded in the farmer's own records, and an admin **What-if planner** that re-runs the full pipeline with modified conditions (stored as simulations, never shown as real risk or sent to farmers).

## Quick start (development)

Prerequisites: **Node.js 20.9+ (22 recommended)**, **PostgreSQL 14+**, **pgAdmin 4** (optional but recommended). Email password recovery requires an SMTP sender; see [EMAIL.md](docs/EMAIL.md).
The server needs outbound internet access for live weather and ocean data.

```bash
# 1. Database — create an empty database called `mwanimlinzi` (pgAdmin steps: docs/DATABASE.md)

# 2. Install, configure, migrate, seed
npm install
cp .env.example .env            # Windows: copy .env.example .env
#    edit .env → set DATABASE_URL and a long random JWT_SECRET
npx prisma migrate deploy       # creates all tables
npm run seed                    # reference data + first admin (non-destructive)

# 3. Start the app
npm run dev                     # one Next.js process on :5173; Ctrl+C stops it
```

Then open http://localhost:5173. Use `npm.cmd run dev` in either `MwaniMvuvi AI` or `MwaniMlinzi-AI` for everyday development.
The command checks server and database health, reuses an already running app, and prints `SUCCESS`
with the login URL. Repeating it while automatic startup is active does not launch a duplicate server.
An unrelated program occupying the app port still produces a clear error. Set `MWANI_PORT` (or `PORT`)
to use a different port.

After closing the dev terminal or restarting your computer, open a terminal in `MwaniMlinzi-AI` and run
`npm run dev` again before opening http://localhost:5173. The launcher stops the server's process tree on
Ctrl+C and also cleans it up if its terminal is closed abruptly. It reports an occupied port instead
of silently moving to a different URL. Keep the PostgreSQL service running.
If PowerShell blocks `npm.ps1`, use `npm.cmd run dev` (no execution-policy change needed).

For everyday use on Windows, enable background startup once from the project root:

```powershell
npm.cmd run autostart:install
```

The app starts immediately and at each Windows sign-in, independently of development terminals.
The background runner serves a production build (`next start`), building it once if none exists,
and restarts the app within a few seconds if it exits. It leaves a separately started server
alone and takes over when its port becomes free. PostgreSQL must
remain running (set its Windows service to Automatic). Open http://localhost:5173/login.
Logs are saved in `.local/server.log` and `.local/server-error.log`. To disable automatic startup,
run `npm.cmd run autostart:remove`. Use `npm.cmd run stop:local` to stop the runner without removing
automatic startup, for example before switching to `npm run dev` for code changes.
After code changes, run `npm run build` before restarting the background runner so it serves the new build.
The app retries login briefly during temporary server or database interruptions; incorrect passwords
are reported immediately. An ongoing outage still shows an error after the bounded retries.

To verify startup, repeated commands, shutdown, abrupt-close recovery and occupied-port handling,
run `npm run test:dev`. These checks use a separate port and leave the running app available.
They check the existing database's health without changing its data.

| | URL |
|---|---|
| App | http://localhost:5173 |
| API | http://localhost:5173/api |
| API documentation (Swagger UI) | http://localhost:5173/api/docs |
| Health check | http://localhost:5173/api/health |

### What `npm run seed` does

It never deletes anything and is safe to re-run. It upserts roles, permissions, the two seaweed species, default
settings and the starter Action Library (expert edits and validations are preserved), and ensures one demo account for
each of the two roles:

- email: `ADMIN_EMAIL` (default `admin@mwanimlinzi.local`)
- password: `ADMIN_PASSWORD` (at least 12 characters), or — if empty — a generated password printed once and saved to
  `DEMO_CREDENTIALS.local.txt` (git-ignored). Change it after the first login.
- farmer: `farmer@mwanimlinzi.local`, with a generated password and an initialized farmer profile linked to the demo cooperative. Existing passwords are preserved. These `.local` demo addresses cannot receive real email; use a real account email to test recovery.

The seed updates unchanged, unvalidated starter support labels to refer to Admin. No farms, observations, sales or environmental readings are created by the seed. Other farmers register themselves.

### First run

1. `npm run seed`, then log in at http://localhost:5173/login as the admin (credentials above).
2. Log out and register a farmer on **/register** with a phone number and password.
3. As the farmer, **add a farm**: location on the map (or GPS), species, number of lines and planting date.
4. The risk is calculated immediately with **live Zanzibar weather and ocean data**; the reading is labelled with its
   source and provider.
5. **Record a report** (e.g. whitening on 30 % of lines). The risk is recalculated and the reasons update.
6. Log in as admin → **Field operations**: the farm, its risk, the report and any alert are there.

The full judge walkthrough is in [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

### Existing development database

Run `npx prisma migrate deploy` and `npm run seed` to apply the two-role model. The migration preserves accounts, passwords, existing Admin access and farm records. Accounts with removed roles become Farmer accounts with profiles; it does not grant Admin access. The database enum and available role choices contain only `FARMER` and `ADMIN`. Historical migration files remain unchanged.

A database created before the switch to real data may still hold old demo readings. `npx prisma migrate deploy`
applies the migration that removes them (and the old demo columns). For a completely clean start:
`npx prisma migrate reset`, then `npm run seed`.

## Common commands

| Task | Command |
|---|---|
| Start the app (dev) | `npm run dev` |
| Production build / start | `npm run build` · `npm start` |
| All tests | `npm test` (server, then client, then scripts) |
| Server tests (separate `<db>_test` database, test-only fixtures, no live API calls) | `npm run test:server` |
| Client tests | `npm run test:client` |
| Lint | `npm run lint` |
| Prisma client / migrations / studio | `npm run prisma:generate` · `npm run prisma:migrate` · `npx prisma studio` |
| Reference data + first admin (non-destructive) | `npm run seed` |
| Train ML models from recorded field outcomes | `npm run ai:train` (add `-- --activate` to activate) |

## Project layout

```
mwanimlinzi/
├── app/                       Next.js App Router: pages (thin wrappers) and API
│   ├── layout.jsx · providers.jsx · not-found.jsx
│   ├── (public)/ · farmer/ · (admin)/ · account/   page routes (same URLs as before)
│   └── api/**/route.js        Route Handlers, one per endpoint (same /api paths)
├── src/
│   ├── client/                browser code (client components)
│   │   ├── api/               fetch client + endpoints (all API calls)
│   │   ├── components/        ui kit, risk components, Leaflet map
│   │   ├── hooks/ · stores/ · utils/
│   │   ├── i18n/              I18nProvider + locales/{en,sw}/<namespace>.js
│   │   ├── layouts/           Public, Farmer (mobile bottom nav), App (admin sidebar), ProtectedRoute
│   │   ├── pages/             public · farmer · admin · cooperative · extension · tools
│   │   └── __tests__/         Vitest tests
│   └── server/                server-only code
│       ├── ai/                riskEngine, riskRuleEngine, mlRiskProvider, actionEngine, explanationEngine, ml/
│       ├── rules/             riskRules.js (named, explainable rule terms)
│       ├── providers/         weather, ocean, environmental (fallback), climatology, llm, africastalking/, email
│       ├── services/          business logic
│       ├── controllers/       request handlers
│       ├── http/              defineRoute pipeline, rate limits, body parsing, errors, route table
│       ├── middleware/ · validators/ (zod) · db/ · utils/
│       ├── jobs/              job definitions + node-cron scheduler
│       ├── config/            env, prisma client, OpenAPI
│       └── boot.js            starts jobs and shuts down cleanly
├── instrumentation.js         runs boot() once when the Next.js server starts
├── prisma/                    schema.prisma · migrations/ · seed.js · data/
├── tests/                     Jest unit + integration tests; fixtures/ and fakes/ (test-only data)
├── scripts/                   dev supervisor, background runner, utilities (and their tests)
├── ai/                        models/ · scripts/trainModel.js (trains from recorded field outcomes)
└── docs/
```

## Providers and configuration

Password recovery sends a six-digit code only to the real email saved on the user account. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` in `.env`, then run `npm run email:verify` to check the sender connection. Codes expire after 15 minutes and cannot be reused. See [docs/EMAIL.md](docs/EMAIL.md).

Environmental data is always live. With the defaults no key is needed:

```ini
# Weather: open-meteo (free, no key) | openweathermap (needs key) | tma (reads TMA_BULLETIN_PATH)
WEATHER_PROVIDER=
WEATHER_API_KEY=
TMA_BULLETIN_PATH=                   # /var/lib/mwanimlinzi/tma-bulletin.json (admin uploads from the UI)
TMA_BULLETIN_MAX_HOURS=24

# Ocean: open-meteo-marine (free, no key) | cmems / copernicus-marine (CMEMS via Open-Meteo, free) | stormglass
OCEAN_PROVIDER=
OCEAN_API_KEY=

# Optional LightGBM / XGBoost service (see ai/ml-service/README.md)
ML_SERVICE_URL=
ML_SERVICE_TIMEOUT_MS=2500

LLM_PROVIDER=anthropic               # or openai; optional (empty = deterministic templates)
LLM_API_KEY=
AT_USERNAME=sandbox                  # Africa's Talking (SMS + USSD), see docs/AFRICASTALKING.md
AT_API_KEY=
AT_ENVIRONMENT=sandbox               # or production
AT_USSD_SERVICE_CODE=*384*1234#
AT_CALLBACK_SECRET=<long random string>
```

If a live provider fails, the server uses the last live reading near the farm (within ±0.05° and
`environment.maxCacheAgeHours`, default 48 h) and labels it **CACHED**. If there is none, there is no reading: the risk
is still computed from the farm data and farmer reports, stored with data source `UNAVAILABLE` and a lower confidence.
SMS and USSD are never simulated: without Africa's Talking credentials every SMS attempt is logged as `NOT_CONFIGURED`.
Details: [docs/AI.md](docs/AI.md).

### Giving external partners read access (no additional account roles)

Admins issue signed, revocable access tokens in **Admin → Access tokens**:

- A **Forecasts** token exposes `GET /api/public/forecasts?token=…` — cooperative-level 7/14/30-day expected harvest, with low/high uncertainty bands.
- An **Adoption** token exposes `GET /api/public/adoption?token=…` — last-90-day registered farmers, high-alert acknowledgement rate and 48h-action rate.
- A token can be scoped to one cooperative or to all of them. Default lifetime is 90 days; revoke at any time.
- Share the token through a secure channel. The partner opens **`/partner`**, pastes the token, and sees the view — no login, no technical setup.

### Optional LightGBM / XGBoost microservice

The Node server ships with a logistic-regression baseline. For gradient-boosted models (deck slide 7), run the small
Python service in [`ai/ml-service/`](ai/ml-service/README.md) and set `ML_SERVICE_URL` in `.env`. If the service
is unreachable or has no model for a given risk type, the server transparently falls back to the JS baseline, which
in turn falls back to the rule-based engine. The system is never dependent on the Python service being up.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, data flow, folder structure
- [docs/AFRICASTALKING.md](docs/AFRICASTALKING.md) — SMS/USSD setup (sandbox first), USSD menu, SMS rules, test plan
- [docs/DATABASE.md](docs/DATABASE.md) — PostgreSQL + pgAdmin setup, schema, migrations, seeding
- [docs/API.md](docs/API.md) — REST endpoints, auth, response format
- [docs/AI.md](docs/AI.md) — risk engine, ML pipeline, action engine, LLM, explainability, data honesty
- [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) — step-by-step walkthrough for judges and reviewers
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment notes
- [docs/SECURITY.md](docs/SECURITY.md) — security and privacy controls
- [ai/README.md](ai/README.md) — model training from field outcomes

## Data honesty

- Seeding creates only reference data and two demo logins. Every farm and report was entered by a person; every environmental reading comes from
  a live provider and stores its `source` (`LIVE`, `CACHED`) and provider name. Missing values stay empty and are never
  invented. What-if runs are stored as `SIMULATION` and never shown as real risk.
- Risk comes from the rule-based engine. Its coefficients are expert-style starting values that still need calibration
  with local field data.
- ML models are trained only on recorded field outcomes, and only once there are enough of them; until then the
  rule-based engine is used.
- The Action Library is a **starter rule set awaiting validation by local seaweed extension experts**.
- MwaniMlinzi makes no accuracy or loss-reduction claims without field evaluation.
