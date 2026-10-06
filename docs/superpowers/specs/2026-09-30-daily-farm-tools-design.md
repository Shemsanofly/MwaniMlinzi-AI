# Daily farm tools (part 1 of 5) — design

Date: 2026-09-30 · Status: approved in chat · Guided by the pitch deck (MwaniMlinzi AI — Bahari Ops)

Parts: **1 daily farm tools** → 2 record book → 3 cooperatives/extension + pilot metrics → 4 buyer intelligence → 5 licences & billing.

## Why (deck)
- Slide 2: ~40% of farmers dry seaweed directly on the ground; farmers lack timely, farm-specific advice.
- Slide 6: "One farm-level question, answered every day" — give farmers a reason to use the service daily.
- Slide 7: every morning 06:00–06:30 fetch → score → select approved actions → queue SMS; USSD returns the stored result instantly.
- Slide 8: USSD menu `1 Hali ya shamba · 2 Tahadhari · 3 Ripoti tatizo · 4 Rekodi mavuno · 5 Msaada`.
- Slide 10: a *consented* dataset.

## Rules
Real data only (Open-Meteo, live → cached → unavailable; nothing invented). Advice text only from the approved Action Library. Forecasts labelled as forecasts.

## 1. Sea outlook data
- **Tides:** Open-Meteo Marine `hourly=sea_level_height_msl`, 3 days, at the farm point, timezone Africa/Dar_es_Salaam.
  Low/high tides = local minima/maxima of the hourly series. **Work window** for a low tide = the contiguous hours around it
  whose level ≤ low + 25% of (preceding-or-following high − low). A low tide is **daylight** if it falls 06:00–18:30.
  Labelled "Forecast — may differ by about 30 minutes; check the shore". Hourly resolution → times are to the hour.
- **Drying weather:** Open-Meteo forecast `hourly=precipitation_probability,precipitation`, 3 days. Per day, drying hours
  07:00–18:00: max rain probability and total rain (mm). Verdict per day: **BAD** if max prob > 60% or rain > 5 mm;
  **CAUTION** if max prob ≥ 30% or rain ≥ 1 mm; else **GOOD**. Thresholds stored in system settings (`drying.thresholds`),
  editable by the admin, described as starter values awaiting local validation. Verdict ↔ risk level: GOOD=LOW, CAUTION=MEDIUM, BAD=HIGH.
- **Advice:** new `RiskType` value `DRYING_WEATHER`; Action Library entries `DRY_LOW_OK`, `DRY_MEDIUM_CAUTION`, `DRY_HIGH_DELAY`
  (bilingual, validated flag like the rest). Not part of the farm risk engine.
- **Storage:** `sea_outlooks` (farmId, fetchedAt, source LIVE|CACHED, providers, tides JSON, drying JSON). Latest row per farm is
  served; if the live fetch fails the last stored outlook ≤ 48 h old is served as CACHED; otherwise the outlook is `null`
  and the UI says "No forecast available".

## 2. Morning run (slide 7)
Scheduler (Africa/Dar_es_Salaam): 06:00 fetch environment + sea outlook for every active farm → 06:10 risk + actions + alerts
→ 06:20 drying SMS. Second refresh 14:00 (environment + outlook + risk). Existing 6-hourly schedules replaced.

## 3. Channels
- **Web:** farmer dashboard card "Today at sea": next daylight low tide + work window, today's drying verdict + advice,
  3-day strip; source + fetched time; forecast note. Same card on the admin farm detail. API: `GET /api/farms/:id/outlook`.
- **USSD (slide 8):** `1 Hali ya shamba` → `1 Hatari na hatua` (existing status) · `2 Maji kupwa na kukausha` (today's
  daylight low tides + drying verdict + short advice); `2 Tahadhari` → latest ≤3 unresolved real alerts for the caller's farms;
  `3 Ripoti tatizo` (existing); `4 Rekodi mavuno` (existing); `5 Msaada` → `1 Ushauri` (existing advice) · `2 Lugha` · `3 Kuhusu huduma`.
- **SMS drying warning:** farms whose active cycle is within 3 days of expected harvest (or past it) or that recorded a harvest in
  the last 3 days, when today or tomorrow is BAD. Max one per farm per day; respects `smsEnabled` and `notifyHarvest`;
  logged like all SMS. No daily broadcast SMS.

## 4. USSD consent (slide 10)
Onboarding adds a consent step before anything is saved: "Taarifa za shamba lako zitatumika kukupa ushauri na kuboresha huduma.
1. Nakubali 2. Sikubali". Decline → END, nothing stored. `consentAt` = time of acceptance.

## Testing
Unit: tide extrema/windows/daylight, drying verdicts and thresholds, provider parsing (mocked fetch). Integration: outlook
endpoint (fake provider), USSD menus/consent/alerts, drying SMS rule + dedup, scheduler schedule. Frontend: outlook card states
(data, cached, unavailable). Tests never call live APIs.
