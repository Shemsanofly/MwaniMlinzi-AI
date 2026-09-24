# Architecture

```
┌──────────────────────────── Browser (mobile-first React SPA) ────────────────────────────┐
│ Farmer app · Cooperative · Extension · Buyer · Admin · Demo (AI simulation)               │
│ React Router · TanStack Query · Axios · Tailwind · Recharts · Leaflet/OpenStreetMap        │
│ i18n (Kiswahili default / English)                                                         │
└───────────────────────────────▲──────────────────────────────────────────────────────────┘
                                │ HTTPS  JSON  { success, data, message } · JWT bearer
┌───────────────────────────────┴──────── Node.js / Express API ───────────────────────────┐
│ middleware: helmet · CORS allow-list · rate limits · JSON limits · authenticate ·         │
│             authorize(role) · zod validate · error handler (no leaks)                      │
│ routes → controllers → services                                                            │
│                                                                                            │
│  FarmService  RecordService  FarmContextService  EnvironmentService  RiskService           │
│  AlertService NotificationService  HarvestForecastService  AssistantService                │
│  SMSService · UssdService (AT state machine) · ChannelService (SMS) · ModelMonitoring      │
│                                                                                            │
│  AI:  RiskEngine = RiskRuleEngine (rules/riskRules.js) + MLRiskProvider (logistic reg.)    │
│       ExplanationEngine · ActionEngine (Action Library) · LLMProvider (optional)           │
│                                                                                            │
│  Providers (LIVE + DEMO): Weather · Ocean · EnvironmentalProvider (LIVE→CACHED→DEMO)       │
│                           LLM · SMS · USSD · Email                                          │
│  Jobs: node-cron (environment, risk, forecasts, missing reports, monitoring) + Run now     │
└───────────────┬───────────────────────────────┬─────────────────────────────┬─────────────┘
                │ Prisma (parameterised SQL)    │ fetch (timeouts)            │ fs
        ┌───────▼────────┐          Open-Meteo / OpenWeatherMap /       ai/models/*.json
        │  PostgreSQL    │          Stormglass / Anthropic / OpenAI /   uploads/ (photos)
        │  (pgAdmin)     │          Africa's Talking (all optional)
        └────────────────┘
```

## The core loop in code

1. **Farm data** — `farms`, `farm_locations`, `planting_cycles` (crop age derived from `planting_date`).
2. **Environmental data** — `EnvironmentService.refreshForFarm` → `EnvironmentalProvider.fetch` → `weather_observations`,
   `ocean_observations`, `environmental_observations` (with `source`), plus SST persistence/trend from history.
3. **Farmer observations** — `RecordService.createObservation` (app, SMS, USSD, assistant draft) → `farm_observations`,
   `disease_observations`, then immediately `RiskService.runForFarm(trigger: OBSERVATION)`.
4. **AI risk prediction** — `FarmContextService.build` → `buildFeatures` → `RiskEngine.calculateFarmRisk`
   (rules + optional ML, thresholds from `system_settings`) → `risk_predictions` + `risk_factors` (+ `model_predictions`).
5. **Explanation** — `ExplanationEngine` (EN/SW from factors).
6. **Validated action** — `ActionEngine.selectAll` over `action_library` → `action_recommendations` (superseding old advice).
7. **Alerts** — `AlertService.fromPredictions` → `alerts` → `NotificationService` → `notifications` + `notification_logs` (+ SMS).
8. **Farmer response** — `farmer_actions` (recommendation marked COMPLETED/DISMISSED).
9. **Outcome** — `action_outcomes` (+ automatic `model_feedback` label), `harvest_records`, `loss_records`.
10. **Future learning data** — `trainModel.js --include-field` turns stored prediction features + outcomes into labelled
    records; `ModelMonitoringService` computes field precision/recall.

## Repository layout

```
mwanimlinzi/
├── frontend/                  React + Vite app
│   └── src/
│       ├── api/               axios client + endpoints (all API calls)
│       ├── components/        ui kit, risk components, Leaflet map
│       ├── hooks/             useFarmerFarm …
│       ├── i18n/              I18nProvider + locales/{en,sw}/<namespace>.js
│       ├── layouts/           Public, Farmer (mobile bottom nav), App (staff sidebar), ProtectedRoute
│       ├── pages/             public · farmer · cooperative · extension · buyer · admin · demo
│       ├── stores/            AuthContext
│       ├── utils/             formatting, risk styles
│       └── App.jsx            routes (lazy-loaded)
├── backend/                   Express API
│   ├── prisma/                schema.prisma · migrations/ · seed.js · data/ (action library, reference data)
│   ├── src/
│   │   ├── ai/                riskEngine, riskRuleEngine, mlRiskProvider, actionEngine, explanationEngine, ml/
│   │   ├── rules/             riskRules.js (named, explainable rule terms)
│   │   ├── providers/         weather, ocean, environmental (fallback), llm, africastalking/ (SMS client), email, demo profiles
│   │   ├── services/          business logic
│   │   ├── controllers/       HTTP handlers
│   │   ├── routes/            routers + role guards
│   │   ├── middleware/        auth, validate, rate limit, errors
│   │   ├── validators/        zod schemas
│   │   ├── jobs/              job definitions + node-cron scheduler
│   │   ├── config/            env, prisma client, OpenAPI
│   │   ├── utils/             errors, responses, dates, audit, pagination
│   │   ├── app.js             express app factory (used by tests)
│   │   └── server.js          entry point
│   └── tests/                 Jest unit + Supertest integration tests
├── ai/                        datasets/ · models/ · scripts/ (generateDataset.js, trainModel.js)
└── docs/
```

## Design decisions

- **JavaScript (ES modules) rather than TypeScript** — matches the requested file layout (`server.js`, `seed.js`, `App.jsx`)
  and keeps the toolchain minimal (no build step for the API). Runtime validation is done with Zod at every boundary.
- **Express 5** — native async error propagation, so controllers throw `AppError` and the central handler formats responses.
- **Prisma** — typed, parameterised queries (SQL-injection safe), readable migrations, and pgAdmin-friendly snake_case tables.
- **Rules first, ML optional** — the rule engine is always available and explainable; ML is only blended in when an admin
  activates a trained model, and every prediction records which model produced it.
- **Action Library as the single source of advice** — the LLM, assistant, SMS and USSD all read the same approved actions.
- **Providers with demo twins** — environmental data and the LLM run offline for demos and degrade gracefully when live APIs fail. SMS and USSD have no demo twin: they are real Africa's Talking channels and report `NOT_CONFIGURED` honestly.
- **Simulations are first-class but isolated** — stored and auditable, never shown as real risk.
- **Persisted USSD sessions** — the menu position, language, selected farm and temporary input are stored in `ussd_sessions`,
  so each Africa's Talking request consumes only the newest input; retries return the stored reply (no duplicate records).
- **No Docker** — plain `npm` scripts, PostgreSQL and PM2.
