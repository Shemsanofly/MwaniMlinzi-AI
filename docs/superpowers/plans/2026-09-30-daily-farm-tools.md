# Daily Farm Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every farmer a real, daily reason to use MwaniMlinzi: today's low-tide work window and drying-weather verdict (web, USSD, SMS), produced by a 06:00 morning run, with the deck's USSD menu and USSD consent.

**Architecture:** Pure functions (`src/ai/seaOutlook.js`) turn Open-Meteo hourly sea level and rain forecasts into tide events/work windows and daily drying verdicts. `SeaOutlookService` fetches (live → stored ≤48 h → null), stores `sea_outlooks` rows and serialises them with approved Action Library advice (new risk type `DRYING_WEATHER`). Jobs run it every morning and send drying alerts; USSD and the farmer dashboard read the stored result.

**Tech Stack:** Node 22 ESM, Express 5, Prisma 6 / PostgreSQL, Jest + supertest; React 19, TanStack Query, i18next, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-daily-farm-tools-design.md`

## Global Constraints

- Real data only: Open-Meteo live → last stored outlook ≤ 48 h (labelled CACHED) → `null` ("No forecast available"). Never invent values.
- Times are local Africa/Dar_es_Salaam, requested with `timezone=Africa/Dar_es_Salaam`, kept as `YYYY-MM-DDTHH:mm` strings.
- Tides labelled "Forecast — may differ by about 30 minutes; check the shore". Daylight = 06:00–18:30. Work window = hours with level ≤ low + 25 % of (adjacent high − low).
- Drying hours 07:00–17:59. Verdict: BAD if maxProb > badProbability (60) or rain > badRainMm (5); CAUTION if maxProb ≥ cautionProbability (30) or rain ≥ cautionRainMm (1); else GOOD. Stored in setting `drying.thresholds`. GOOD=LOW, CAUTION=MEDIUM, BAD=HIGH.
- Advice text only from Action Library (`DRY_LOW_OK`, `DRY_MEDIUM_CAUTION`, `DRY_HIGH_DELAY`, riskType `DRYING_WEATHER`).
- USSD main menu exactly: `1. Hali ya shamba 2. Tahadhari 3. Ripoti tatizo 4. Rekodi mavuno 5. Msaada` (en: `1. Farm status 2. Alerts 3. Report a problem 4. Record harvest 5. Help`). Screens ≤ 182 chars (`fitScreen`).
- Drying SMS only for farms at/near harvest (expected harvest ≤ 3 days away or passed, or harvest recorded in last 3 days) when today or tomorrow is BAD; ≤ 1 per farm per local day; respects `smsEnabled` + `notifyHarvest`.
- Tests never call live APIs (`WEATHER_PROVIDER/OCEAN_PROVIDER=none`; outlook provider injected).

## Review Focus

- A farm without a map point → outlook `null`, UI says no forecast, USSD says so; no crash. (Task 3 test)
- Open-Meteo returns all-null or missing hourly arrays → treated as unavailable, not zero rain / GOOD. (Task 1 + Task 3 tests)
- Local-day boundaries: "today" computed in Africa/Dar_es_Salaam even when the server runs in UTC; a 23:00 UTC run belongs to the next local day. (Task 1 `localDate` test)
- Drying alert run twice on the same day → one alert, one SMS. (Task 4 test)
- USSD declines consent → no user/farmer/farm rows created. (Task 5 test)

---

### Task 1: Pure sea-outlook calculations

**Files:**
- Create: `backend/src/ai/seaOutlook.js`
- Test: `backend/tests/unit/seaOutlook.test.js`

**Interfaces:**
- Produces: `extractTides(times: string[], levels: (number|null)[]) → TideEvent[]` where `TideEvent = { type: 'LOW'|'HIGH', time, levelM, daylight?: boolean, window?: { start, end } }` (daylight/window on LOW only);
  `dryingDays(times, probability, rainMm, thresholds = DEFAULT_DRYING_THRESHOLDS) → { date, maxRainProbability, rainMm, verdict: 'GOOD'|'CAUTION'|'BAD'|null, level: 'LOW'|'MEDIUM'|'HIGH'|null }[]`;
  `localDate(d = new Date(), tz = 'Africa/Dar_es_Salaam') → 'YYYY-MM-DD'`; `localDateTime(d) → 'YYYY-MM-DDTHH:mm'`; `DEFAULT_DRYING_THRESHOLDS`.

- [ ] **Step 1: Write failing tests** — cases: semidiurnal series yields alternating LOW/HIGH at the right hours; window for a LOW spans contiguous hours ≤ low + 25 % of range; LOW at 12:00 daylight true, LOW at 00:00 false; null levels ignored and < 3 points → `[]`; drying: probs [10,20,…] & 0 mm → GOOD; max 45 % → CAUTION; 70 % → BAD; 6 mm → BAD; all-null hours → verdict null; hours outside 07–17 ignored; thresholds overridable; `localDate(new Date('2026-09-30T22:30:00Z'))` → `'2026-10-01'`.
- [ ] **Step 2: Run** `cd backend && node --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/seaOutlook.test.js` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `seaOutlook.js` (local-extrema scan; window expansion from the LOW index while level ≤ threshold, where range uses the nearer adjacent HIGH or series max; drying groups by `time.slice(0,10)`, hours `07`–`17`).
- [ ] **Step 4: Run tests** — PASS.

### Task 2: Schema, settings and approved drying advice

**Files:**
- Modify: `backend/prisma/schema.prisma` (enum `RiskType` + `DRYING_WEATHER`; enum `AlertType` + `DRYING_WEATHER`; model `SeaOutlook` → `sea_outlooks` with `farmId`, `fetchedAt`, `tideProvider?`, `rainProvider?`, `tides Json?`, `drying Json?`, index `[farmId, fetchedAt]`; `Farm.seaOutlooks SeaOutlook[]`)
- Create: `backend/prisma/migrations/20260930120000_daily_farm_tools/migration.sql` (via `prisma migrate diff --from-migrations … --shadow-database-url` or from the dev DB)
- Modify: `backend/src/services/settingsService.js` (add `drying.thresholds` default `{ cautionProbability: 30, badProbability: 60, cautionRainMm: 1, badRainMm: 5 }`, description "Starter values awaiting local validation…")
- Modify: `backend/src/controllers/adminController.js` validator map (object with the four finite numbers, caution ≤ bad)
- Modify: `backend/prisma/data/actionLibrary.js` (3 entries, `riskType: 'DRYING_WEATHER'`, LOW/MEDIUM/HIGH, bilingual, urgency ROUTINE/SOON/URGENT)
- Test: `backend/tests/unit/actionEngine.test.js` (existing "bilingual + awaiting validation" test covers the new entries); settings validator test in `tests/integration/auth.test.js`-style admin call is optional.

- [ ] Steps: edit schema → generate migration SQL → `npx prisma generate` → add library/settings → run full backend suite (fixtures seed inserts the library; must stay green).

### Task 3: Outlook provider, service and API

**Files:**
- Create: `backend/src/providers/outlookProvider.js` — `OpenMeteoOutlookProvider.fetch({latitude, longitude}) → { tide: {times, levels}|null, rain: {times, probability, mm}|null, providers: { tide, rain }, errors }` (two independent requests with `fetchJson`; a part is null if its request fails or all values are null); `createOutlookProvider(config = env)` returns null when both `weather.provider` and `ocean.provider` are `'none'`.
- Create: `backend/src/services/seaOutlookService.js` — `getOutlookProvider/setOutlookProvider`, `refreshForFarm(farm)`, `currentForFarm(farm, { maxAgeHours = 6 })`, `serialize(row, { now, stale })` → `{ fetchedAt, source: 'LIVE'|'CACHED', providers, note, today: { date, lowTides[], nextWorkWindow, drying, advice }, days: drying[] }`, `adviceFor(level, lang?)` from Action Library (respects `actions.requireValidated`).
- Modify: `backend/src/routes/farm.routes.js` (`r.get('/:id/outlook', farmViewers, c.farmOutlook)`), `backend/src/controllers/farmController.js` (`farmOutlook`: access check → `{ outlook }`), `backend/src/config/openapi.js`.
- Test: `backend/tests/unit/providers.test.js` (mocked `fetch`: parses both; one failing part → null part + error), `backend/tests/integration/outlook.test.js` (inject fake provider: LIVE outlook with tides/drying/advice; provider failing after a stored row → CACHED; no location → `outlook: null`; other farmer's farm → 403).

### Task 4: Morning run and drying alerts

**Files:**
- Create: `backend/src/services/dryingAlertService.js` — `DryingAlertService.run({ now })`: active farms with location; outlook via `SeaOutlookService.currentForFarm`; eligible if active cycle `expectedHarvestDate ≤ today+3` or a harvest in last 3 days; if today or tomorrow `verdict === 'BAD'` and no `DRYING_WEATHER` alert for the farm since local midnight → create Alert (severity HIGH, bilingual title/message incl. day + advice) + in-app notification + `SMSService.sendToUser(user, { type: 'DRYING_WARNING', priority: 'WARNING', text })`. Returns `{ farms, eligible, alerts }`.
- Modify: `backend/src/services/smsService.js` (`PREF_FOR_TYPE.DRYING_WARNING = 'notifyHarvest'`)
- Modify: `backend/src/jobs/jobs.js` — schedules: `fetch-environment` `0 6,14 * * *` (also refreshes outlook), `run-risk-predictions` `10 6,14 * * *`, `drying-alerts` `20 6 * * *` (new), `harvest-forecasts` `30 6,14 * * *`; `missing-reports` unchanged.
- Test: `backend/tests/integration/dryingAlerts.test.js` (fake provider BAD tomorrow + near-harvest fixture farm → 1 alert + 1 SMS log `DRYING_WARNING`; second run same day → still 1; GOOD → none; `notifyHarvest=false` → alert but SMS SKIPPED); jobs schedule assertion in same file.

### Task 5: USSD — deck menu, sea outlook screen, alerts, help, consent

**Files:**
- Modify: `backend/src/services/ussdService.js` — texts (sw/en) `main`, `statusMenu` (`1. Hatari na hatua 2. Maji kupwa na kukausha`), `helpMenu` (`1. Ushauri 2. Lugha 3. Kuhusu huduma`), `about`, `consent`, `consentDeclined`, `noAlerts`, `noOutlook`, tide/drying words. States: `MAIN` → `1` STATUS_MENU (then farm pick if >1) · `2` alerts list (END) · `3` symptoms · `4` harvest · `5` HELP_MENU. Onboarding: after language → `ONBOARD_CONSENT` → `1` continue to name, `2` END declined (nothing saved).
- Modify: `backend/tests/integration/channels.test.js` — update menu strings and paths: status `['1','1','1']`, advice `['5','1','1']`, language `['5','2','2']`, report `['3', …]`, harvest `['4', …]`; onboarding inputs gain `'1'` consent after language; add tests: decline consent → no user; `2` alerts lists newest unresolved alerts or `noAlerts`; `1 → 2` outlook screen with fake provider shows low tide time and drying word, and `noOutlook` when unavailable.

### Task 6: Web — "Today at sea" card, admin settings, labels

**Files:**
- Modify: `frontend/src/api/endpoints.js` (`farmApi.outlook(id)`)
- Create: `frontend/src/components/outlook/SeaOutlookCard.jsx` (states: loading, `outlook === null` → "No forecast available for this farm yet", data → next daylight low tide + work window, today's drying verdict with icon + words + advice, 3-day strip, source badge + fetched time, forecast note)
- Modify: `frontend/src/pages/farmer/Dashboard.jsx` (card after next action), `frontend/src/pages/extension/FarmDetail.jsx` (card in overview), admin Settings (`drying.thresholds` editable like `risk.thresholds`), i18n `en.json`/`sw.json` (`outlook.*`, risk type `DRYING_WEATHER`, alert type `DRYING_WEATHER`).
- Test: `frontend/src/components/outlook/__tests__/SeaOutlookCard.test.jsx` (data / cached / null), update Dashboard test mock with `farmApi.outlook`.

### Task 7: Docs and deck wording

- Modify: `README.md`, `docs/AI.md`, `docs/API.md`, `docs/AFRICASTALKING.md` (menu), `docs/WALKTHROUGH.md` (daily tools step).
- Report to user: exact slide text corrections for slides 5, 7, 8, 13.
