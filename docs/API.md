# REST API

Base URL: `http://localhost:5000/api` · Interactive docs (Swagger UI): `http://localhost:5000/api/docs` · OpenAPI JSON: `/api/docs.json`

## Conventions

**Authentication** — `Authorization: Bearer <JWT>` from `POST /auth/login` or `/auth/register`. Tokens expire after
`JWT_EXPIRES_IN` (default 7 days). The user and roles are re-loaded from PostgreSQL on each request, so role changes and
deactivation apply immediately. Logout = the client discards the token (`POST /auth/logout` records it in the audit log).

**Success**

```json
{ "success": true, "data": { }, "message": "..." }
```

**Error**

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": [{ "path": "email", "message": "Invalid email" }] } }
```

| HTTP | `code` |
|---|---|
| 400 | `VALIDATION_ERROR`, `UPLOAD_ERROR` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN`, `ACCOUNT_DISABLED` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 429 | `RATE_LIMITED` |
| 503 | `DATABASE_UNAVAILABLE` |
| 500 | `INTERNAL_ERROR` (no stack traces or SQL are ever returned) |

**Scoping** — Farmers only see their own farms; admins see all farms and field operations
(only anonymised aggregated supply). Writing farm records (observations, harvests, losses, actions, outcomes) is limited to
the farm owner and admins.

**Rate limits** — 1500 requests / 15 min per IP overall, 30 / 15 min for `/auth/login|register`, 30 / min for `/ai/chat`.

## Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{ status, database, providers{ weather:{live}, ocean:{live}, llm, sms, ussd }, time }` — `live` is the active provider name or `null` when disabled (503 if DB down) |
| GET | `/species` | Seaweed species |
| GET | `/cooperatives/public` | `[{ code, name, district }]` for registration |

## Auth

