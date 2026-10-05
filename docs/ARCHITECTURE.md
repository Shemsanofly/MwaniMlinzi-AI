# Architecture

```
┌──────────────────────── Browser (mobile-first, Next.js App Router) ─────────────────────┐
│ Next.js App Router (client components)                                                   │
│ Farmer app · Admin (console + field operations) · What-if planner                        │
│ TanStack Query · fetch client · Tailwind · Recharts · Leaflet/OpenStreetMap               │
│ i18n (Kiswahili default / English)                                                         │
└───────────────────────────────▲──────────────────────────────────────────────────────────┘
                                │ HTTPS  JSON  { success, data, message } · JWT bearer
┌───────────────────────────────┴────── Same Next.js process (Node.js runtime) ────────────┐
│ Next.js Route Handlers (`app/api/**`) → `defineRoute` pipeline                            │
│ (rate limit · body · authenticate · authorize · zod validate · errors)                    │
│ handlers → controllers → services                                                          │
│                                                                                            │
│  FarmService  RecordService  FarmContextService  EnvironmentService  RiskService           │
│  AlertService NotificationService  HarvestForecastService  AssistantService                │
│  SMSService · UssdService (AT state machine) · ChannelService (SMS) · ModelMonitoring      │
│                                                                                            │
│  AI:  RiskEngine = RiskRuleEngine (rules/riskRules.js) + MLRiskProvider (logistic reg.)    │
│       ExplanationEngine · ActionEngine (Action Library) · LLMProvider (optional)           │
│                                                                                            │
│  Providers (live): Weather · Ocean · EnvironmentalProvider (LIVE→CACHED→no reading)        │
│                           LLM · SMS · USSD · Email                                          │
│  Jobs: node-cron started from instrumentation.js (environment, risk, forecasts,           │
│        missing reports, monitoring) + Run now                                              │
└───────────────┬───────────────────────────────┬─────────────────────────────┬─────────────┘
                │ Prisma (parameterised SQL)    │ fetch (timeouts)            │ fs
        ┌───────▼────────┐          Open-Meteo / OpenWeatherMap /       ai/models/*.json
        │  PostgreSQL    │          Stormglass / Anthropic / OpenAI /   uploads/ (photos)
        │  (pgAdmin)     │          Africa's Talking
        └────────────────┘
```

## The core loop in code

1. **Farm data** — `farms` (location included), `planting_cycles` (crop age derived from `planting_date`).
2. **Environmental data** — `EnvironmentService.refreshForFarm` → `EnvironmentalProvider.fetch` → `environmental_observations` (WEATHER, OCEAN and FARM rows) (with `source` LIVE/CACHED and provider), plus SST persistence/trend
   from history. With no live or cached reading nothing is stored and the risk runs on farm data and reports only.
3. **Farmer observations** — `RecordService.createObservation` (app, SMS, USSD, assistant draft) → `farm_observations` (including disease entries), then immediately `RiskService.runForFarm(trigger: OBSERVATION)`.
4. **AI risk prediction** — `FarmContextService.build` → `buildFeatures` → `RiskEngine.calculateFarmRisk`
   (rules + optional ML, thresholds from `system_settings`) → `risk_predictions` (factors and ML model link included).
5. **Explanation** — `ExplanationEngine` (EN/SW from factors).
6. **Validated action** — `ActionEngine.selectAll` over `action_library` → `action_recommendations` (superseding old advice).
7. **Alerts** — `AlertService.fromPredictions` → `alerts` → `NotificationService` → `notifications` + `event_logs` (DELIVERY) (+ SMS).
8. **Farmer response** — `farmer_actions` (recommendation marked COMPLETED/DISMISSED).
9. **Outcome** — `farm_records` (OUTCOME and LOSS), `event_logs` (FEEDBACK), `harvest_records`.
10. **Future learning data** — `trainModel.js` turns stored prediction features + recorded outcomes into labelled
    training records (only once there are enough); `ModelMonitoringService` computes field precision/recall.

## Repository layout

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

## Design decisions

- **JavaScript (ES modules) rather than TypeScript** — keeps the toolchain minimal. Runtime validation is done with Zod at every boundary.
- **One Next.js app** — pages and the API share one process and one origin, so there is no proxy or CORS setup; controllers throw `AppError` and `defineRoute` formats responses.
- **Prisma** — typed, parameterised queries (SQL-injection safe), readable migrations, and pgAdmin-friendly snake_case tables.
- **Rules first, ML optional** — the rule engine is always available and explainable; ML is only blended in when an admin
  activates a trained model, and every prediction records which model produced it.
- **Action Library as the single source of advice** — the LLM, assistant, SMS and USSD all read the same approved actions.
- **Live providers, honest gaps** — weather and ocean data come from live providers (free Open-Meteo defaults). When a provider fails, the last live reading near the farm is reused (CACHED); otherwise the value stays `null` and the confidence drops. Nothing is invented. The LLM is optional (deterministic templates otherwise). SMS and USSD are real Africa's Talking channels and report `NOT_CONFIGURED` honestly.
- **Simulations are first-class but isolated** — what-if runs are stored and auditable as `SIMULATION`, never shown as real risk or sent to farmers.
- **Persisted USSD sessions** — the menu position, language, selected farm and temporary input are stored in `ussd_sessions`,
  so each Africa's Talking request consumes only the newest input; retries return the stored reply (no duplicate records).
- **No Docker** — plain `npm` scripts and PostgreSQL.

## Account roles and recovery

Only `FARMER` and `ADMIN` are stored in `RoleName`, seeded or assignable. Farmer API access is limited to owned farms. Admins manage field operations and all cooperatives through `/admin`. The shared field/cooperative components and `/api/extension/*` endpoint namespace are Admin tools, not additional account roles. Public partner tokens grant limited aggregate read access without creating user accounts.

Password recovery uses `EmailService` and the configured SMTP provider to send a six-digit code to the email saved on the user. Recovery is unavailable until a real sender is configured; see [EMAIL.md](EMAIL.md).
