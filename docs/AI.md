# AI in MwaniMlinzi

MwaniMlinzi separates **predicting risk** from **deciding what to tell a farmer**:

```
Environmental data ─┐
Farm + crop stage  ─┼─► RiskEngine ──► ExplanationEngine ──► ActionEngine ──► approved recommendation ──► (optional) LLM
Farmer observations ┘   (rules + ML)     (structured factors)   (Action Library)                           explain / translate only
                                                                                     │
                            farmer action ◄──────────────────────────────────────────┘
                                 │
                              outcome ──► model_feedback ──► field metrics + future training data
```

All code lives in `backend/src/ai`, `backend/src/rules`, `backend/src/providers` and `ai/scripts`.

| Component | File | Responsibility |
|---|---|---|
| `FarmContextService` | `services/farmContextService.js` | Loads farm, species, active cycle (**crop age = today − planting date**), latest environment, latest observation (≤14 days), farm history |
| `buildFeatures` | `ai/features.js` | One flat feature set shared by the rules and ML (training and inference) |
| `RiskRuleEngine` | `ai/riskRuleEngine.js` + `rules/riskRules.js` | Transparent logistic scoring per risk type; always available |
| `MLRiskProvider` | `ai/mlRiskProvider.js` | Serves the ACTIVE trained model per risk type; returns `null` if none/corrupt |
| `RiskEngine` | `ai/riskEngine.js` | Orchestrates rules + ML, thresholds, confidence, explanations |
| `ExplanationEngine` | `ai/explanationEngine.js` | English + Kiswahili text built only from structured factors |
| `ActionEngine` | `ai/actionEngine.js` | The only component that chooses farmer actions — from the Action Library |
| `LLMProvider` | `providers/llmProvider.js` | Optional question classification; answers always use grounded templates |
| `RiskService` | `services/riskService.js` | Persists predictions, factors, recommendations, model predictions; triggers alerts |

## 1. Risk types and inputs

| Risk | Horizon | Main inputs |
|---|---|---|
| **HEAT_ICE_ICE** | 72 h | SST, verified SST anomaly when available (otherwise null), 7-day SST trend, crop age, species heat sensitivity, whitening / disease symptoms / % affected, calm warm water, low salinity, farm's history of ice-ice losses |
| **STORM_LINE_DAMAGE** | 72 h | Wave height, wind speed, current velocity, heavy rain, farm exposure, anchoring method, loose/broken gear, reported breakage, history of storm losses |
| **POOR_GROWTH** | 7 days | Slow/unusual growth, crop condition, epiphytes, SST outside optimal range, low salinity, low chlorophyll (nutrients), turbid water, past yield vs. expected, very young crop |
| **HARVEST_WINDOW** | 72 h | Maturity (crop age / cycle length), over-maturity, rain and humidity (drying), strong wind, and the current heat and storm probabilities (cost of waiting) |

Each rule term in `rules/riskRules.js` is a named factor with an English and Kiswahili label, e.g.

```js
{ code: 'SST_ANOMALY', compute: (f) => 1.0 * clamp(f.sstAnomalyC, -1.5, 3), en: …, sw: … }
```

`probability = sigmoid(bias + Σ terms)`. The coefficients are **expert-style starting values for the MVP** and
must be calibrated with local field data before real-world use.

### Levels, confidence and insufficient data

- Levels come from thresholds stored in `system_settings` → `risk.thresholds` (default LOW < 0.30 ≤ MEDIUM < 0.60 ≤ HIGH < 0.80 ≤ CRITICAL). Admins change them in **Admin → Settings**; the backend validates them.
- **Confidence** reflects data completeness: environment present (+), recent observation (+), active planting cycle (+), farm history (+), missing required inputs (−), cached data (−), ML/rule disagreement (−).
- Missing inputs are never filled with defaults: a factor whose input is `null` is skipped and lowers the confidence.
- If a farm has **no environmental reading at all**, the risk is still computed from farm data and farmer reports and stored with `data_source = UNAVAILABLE`; confidence is lower accordingly.
- If confidence < 0.40 the prediction is flagged `insufficientData` and the Action Engine returns *"Insufficient data for a reliable recommendation"* instead of an action.

### Example

A 39-day-old *Kappaphycus* farm on a calm day with live readings close to the monthly climatology gets a LOW
Heat/Ice-Ice risk. When the farmer reports whitening and disease symptoms on 30 % of lines, the engine re-runs at once:
the factors `WHITENING_REPORTED` and `PERCENT_AFFECTED` are added, the probability rises, and if it reaches HIGH
the Action Engine selects e.g. `HEAT_HIGH_INSPECT_24H` — *"Kagua mistari ya mwani ndani ya saa 24 na rekodi dalili za
kubadilika rangi au kukatika."* A HIGH/CRITICAL result creates an alert and notifications. The exact numbers depend on
the day's live readings.