| Method | Path | Body / notes |
|---|---|---|
| POST | `/auth/register` | `{ fullName, phone (Tanzanian mobile in any format: +255…, 255…, 07…, 06…; stored as +255XXXXXXXXX, unique), password (≥8, letter+digit), preferredLanguage: sw\|en, consent: true, email?, role?: FARMER, cooperativeCode?, village?, district?, smsEnabled? }` → `{ token, user }` |
| POST | `/auth/login` | `{ identifier (phone in any format, or email), password }` (`{ email, password }` still accepted) → `{ token, user{ id, email, fullName, phone, roles[], primaryRole, farmerId, cooperativeId, preferredLanguage, smsEnabled, notifyRiskAlerts, notifyHarvest, notifySystem } }` |
| GET | `/auth/me` | `{ user, cooperative, memberships[] }` |
| PATCH | `/auth/me` | `{ fullName?, phone?, email?, preferredLanguage?, smsEnabled?, notifyRiskAlerts?, notifyHarvest?, notifySystem? }` |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` (400 `WRONG_PASSWORD` if the current one is wrong) |
| POST | `/auth/forgot-password` | `{ phone }` → sends a 6-digit code by SMS (same reply for unknown numbers; 503 `NOT_CONFIGURED` if SMS is not set up, 502 `PROVIDER_ERROR` if sending failed). Max 3 codes per 15 min |
| POST | `/auth/reset-password` | `{ phone, code, newPassword }` → 400 `INVALID_CODE` if wrong/expired/used; a code expires after 15 min or 5 wrong tries. Only a hash of the code is stored; the SMS log shows `******` |
| POST | `/auth/logout` | audit only |

## Farms (FARMER, ADMIN)

`GET /farms/:id/intelligence` returns real-data readiness, source timestamps, missing inputs and per-risk
training counts for an accessible farm. `POST /farms/:id/risks/run` refreshes providers and recomputes risk and
eligible harvest estimates. Rule scores and input completeness are not calibrated probability or accuracy.

`GET /location/reverse?latitude=-6.267&longitude=39.534&language=en` requires FARMER or ADMIN authentication.
It returns `status: FOUND|NOT_FOUND|UNAVAILABLE`, nullable `location` (place name, district, region, source,
attribution and `NEAREST_MAPPED_PLACE` match type), coordinates and cache status. Missing address details
are empty strings; provider failure never fabricates a place. Coordinates must be nonempty and within latitude
±90 / longitude ±180. The endpoint has a separate request limit and shared provider throttling/cache.

| Method | Path | Description |
|---|---|---|
| GET | `/farms?search&status&cooperativeId&district&riskLevel` | Farms in scope with `cropAgeDays`, `currentCycle`, `latestRisks{TYPE:{level,probability,confidence}}`, `overallRiskLevel`, `lastObservation`, `forecast`, `location` |
| POST | `/farms` | Create farm `{ name, speciesId, farmingMethod, exposure, anchoringMethod, areaHectares?, lineCount, latitude, longitude, locationName, district, region, cooperativeId?, notes?, plantingDate?, expectedHarvestDate?, linesPlanted? }` (admins/extension may pass `farmerId`). Runs the risk engine + forecast immediately if a planting date is given |
| GET | `/farms/:id` | Farm detail incl. `plantingCycles[]` |
| PATCH | `/farms/:id` | Update farm (incl. `status`) |
| GET/POST | `/farms/:id/cycles` | Planting cycles / record planting `{ plantingDate, expectedHarvestDate?, linesPlanted, seedQuantityKg?, notes? }` (409 if a cycle is active) |
| PATCH | `/farms/:id/cycles/:cycleId` | `{ status: ACTIVE\|HARVESTED\|FAILED }` |
| GET/POST | `/farms/:id/observations` | Observation `{ cropCondition: GOOD\|FAIR\|POOR, whitening, breakage, epiphytes?, diseaseSymptoms?, unusualGrowth, growthCondition?, waterAppearance?, lineCondition?, anchorCondition?, percentAffected?, notes?, confidence, imageFileId?, observedAt? }` → `{ observation, risk }` — **the risk engine re-runs immediately** and `risk` is the full new result incl. alerts. Unanswered `epiphytes` and `diseaseSymptoms` remain `null`; explicit `false` means the farmer reported no symptom. |
| GET/POST | `/farms/:id/harvests` | `{ harvestDate, actualQuantity, estimatedQuantity?, unit: KG_DRY\|KG_WET, qualityGrade?, dryingMethod?, dryingDurationDays?, pricePerKg?, moisturePercent?, impurityPercent?, groundContact?, rainDuringDrying?, notes?, closeCycle=true }` → harvest with `differenceQuantity`, `lossPercent`, `totalValue` (estimate defaults to the current forecast) |
| GET/POST | `/farms/:id/losses` | `{ lossDate, cause: ICE_ICE\|STORM\|EPIPHYTES\|GRAZING\|THEFT\|POOR_GROWTH\|OTHER, percentLost, quantityKg?, notes? }` |
| GET | `/farms/:id/risks` | `{ predictions[], nextAction, insufficientData, insufficientDataMessage{en,sw}, modelStatus{mode,label}, calculatedAt }` (see prediction shape below) |
| POST | `/farms/:id/risks/run` | Recalculate now (refreshes environment through the provider chain) |
| GET | `/farms/:id/risks/history?days&riskType` | Time series for charts |
| GET | `/farms/:id/recommendations?status` | Recommendations with action item, prediction and farmer actions |
| PATCH | `/farms/:id/recommendations/:recId` | `{ status: ACKNOWLEDGED\|COMPLETED\|DISMISSED }` |
| GET/POST | `/farms/:id/actions` | Farmer action `{ recommendationId?, actionTaken, description?, performedAt?, notes? }` (marks the recommendation COMPLETED/DISMISSED) |
| GET/POST | `/farms/:id/outcomes` | Outcome `{ farmerActionId?, recommendationId?, predictionId?, outcomeType: NO_LOSS\|MINOR_LOSS\|MAJOR_LOSS\|TOTAL_LOSS\|HARVESTED, lossPercent?, riskMaterialized?, outcomeDate?, notes? }` → `{ outcome, feedback }` — links prediction → recommendation → action and auto-creates a `event_logs` (FEEDBACK) label (CORRECT / FALSE_POSITIVE / FALSE_NEGATIVE) |
| GET | `/farms/:id/history` | Unified timeline `{ events[{ type, date, id, data }] }` |
| GET | `/farms/:id/environment?days` | `{ current, history[], providers }` |
| GET | `/farms/:id/records/summary?cycleId` | `{ cycle, cycles[], summary }` — record book for a planting cycle (default: the active, else most recent): `harvestedKg, soldKg, unsoldKg, incomeTzs, owedTzs, costsTzs, costsByCategory, profitTzs, profitPerLine, averagePricePerKg, counts` — farmer's own entries only |
| GET/POST | `/farms/:id/sales` | sale `{ saleDate, quantityKg, pricePerKg (TSh), buyerName?, qualityGrade?, paymentStatus PAID\|PENDING, notes?, cycleId? }` → `totalTzs` computed. A harvest recorded with a price also creates one sale. |
| GET/POST | `/farms/:id/costs` | cost `{ costDate, category SEEDLINGS\|ROPE_LINES\|STAKES\|TYING_MATERIAL\|LABOUR\|TRANSPORT\|DRYING_MATERIALS\|OTHER, amountTzs, notes?, cycleId? }` |
| GET/POST | `/farms/:id/work` | work `{ workDate, activity PLANTING\|TYING_SEEDLINGS\|CLEANING_LINES\|REPAIRING_LINES\|HARVESTING\|DRYING\|OTHER, notes?, cycleId? }` |
| DELETE | `/farms/:id/sales\|costs\|work/:recordId` | the farm's farmer or an admin; audit-logged |
| GET | `/farms/:id/outlook` | `{ outlook }` — `null`, or `{ fetchedAt, source: LIVE\|CACHED, providers, partTimes, current{ observedAt, precipitationMm, intervalMinutes, temperatureC, dataKind: MODEL_ESTIMATE }, note{en,sw}, tides[], today{ date, lowTides[], nextWorkWindow, drying{ verdict GOOD\|CAUTION\|BAD, maxRainProbability, rainMm, windowStart, windowEnd }, dryingDayEnded, advice }, days[] }`. Current weather is nullable and hidden after 30 minutes; rain chance is a peak hourly forecast, not current rain. Today uses remaining complete drying hours; after 18:00 it is removed. Local Africa/Dar_es_Salaam times. |
| GET | `/farms/:id/alerts?includeSimulation` | Farm alerts |
| GET/POST | `/farms/:id/notes` | Field notes `{ note, visitPriority?, visitBy? }` (POST: ADMIN) |
| GET | `/farms/predictions/:predictionId` | One prediction with factors |

**Prediction shape**

```json
{
  "id": "…", "riskType": "HEAT_ICE_ICE", "probability": 0.7782, "riskLevel": "HIGH", "confidence": 0.89,
  "forecastHorizonHours": 72, "modelType": "RULE", "modelVersion": "rules-v1", "ruleProbability": 0.7782, "mlProbability": null,
  "explanation": "Heat / Ice-Ice risk: HIGH (78%). Main reasons: …", "explanationSw": "Joto / Ice-Ice: Hatari kubwa (78%). Sababu kuu: …",
  "dataSource": "LIVE", "trigger": "OBSERVATION", "isSimulation": false, "insufficientData": false, "createdAt": "…",
  "factors": [{ "code": "SST_ANOMALY", "label": "…", "labelSw": "…", "value": "+1.5°C", "contribution": 1.48, "direction": "INCREASES" }],
  "recommendation": { "id": "…", "status": "PENDING", "dueBy": "…", "riskType": "HEAT_ICE_ICE",
    "actionItem": { "code": "HEAT_HIGH_INSPECT_24H", "action": "Inspect lines within 24 hours and record whitening or breakage.", "actionSw": "Kagua mistari…", "urgency": "URGENT", "validated": false, "source": "…" } }
}
```

`dataSource`: `LIVE` or `CACHED` (environmental reading used), `UNAVAILABLE` (no reading — computed from farm data and
farmer reports only, with lower confidence) or `SIMULATION` (what-if run).

## Environment

| Method | Path | Description |
|---|---|---|
| GET | `/environment/current?farmId` | `{ farmId, farmCode, current, providers }` — current snapshot (refreshed if older than 6 h). `current.source` is `LIVE` or `CACHED`, with the weather/ocean provider names; values a provider does not supply are `null`. `current: null` = no reading available |
| GET | `/environment/history?farmId&days` | History |
| GET | `/environment/providers` | `{ weather:{live}, ocean:{live} }` — active provider names (`null` = disabled) |

## Risk, simulation, feedback

| Method | Path | Roles | Description |
|---|---|---|---|
| POST | `/risk/predict` | farmer (own farms) + staff | `{ farmId }` = real run. `{ farmId, overrides: { sstAnomalyC?, sstAnomalyDays?, waveHeightM?, windSpeedKmh?, rainfallMm?, currentVelocityMs?, salinityPsu? } }` = **simulation** (used by the admin What-if planner): full pipeline, stored with `isSimulation=true` and `dataSource=SIMULATION`, never shown as real risk or sent to farmers; response includes `baseline` (the real latest risk) |
| GET | `/risk/:farmId` | viewers | Latest risk |
| POST | `/risk/predictions/:id/flag` | ADMIN | `{ reason, feedbackType: FALSE_POSITIVE\|FALSE_NEGATIVE\|FLAGGED\|CORRECT }` |

## Action library

| Method | Path | Roles |
|---|---|---|
| GET | `/actions?riskType&enabled`, `/actions/:id` | staff, farmers |
| POST | `/actions` | ADMIN — created unvalidated |
| PATCH | `/actions/:id` | ADMIN — changing text/levels/conditions resets validation |
| POST | `/actions/:id/validate` | ADMIN — `{ validated, note? }` |

## Alerts & notifications

| Method | Path | Description |
|---|---|---|
| GET | `/alerts?status&severity&type&farmId&includeSimulation&limit` | Alerts in scope |
| PATCH | `/alerts/:id` | `{ status: ACKNOWLEDGED\|RESOLVED }` |
| GET | `/notifications?unread=true` | `{ notifications[], unread }` (in-app) |
| PATCH | `/notifications/:id/read`, POST `/notifications/read-all` | |

## Cooperatives, field operations, forecasts

| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/cooperatives` | any | In scope |
| POST / PATCH | `/cooperatives`, `/cooperatives/:id` | ADMIN | `{ code, name, district, region, description? }` |
| GET | `/cooperatives/mine/dashboard` | ADMIN | First/selected cooperative dashboard |
| GET | `/cooperatives/:id/dashboard` | ADMIN | `{ cooperative, members, cards{…}, charts{riskDistribution, harvestForecast, farmActivity, losses, alertsByType, observations}, farms[] (map), highRiskFarms[], recentAlerts[], missingReportFarms[], performance[], outcomes[], forecastSummary }` |
| GET | `/cooperatives/:id/farmers` | staff | Members |
| GET | `/extension/dashboard` | ADMIN | Field operations portfolio of all farms + `pendingObservations`, `diseaseObservations`, `pendingRecommendations`, `visitPriority[]` |
| GET / PATCH | `/extension/observations?reviewStatus`, `/extension/observations/:id/review` | ADMIN | `{ status: REVIEWED\|FLAGGED, note? }` |
| GET / PATCH | `/extension/recommendations?reviewStatus`, `/extension/recommendations/:id/review` | ADMIN | Review recommendations |
| GET | `/forecasts/harvest?cooperativeId&district&from&to&days&minQuantityKg&grade` | any (scoped: farmers → own farms, admin → all) | `{ forecasts[], summary{horizons{next7Days,next14Days,next30Days,all}, byCooperative, byDistrict, byWeek, uncertaintyNote} }` |
| POST | `/forecasts/harvest/generate` | ADMIN | Regenerate |

