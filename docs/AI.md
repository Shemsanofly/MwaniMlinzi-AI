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
| `buildFeatures` | `ai/features.js` | One flat feature set shared by rules, ML and the synthetic dataset |
| `RiskRuleEngine` | `ai/riskRuleEngine.js` + `rules/riskRules.js` | Transparent logistic scoring per risk type; always available |
| `MLRiskProvider` | `ai/mlRiskProvider.js` | Serves the ACTIVE trained model per risk type; returns `null` if none/corrupt |
| `RiskEngine` | `ai/riskEngine.js` | Orchestrates rules + ML, thresholds, confidence, explanations |
| `ExplanationEngine` | `ai/explanationEngine.js` | English + Kiswahili text built only from structured factors |
| `ActionEngine` | `ai/actionEngine.js` | The only component that chooses farmer actions — from the Action Library |
| `LLMProvider` | `providers/llmProvider.js` | Optional rephrasing/translation; deterministic templates otherwise |
| `RiskService` | `services/riskService.js` | Persists predictions, factors, recommendations, model predictions; triggers alerts |

## 1. Risk types and inputs

| Risk | Horizon | Main inputs |
|---|---|---|
| **HEAT_ICE_ICE** | 72 h | SST, SST anomaly vs. monthly climatology, days of elevated SST (>0.5 °C), 7-day SST trend, crop age, species heat sensitivity, whitening / disease symptoms / % affected, calm warm water, low salinity, farm's history of ice-ice losses |
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
- If confidence < 0.40 the prediction is flagged `insufficientData` and the Action Engine returns *"Insufficient data for a reliable recommendation"* instead of an action.

### Example (seeded FARM001)

39-day-old *Kappaphycus*, SST anomaly ≈ +1.5 °C for 8 days, whitening reported →
`HEAT_ICE_ICE = HIGH (~78%)`, factors `SST_ANOMALY`, `WHITENING_REPORTED`, `SST_PERSISTENCE`, `CROP_STAGE` …
→ Action `HEAT_HIGH_INSPECT_24H`: *"Kagua mistari ya mwani ndani ya saa 24 na rekodi dalili za kubadilika rangi au kukatika."*
Submitting a new observation with whitening + disease symptoms on 30% of lines raises it to **CRITICAL** and the action
becomes *escalate to an extension officer*; a `HEAT_CRITICAL` alert and notifications are created.

## 2. Explainability

Every prediction stores its factors in `risk_factors` (`code`, `label`, `label_sw`, `value`, `contribution`, `direction`)
and the full feature vector in `risk_predictions.features`. The UI's **"Why?"** section, the dashboard reasons, the
assistant and SMS/USSD replies all read these stored factors. An LLM never creates or edits factors.

## 3. Hybrid ML

- `ai.mode` setting: `RULE_ONLY` or `HYBRID` (default). In HYBRID mode, if an **ACTIVE** model exists for a risk type,
  `probability = (1 − w)·rule + w·ml` with `w = ai.mlBlendWeight` (default 0.4). Otherwise the rule baseline is used.
- Predictions record `model_type` (`RULE`/`HYBRID`), `model_version`, `rule_probability` and `ml_probability`; ML outputs are
  also stored in `model_predictions`.
- The UI shows **"Rule-based baseline"** or **"Hybrid: rule baseline + ML model v1 (trained on synthetic data)"**.
- If the model file is missing/corrupt the provider logs a warning and the rule engine is used — no fabricated output.

### Algorithm

Dependency-free **logistic regression** (batch gradient descent, L2, class-balanced) in `backend/src/ai/ml/`. It was chosen
over TensorFlow.js for the MVP because it needs no native binaries, is deterministic and fully inspectable. The same
`featureVector.js` (feature list + imputation) is used for training and inference.

### Training pipeline

```bash
cd backend
npm run ai:dataset                       # ai/datasets/synthetic_seaweed_dataset.{json,csv}  (--n 500..20000, --seed)
npm run ai:train                         # trains 4 models, registers them as TRAINED
npm run ai:train -- --activate           # …and activates them
npm run ai:train -- --include-field      # adds recorded outcomes from PostgreSQL as labelled records
```

Steps performed by `ai/scripts/trainModel.js`: **load → validate → preprocess (impute + standardise) → train →
evaluate on a stratified 20% hold-out → save model JSON (`ai/models/<RISK>_vN.json`) → save metrics
(`<RISK>_vN.metrics.json`) → register the version in `ml_models` + `model_metrics`**.
Training is refused for a risk type with fewer than `ai.minTrainingRecords` (default 300) valid records or fewer than
20 examples of either class — the rule engine stays in use.

Metrics reported: precision, recall, F1, accuracy, ROC-AUC, confusion matrix — all computed on held-out data. **They
describe how well the model fits the synthetic generating process, not real-world accuracy.**

### Synthetic data

`ai/scripts/generateDataset.js` samples 500–20,000 records from a hand-written latent process (heat stress, storm stress,
growth stress, harvest-value loss) with interactions and noise, plus noisy farmer observations. It is deliberately different
from the rule coefficients so the ML model is not a copy of the rules. Every record has `synthetic_demo_data: true`; the
models are flagged `synthetic_data = true` and the UI shows a SYNTHETIC badge.

### Model monitoring (field evaluation)