## 2. Explainability

Every prediction stores its factors in `risk_predictions.factors` (`code`, `label`, `label_sw`, `value`, `contribution`, `direction`)
and the full feature vector in `risk_predictions.features`. The UI's **"Why?"** section, the dashboard reasons, the
assistant and SMS/USSD replies all read these stored factors. An LLM never creates or edits factors.

## 3. Hybrid ML

- `ai.mode` setting: `RULE_ONLY` or `HYBRID` (default). In HYBRID mode, if an **ACTIVE** model exists for a risk type,
  `probability = (1 − w)·rule + w·ml` with `w = ai.mlBlendWeight` (default 0.4). Otherwise the rule baseline is used.
- Predictions record `model_type` (`RULE`/`HYBRID`), `model_version`, `rule_probability` and `ml_probability`; ML outputs are
  also stored in `risk_predictions.ml_model_id`.
- The UI shows **"Rule-based baseline"** or **"Hybrid: rule baseline + ML model vN"**.
- If the model file is missing/corrupt the provider logs a warning and the rule engine is used — no fabricated output.

### Algorithm

Dependency-free **logistic regression** (batch gradient descent, L2, class-balanced) in `backend/src/ai/ml/`. It was chosen
over TensorFlow.js for the MVP because it needs no native binaries, is deterministic and fully inspectable. The same
`featureVector.js` (feature list + imputation) is used for training and inference.

### Training pipeline (field outcomes only)

```bash
cd backend
npm run ai:train                         # trains from recorded field outcomes, registers models as TRAINED
npm run ai:train -- --activate           # …and activates them
```

Training data = stored risk predictions (their input feature vectors) labelled by what farmers later recorded as the
outcome (`farm_records.risk_materialized` (OUTCOME)). Simulations, seeded predictions, flagged predictions and insufficient-data features are excluded. Repeated reports for one prediction count once; contradictory labels are excluded. Nothing is generated.

Steps performed by `ai/scripts/trainModel.js`: **load field outcomes → validate → preprocess (impute + standardise) →
train → evaluate on a stratified 20% hold-out → save model JSON (`ai/models/<RISK>_vN.json`) → save metrics
(`<RISK>_vN.metrics.json`) → register the version in `ml_models` + `event_logs` (METRIC)**.
A risk type is skipped when it has fewer than `ai.minTrainingRecords` (default 300) valid records or fewer than 20
examples of either class; the rule engine stays in use for it. On a new installation every risk type is skipped until
enough outcomes have been recorded.

Metrics reported: precision, recall, F1, accuracy, ROC-AUC, confusion matrix — all computed on held-out field outcomes.

### Model monitoring (field evaluation)

`ModelMonitoringService` compares predictions (HIGH/CRITICAL = positive) with recorded outcomes (`risk_materialized`) and
reports precision/recall/F1/false positives/false negatives in **Admin → Models**. With fewer than 30 outcomes it says the
numbers are not yet meaningful. The nightly `model-monitoring` job stores FIELD metrics per model.

## 4. Action Engine

Action Library entries (`action_library`) contain: `risk_type`, `minimum_risk_level`, `maximum_risk_level`, `crop_stage`,
`conditions` (JSON list of `{feature, op, value}` — e.g. `maturityRatio ≥ 0.9` and `rainfallMm ≤ 5`), `action`/`action_sw`,
`explanation`/`explanation_sw`, `urgency`, `urgency_hours`, `priority`, `source`, `validated`, `enabled`, `escalate_to_extension`.

Selection: enabled entries of the same risk type whose level range, crop stage and conditions match (conditions on missing
data fail), most specific first. With `actions.requireValidated = true` only entries validated (by the admin, with local experts) can be
recommended. Editing an entry's text resets its validation. Open recommendations for the same risk type are superseded
when advice changes; unchanged advice keeps its original due date.