## AI assistant

`POST /ai/chat` `{ message, farmId?, language?: sw|en }` →

```json
{ "intent": "WHY_RISK", "language": "sw", "reply": "…", "generatedBy": "TEMPLATE",
  "approvedAction": { "text": "…", "riskType": "HEAT_ICE_ICE", "validated": false, "recommendationId": "…" },
  "observationDraft": null, "facts": { "risks": [ … ], "factors": [ … ] }, "farm": { "id": "…", "farmCode": "FARM001" } }
```

Intents: `WHY_RISK`, `WHAT_TO_DO`, `HARVEST`, `ENVIRONMENT`, `HISTORY`, `RISK_STATUS`, `RECORD_OBSERVATION` (returns an
`observationDraft` to confirm via `POST /farms/:id/observations`), `TREATMENT` (safety response), `GREETING`, `UNKNOWN`.
`GET /ai/status` → risk model status and LLM provider.

## Africa's Talking callbacks

Called by Africa's Talking, not by the web app. They are form-urlencoded, mounted outside the normal API rate limit,
with their own limit of 300/min. Every URL must carry `?secret=<AT_CALLBACK_SECRET>` (or the `X-Callback-Secret` header):
a missing or wrong secret → 403, and no secret configured → 503. Each call is logged in `event_logs` (INTEGRATION).
Full setup: [AFRICASTALKING.md](AFRICASTALKING.md).