`ModelMonitoringService` compares predictions (HIGH/CRITICAL = positive) with recorded outcomes (`risk_materialized`) and
reports precision/recall/F1/false positives/false negatives in **Admin → Models**. With fewer than 30 outcomes it says the
numbers are not yet meaningful. The nightly `model-monitoring` job stores FIELD metrics per model. Seeded outcomes are demo data.

## 4. Action Engine

Action Library entries (`action_library`) contain: `risk_type`, `minimum_risk_level`, `maximum_risk_level`, `crop_stage`,
`conditions` (JSON list of `{feature, op, value}` — e.g. `maturityRatio ≥ 0.9` and `rainfallMm ≤ 5`), `action`/`action_sw`,
`explanation`/`explanation_sw`, `urgency`, `urgency_hours`, `priority`, `source`, `validated`, `enabled`, `escalate_to_extension`.

Selection: enabled entries of the same risk type whose level range, crop stage and conditions match (conditions on missing
data fail), most specific first. With `actions.requireValidated = true` only entries validated by an extension officer can be
recommended. Editing an entry's text resets its validation. Open recommendations for the same risk type are superseded
when advice changes; unchanged advice keeps its original due date.

The 17 seeded entries (e.g. *"Inspect lines within 24 hours and record whitening or breakage"*, *"Check anchors and loose
lines"*, *"Harvest window is favorable"*, *"Improve drying setup and avoid ground contact"*) are a **demo rule set that must be
validated by local seaweed extension experts before real-world deployment**.

## 5. LLM (optional)

Configured with `LLM_PROVIDER=anthropic|openai`, `LLM_API_KEY`, `LLM_MODEL` (defaults: `claude-sonnet-5` / `gpt-4o-mini`).

- The assistant first builds a deterministic answer from stored factors, approved actions and farm records. The LLM may
  only **rephrase/translate** that answer (system prompt forbids new advice, treatments, numbers or causes). The approved
  action is returned separately as structured data and shown verbatim.
- Treatment questions ("What medicine should I use?", "Nitumie dawa gani?") never reach the LLM: the safety policy answers
  *"I can help you record the symptoms and show approved farm guidance. For treatment decisions, contact an extension officer."*
- Natural language like *"I see whitening on 20% of my lines"* is parsed into a structured observation **draft** the farmer
  confirms before it is saved.
- No key, a timeout or an error → deterministic templates (`generatedBy: "TEMPLATE"`). The app is fully functional without an LLM.

## 6. Environmental providers and fallback

| Provider | Live implementation | Demo implementation |
|---|---|---|
| Weather | `open-meteo` (no key) or `openweathermap` (`WEATHER_API_KEY`) | `DemoWeatherProvider` |
| Ocean | `open-meteo-marine` (no key) or `stormglass` (`OCEAN_API_KEY`) | `DemoOceanProvider` |
| LLM | `anthropic`, `openai` | `TemplateLLMProvider` |
| SMS | `africastalking` | `SimulatedSMSProvider` |
| USSD | Africa's Talking callback (`/api/ussd/callback`) | USSD simulator (same state machine) |

`EnvironmentalProvider` tries **LIVE** (only when `DEMO_MODE=false` and configured) → **CACHED** (last live reading near the
farm within `environment.maxCacheAgeHours`) → **DEMO**. Weather and ocean fall back independently; each record stores
`source` and `provider`, and the combined per-farm snapshot is labelled DEMO if either part is demo. Live values use the
worst case over the 72 h forecast where available. SST anomaly for live SST is computed against an approximate Zanzibar
monthly climatology (`providers/climatology.js`) — replace it with a proper per-cell climatology for production.
Demo data is deterministic per location/day and follows each demo farm's scenario (NORMAL, HEAT, STORM, NEAR_HARVEST, POOR_GROWTH).

## 7. Harvest forecasting

`HarvestForecastService`: `expected = lines × yield per line` (farm history if available, else species default) →
`riskAdjusted = expected × (1 − expected loss)` where expected loss = 0.35·P(heat) + 0.25·P(storm) + 0.2·P(poor growth) +
0.1·P(harvest window) (capped) → low/high range widened by uncertainty (lower confidence and less history ⇒ wider).
Aggregated by farm, cooperative, district, week and 7/14/30-day horizons. Quantities are kg of dried seaweed.

## 8. Simulation

`POST /api/risk/predict` with `overrides` (SST anomaly, elevated-SST days, waves, wind, rain, current, salinity) runs the
full pipeline — features → rule/ML risk → level → explanation → Action Engine → alerts — on an in-memory copy of the
environment. Results are stored with `is_simulation = true` / source `SIMULATION`, alerts are prefixed `[SIMULATION]`, no
SMS is sent and real "current risk" views ignore simulations.

## 9. Scheduled jobs (node-cron, Africa/Dar_es_Salaam)

| Job | Schedule | What |
|---|---|---|
| `fetch-environment` | every 6 h | provider chain for every active farm |
| `run-risk-predictions` | every 6 h (+15 min) | features → risk → actions → alerts |
| `harvest-forecasts` | every 6 h (+30 min) | regenerate forecasts |
| `missing-reports` | daily 06:00 | MISSING_REPORT alerts |
| `model-monitoring` | daily 02:00 | field metrics from outcomes |

Admins can run any job with **Run now** (Admin dashboard). Each run is logged in `job_runs`. Disable the scheduler with `ENABLE_JOBS=false`.
