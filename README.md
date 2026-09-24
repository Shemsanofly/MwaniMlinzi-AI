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
| Frontend | React 19, Vite, React Router, TanStack Query, Axios, Tailwind CSS, Recharts, Leaflet + OpenStreetMap |
| Backend | Node.js (≥18.18), Express 5, JavaScript (ES modules), Prisma ORM, Zod, JWT, bcryptjs, Helmet, rate limiting, node-cron |
| Database | PostgreSQL (managed with pgAdmin) |
| AI | Rule-based risk engine (always on) + dependency-free JavaScript logistic-regression models (optional), Action Engine, optional LLM for explanation/translation only |
| Deployment | No Docker. `npm` + PostgreSQL on Windows, Linux or macOS; PM2 for production |

## What is built

- **Roles:** Farmer, Cooperative admin, Extension officer, Buyer/processor, System admin — JWT auth, role checks and per-farm ownership/cooperative scoping on every endpoint.
- **Farms & records:** farm profiles with locations, planting cycles (crop age always derived from the planting date), an observation wizard with optional photo upload, harvests (expected vs actual, difference, loss %), losses, quality, drying.
- **Environmental data:** Weather + Ocean providers with **LIVE → CACHED → DEMO** fallback. Every record stores its `source`; the UI labels demo data as *Demo Environmental Data*.
- **AI risk engine:** four risks — Heat/Ice-Ice, Storm/Line damage, Poor growth, Harvest window — each with probability, level (thresholds stored in PostgreSQL), confidence, horizon and **structured, explainable factors**.
- **Hybrid ML:** training pipeline (`ai/scripts`) on synthetic demo data (+ recorded field outcomes); models are registered in PostgreSQL with held-out precision/recall/F1/confusion matrix and are only used when an admin activates them. The UI always shows *Rule-based baseline* or *ML model vN (trained on synthetic data)*.
- **Action Engine:** recommendations come **only** from the curated, bilingual Action Library (validated by extension officers). The LLM can never invent farming actions.
- **Alerts & notifications:** high/critical heat and storm, poor growth, harvest window, risk increases, missing reports → in-app notifications, plus **real SMS through Africa's Talking** for important events only (HIGH/CRITICAL risk, harvest reminders), respecting each user's SMS preferences. Every SMS is logged with provider status (QUEUED/SENT/DELIVERED/FAILED/NOT_CONFIGURED) and delivery reports.
- **Feedback loop:** prediction → recommendation → farmer action → outcome → automatic model-feedback label → field evaluation metrics and future training data.
- **Dashboards:** mobile-first farmer app (English/Kiswahili), cooperative dashboard with risk map and forecasts, extension review workflow and visit prioritisation, buyer supply forecasts (7/14/30 days, with uncertainty ranges, anonymised), admin console (users, action library, models, settings, audit log, jobs).
- **SMS & USSD (Africa's Talking):** a real USSD application (risk, symptom reports, harvest, advice, language) with sessions stored in PostgreSQL, and incoming SMS commands. Sandbox first; see [docs/AFRICASTALKING.md](docs/AFRICASTALKING.md). There are no web simulators.
- **English | Kiswahili** everywhere (web, SMS, USSD). The choice is saved in the browser and in the user's profile. Farmers register and log in with their phone number (any Tanzanian format).
- **Simple farmer dashboard:** current risk in words + icon + colour, plain-language reasons, the next action and when to do it; technical values stay under *See details / Angalia maelezo*. Works on low connectivity: the last saved information stays visible offline.
- **AI assistant** grounded in the farmer's own records, and an **AI simulation** page that re-runs the full pipeline with modified conditions.

## Quick start (development)

Prerequisites: **Node.js 18.18+ (20/22 recommended)**, **PostgreSQL 14+**, **pgAdmin 4** (optional but recommended).

```bash
# 1. Database — create an empty database called `mwanimlinzi` (pgAdmin steps: docs/DATABASE.md)

# 2. Backend
cd backend
cp .env.example .env            # Windows: copy .env.example .env
#    edit .env → set DATABASE_URL and a long random JWT_SECRET
npm install
npx prisma generate
npx prisma migrate dev          # creates all tables
npm run seed                    # demo data; prints the demo password
npm run dev                     # API on http://localhost:5000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                     # app on http://localhost:5173
```

| | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000/api |
| API documentation (Swagger UI) | http://localhost:5000/api/docs |
| Health check | http://localhost:5000/api/health |

### Demo accounts

Created by `npm run seed`. All use **one demo password**: the value of `DEMO_PASSWORD` in `backend/.env`, or — if empty — a random password generated and printed by the seed and saved to `backend/DEMO_CREDENTIALS.local.txt` (git-ignored).

Log in with the email or the phone number.

| Role | Email |
|---|---|
| Farmer | `farmer@demo.mwanimlinzi.local` (phone `0777 000 001` / `+255777000001`, farms FARM001 & FARM002) |
| Cooperative admin | `cooperative@demo.mwanimlinzi.local` |
| Extension officer | `extension@demo.mwanimlinzi.local` |
| Buyer | `buyer@demo.mwanimlinzi.local` |
| Admin | `admin@demo.mwanimlinzi.local` |

Demo scenario farms: **FARM001** heat/ice-ice HIGH · **FARM002** near harvest · **FARM003** storm HIGH · **FARM004** poor growth HIGH · **FARM005** normal. The full judge walkthrough is in [docs/DEMO.md](docs/DEMO.md).

## Common commands

| Task | Command |
|---|---|
| Backend dev server / production | `cd backend && npm run dev` / `npm start` |
| Backend tests (uses a separate `<db>_test` database) | `cd backend && npm test` |
| Backend lint | `cd backend && npm run lint` |
| Prisma client / migrations / studio | `npm run prisma:generate` · `npm run prisma:migrate` · `npx prisma studio` |
| Re-seed demo data (wipes the database!) | `cd backend && npm run seed` |
| Reference data only (production, non-destructive) | `cd backend && npm run seed:reference` |
| Generate synthetic dataset | `cd backend && npm run ai:dataset` |
| Train ML models | `cd backend && npm run ai:train` (add `-- --activate` to activate, `-- --include-field` to add recorded outcomes) |
| Frontend dev / build / preview | `cd frontend && npm run dev` · `npm run build` · `npm run preview` |
| Frontend tests / lint | `cd frontend && npm test` · `npm run lint` |

## Demo mode vs live mode

`DEMO_MODE=true` (default) uses deterministic demo environmental data. SMS and USSD are never simulated: they work only when Africa's Talking is configured, and otherwise every SMS attempt is logged as `NOT_CONFIGURED`. Set `DEMO_MODE=false` and configure providers to go live:

```ini
DEMO_MODE=false
WEATHER_PROVIDER=open-meteo          # free, no key (or openweathermap + WEATHER_API_KEY)
OCEAN_PROVIDER=open-meteo-marine     # free, no key (or stormglass + OCEAN_API_KEY)
LLM_PROVIDER=anthropic               # or openai; optional
LLM_API_KEY=...
AT_USERNAME=sandbox                  # Africa's Talking (SMS + USSD), see docs/AFRICASTALKING.md
AT_API_KEY=...
AT_ENVIRONMENT=sandbox               # or production
AT_USSD_SERVICE_CODE=*384*1234#
AT_CALLBACK_SECRET=<long random string>
```

If a live provider fails, the backend falls back to cached live data, then to demo data, and labels the source. Details: [docs/AI.md](docs/AI.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, data flow, folder structure
- [docs/AFRICASTALKING.md](docs/AFRICASTALKING.md) — SMS/USSD setup (sandbox first), USSD menu, SMS rules, test plan
- [docs/DATABASE.md](docs/DATABASE.md) — PostgreSQL + pgAdmin setup, schema, migrations, seeding
- [docs/API.md](docs/API.md) — REST endpoints, auth, response format
- [docs/AI.md](docs/AI.md) — risk engine, ML pipeline, action engine, LLM, explainability, data honesty
- [docs/DEMO.md](docs/DEMO.md) — step-by-step demo script
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — deployment without Docker (Vercel/static + Node/PM2 + PostgreSQL)
- [docs/SECURITY.md](docs/SECURITY.md) — security and privacy controls
- [ai/README.md](ai/README.md) — datasets, models and training scripts

## Data honesty

All seeded cooperatives, farmers, farms, coordinates and environmental histories are **demo data** (`is_demo = true`) and are labelled in the UI. The ML models shipped by the training script are trained on **synthetic** data and say nothing about real-world accuracy. The Action Library is a **demo rule set that must be validated by local seaweed extension experts before real-world use**. MwaniMlinzi makes no accuracy or loss-reduction claims without field evaluation.