The 17 seeded entries (e.g. *"Inspect lines within 24 hours and record whitening or breakage"*, *"Check anchors and loose
lines"*, *"Harvest window is favorable"*, *"Improve drying setup and avoid ground contact"*) are a **starter rule set**
(source *"MwaniMlinzi starter rule set v1 — awaiting validation by local seaweed extension experts"*). They start
unvalidated; the admin validates each entry in **Admin → Action library** after review with local experts.

## 5. LLM (optional)

Configured with `LLM_PROVIDER=anthropic|openai`, `LLM_API_KEY`, `LLM_MODEL` (defaults: `claude-sonnet-5` / `gpt-4o-mini`).

- Known questions use deterministic intent matching. An optional LLM classifies unfamiliar questions into a restricted
  intent list. OpenAI uses a strict JSON-schema response; the server validates the enum for every provider.
  Generated prose never becomes a displayed farm fact. Answers use farm records and structured risk factors;
  only validated guidance is returned as `approvedAction`.
- Treatment questions ("What medicine should I use?", "Nitumie dawa gani?") never reach the LLM: the safety policy answers
  *"I can help you record the symptoms and show approved farm guidance. For treatment decisions, contact an extension officer."*
- Natural language like *"I see whitening on 20% of my lines"* is parsed into a structured observation **draft** the farmer
  confirms before it is saved.
- No key, a timeout or an error → deterministic templates (`generatedBy: "TEMPLATE"`). The app is fully functional without an LLM.

## 6. Environmental providers and fallback

| Provider | Default (empty variable) | Alternative | Disable |
|---|---|---|---|
| Weather (`WEATHER_PROVIDER`) | `open-meteo` (free, no key) | `openweathermap` + `WEATHER_API_KEY` | `none` |
| Ocean (`OCEAN_PROVIDER`) | `open-meteo-marine` (free, no key) | `stormglass` + `OCEAN_API_KEY` | `none` |
| LLM (`LLM_PROVIDER`) | deterministic templates | `anthropic`, `openai` + `LLM_API_KEY` | — |
| SMS / USSD | not configured (`NOT_CONFIGURED`) | Africa's Talking (`AT_*`) | — |

`EnvironmentalProvider` tries **LIVE** → **CACHED** (the last live reading within ±0.05° of the farm and within
`environment.maxCacheAgeHours`, default 48 h) → **no reading**. Weather and ocean fall back independently: if one
provider is down, the available block is stored and the other stays `null`. Each record stores `source` and `provider`;
the per-farm snapshot is labelled CACHED if either part came from the cache. Values a provider does not supply stay
`null` — Open-Meteo Marine has no salinity or chlorophyll, so those factors are skipped. Live values use the worst case
over the 72 h forecast where available. Provider timestamps are retained. Cached inputs keep their original timestamps
and expired inputs are unavailable. These are external model forecasts, not on-farm sensor measurements.
Production providers return SST anomaly as null because no verified local climatology is configured.
The approximate monthly array is retained only for isolated test fixtures.

Data sources used on predictions: `LIVE`, `CACHED`, `UNAVAILABLE` (no reading; farm data and reports only) and
`SIMULATION` (what-if runs).

## 6b. Daily sea outlook: tides and drying weather

Farmers work off-bottom farms at low tide and dry the harvest in the sun, so the app gives a daily outlook per farm
(`GET /api/farms/:id/outlook`, the farmer dashboard card *Today at sea*, USSD `1 → 2`).

- **Tides** — Open-Meteo Marine hourly `sea_level_height_msl` (3 days, local Africa/Dar_es_Salaam time). Low/high tides are
  the local minima/maxima of the hourly series. The **work window** of a low tide is the run of hours whose level stays within
  25 % of the tide range above the low (range measured to the lower of the neighbouring highs). Only low tides between 06:00
  and 18:30 are suggested for work. The low-water window is an estimate from hourly sea levels, not a measured safe-access
  window. No fixed 30-minute accuracy is claimed; farmers should check local guidance and shore conditions.
- **Drying weather** — Open-Meteo hourly rain probability and amount during drying hours (07:00–18:00). Per day:
  **BAD** above 60 % chance or 5 mm, **CAUTION** from 30 % or 1 mm, otherwise **GOOD** (setting `drying.thresholds`, starter
  values awaiting local validation). No data → no verdict (never "GOOD" by default).
  The displayed probability is the **highest hourly probability in that window**, not the probability of rain now or over
  the whole day. Hourly precipitation covers the preceding hour, so 08:00–18:00 values cover 07:00–18:00 drying.
  Stored hourly values recompute today's verdict from complete future drying hours. After 18:00, today's verdict and advice
  disappear, and only upcoming days remain. A rainy morning cannot make the afternoon look rainy once those hours have passed.
- **Weather now** — the same weather API supplies `current.precipitation`, temperature, time and interval. These are labelled
  as **API model estimates**, never station observations. Missing current precipitation or time stays unavailable. Current
  data older than 30 minutes is hidden. See [Open-Meteo weather documentation](https://open-meteo.com/en/docs).
- **Advice** — the Action Library entries `DRY_LOW_OK`, `DRY_MEDIUM_CAUTION`, `DRY_HIGH_DELAY` (category *Drying weather*),
  validated and edited like every other action. This targets ground drying (deck slide 2: ~40 % of farmers dry on the ground).
- **Fallback** — refresh every 15 minutes → the last stored outlook ≤ `environment.maxCacheAgeHours`, capped at 48 hours
  (labelled *Saved API forecast*) → none
  ("No sea forecast for this farm yet"). A farm without a map point has no outlook.
  Each part retains its own age; an expired rain part is not refreshed by a successful tide request. Requested coordinates
  are stored with the hourly forecast, and forecasts for an earlier farm location are not reused.
  The existing `sea_outlooks.drying` JSON stores hourly series, current weather and provenance; no table was added.

Simple storm explanations distinguish recorded exposure, anchoring method and reported equipment condition. An anchoring
method does not prove weak anchors. `STORM_LOW_REPORTED_DAMAGE` prompts a safe inspection when damage is reported, even if
the forecast storm score is low. Demo (`SEED`) and future-dated observations are excluded from real farm assessments.
For an existing deployment, run `node scripts/install-damage-inspection-action.js` from `backend` to install this one
new action without reseeding records or overwriting expert edits. It remains awaiting expert validation.

## 7. Harvest forecasting

`HarvestForecastService` requires at least three completed cycles with recorded dry harvests and known planted lines.
Batches are summed per cycle; cycles containing wet harvests are excluded rather than converted using an assumed ratio.
The estimate is current planted lines × average recorded dry yield per line from the latest six eligible cycles.
Low/high use the observed minimum/maximum yield per line, not an invented confidence interval.
No species-default quantities, guessed loss deductions or quality grades are emitted. Planned dates are retained,
including overdue dates; the interface asks farmers to inspect maturity. Measured accuracy is unavailable.
Legacy forecast rows remain stored for audit but are excluded from current farmer DTOs and forecast lists.
The compatibility column `riskAdjustedQuantityKg` holds the historical baseline estimate, with method `recorded-cycle-yield-v2`.

## Farmer data status and coordinates

`GET /api/farms/:id/intelligence` enforces farm access and reports source timestamps, missing inputs, recorded
observations/harvests, harvest-history eligibility and training readiness per risk. The farmer refresh button uses
`POST /api/farms/:id/risks/run` to request fresh provider data and update risk and harvest estimates.
Rule scores are provisional estimates; input completeness is not measured prediction accuracy. Predictions made
before the `real-inputs-v2` checks require a refresh before they can drive current advice.

`GET /api/location/reverse?latitude=…&longitude=…&language=en|sw` looks up the nearest mapped place through Nominatim.
The farm form fills place, district and region for device GPS, typed coordinates and map picks; corrections remain editable.
Missing address fields remain blank. Requests are authenticated, validated, cached for 24 hours and serialised at
one request per 1.1 seconds per backend instance. `GEOCODING_URL` supports another Nominatim-compatible service or `none`.
Use a dedicated service for multiple backend instances or substantial traffic.

References: [Open-Meteo marine forecasts](https://open-meteo.com/en/docs/marine-weather-api),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Nominatim reverse geocoding](https://nominatim.org/release-docs/latest/api/Reverse/),
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

## 8. Simulation (What-if planner)

The admin **What-if planner** (`/tools/scenarios`) calls `POST /api/risk/predict` with `overrides` (SST anomaly,
elevated-SST days, waves, wind, rain, current, salinity). This runs the full pipeline — features → rule/ML risk → level → explanation → Action Engine → alerts — on an in-memory copy of the
environment. Results are stored with `is_simulation = true` / source `SIMULATION`, alerts are prefixed `[SIMULATION]`, no
SMS is sent, nothing is sent to farmers, and real "current risk" views ignore simulations.

## 9. Scheduled jobs (node-cron, Africa/Dar_es_Salaam)

| Job | Schedule | What |
|---|---|---|
| `fetch-environment` | 06:00 and 14:00 | weather + ocean provider chain and the tide / drying-weather outlook for every active farm |
| `run-risk-predictions` | 06:10 and 14:10 | features → risk → actions → alerts |
| `drying-alerts` | 06:20 | drying-weather warnings (in-app + SMS) for farms at or near harvest when rain is likely today/tomorrow |
| `harvest-forecasts` | 06:30 and 14:30 | regenerate forecasts |
| `missing-reports` | daily 06:00 | MISSING_REPORT alerts |
| `model-monitoring` | daily 02:00 | field metrics from outcomes |

Admins can run any job with **Run now** (Admin dashboard). Each run is logged in `event_logs` (JOB). Disable the scheduler with `ENABLE_JOBS=false`.