| Method | Path | Body (from AT) | Response |
|---|---|---|---|
| POST | `/integrations/africastalking/ussd` | `sessionId, serviceCode, phoneNumber, networkCode, text` | `text/plain` `CON …` / `END …`. The state machine is stored in `ussd_sessions`; a retried request returns the stored reply. |
| POST | `/integrations/africastalking/sms` | `from, to, text, id, linkId?, date` | `OK` (the reply is sent as a separate real SMS) or `DUPLICATE` |
| POST | `/integrations/africastalking/sms/delivery` | `id, status, phoneNumber, networkCode, failureReason?` | `OK` / `DUPLICATE` / `ALREADY_FINAL` / `UNKNOWN_MESSAGE` (always 200) |

SMS commands: `HATARI`/`RISK`, `USHAURI`/`ACTION`, `RIPOTI`/`REPORT <words>`, `MAVUNO`/`HARVEST <kg>`, `MSAADA`/`HELP`,
with an optional farm code after the command.

## Uploads

`POST /uploads` (multipart field `image`; JPEG/PNG/WebP; ≤ `MAX_UPLOAD_MB`) → `{ file: { id, mimeType, sizeBytes } }`. The file
type is verified by magic bytes, stored under a random name, and metadata saved in `event_logs` (UPLOAD). Use the id as
`imageFileId` in an observation. `GET /uploads/:id` streams the image to its uploader, admins, or users with access to the
farm the observation belongs to.

## Admin (ADMIN only)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/dashboard` | Counts, users by role, predictions by level, feedback, models, recent jobs |
| GET / POST / PATCH | `/admin/users`, `/admin/users/:id` | List (`search`, `role`, `page`, `limit`), create `{ email, password, fullName, phone?, roles[], cooperativeId?, preferredLanguage }`, update `{ fullName?, phone?, isActive?, roles?, cooperativeId? }` |
| GET | `/admin/roles` | Roles + permission keys |
| GET / PUT | `/admin/settings`, `/admin/settings/:key` | `{ value }` — keys: `risk.thresholds`, `ai.mode`, `ai.mlBlendWeight`, `ai.minTrainingRecords`, `actions.requireValidated`, `alerts.missingReportDays`, `alerts.dedupHours`, `environment.maxCacheAgeHours`, `notifications.smsEnabled` (validated) |
| GET / PATCH | `/admin/models`, `/admin/models/:id` | Models + held-out metrics + field evaluation; `{ status: ACTIVE\|TRAINED\|RETIRED }` (one ACTIVE per risk type) |
| GET | `/admin/audit?action&entityType&userId&page` | Audit log |
| GET / POST | `/admin/jobs`, `/admin/jobs/:name/run` | Scheduled jobs; **Run now** |
| GET | `/admin/notification-logs` | SMS/email delivery log |
| GET | `/admin/integrations/africastalking` | Environment, SMS/USSD configured, connection (`CONNECTED`/`NOT_CONFIGURED`/`ERROR`/`UNKNOWN`), callback URLs (placeholders only), last 7 days of SMS by status, recent SMS and callback events. Never includes the API key or secret. |
| POST | `/admin/integrations/africastalking/test-sms` | `{ phone, message? }` sends one real SMS and returns the provider result: `{ status: QUEUED\|SENT\|FAILED\|UNKNOWN\|NOT_CONFIGURED, providerRef, reason }` |
