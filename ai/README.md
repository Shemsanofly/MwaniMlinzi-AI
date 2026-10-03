# ai/ — model training from field outcomes

Two model paths ship with MwaniMlinzi; both are optional and the rule-based risk engine is always on.

| Tier | Framework | Lives in | Required? |
|---|---|---|---|
| **1. Remote GBM service** | LightGBM (or XGBoost) via FastAPI | [`ai/ml-service/`](./ml-service/) | Optional — Python runtime |
| **2. Local baseline** | Dependency-free JavaScript logistic regression | `backend/src/ai/ml/` | Zero deps — ships in Node backend |
| **3. Baseline fallback** | Rule-based risk engine | `backend/src/rules/` | Always on |

`MLRiskProvider.predict()` tries tier 1 first (deck slide 7 — "LightGBM or XGBoost"), falls through to tier 2
when the service is unreachable or has no model for the risk type, then to tier 3. Every prediction is labelled
with the model that actually produced it, so the UI never over-claims.

```
ai/
├── ml-service/              Python microservice (LightGBM/XGBoost). Optional; see ml-service/README.md
├── scripts/
│   └── trainModel.js        load field outcomes → validate → preprocess → train → evaluate → save → register (logistic baseline)
├── datasets/                (unused; kept for exported datasets, git-ignored)
└── models/                  <RISK_TYPE>_vN.json + .metrics.json + gbm/<RISK_TYPE>.txt (generated, git-ignored)
```

## Commands (from `backend/`)

```bash
npm run ai:train                              # train from field outcomes; register models as TRAINED (rule engine still used)
npm run ai:train -- --activate                # register and activate (HYBRID mode)
```

The script can also be run directly: `node ai/scripts/trainModel.js [--activate]` (it reads `backend/.env` for `DATABASE_URL`).

## Training data

Each training record is a stored, non-simulation risk prediction (its input feature vector from
`risk_predictions.features`) labelled by the outcome a farmer later recorded for it (`action_outcomes.risk_materialized`:
did the risk happen?). These records come from the feedback loop: prediction → recommendation → farmer action → outcome.

A risk type is trained only when it has at least `ai.minTrainingRecords` valid records (default 300, **Admin →
Settings**) and at least 20 examples of each class. Otherwise it is skipped with a message and the rule-based engine
stays in use for it. On a new installation all risk types are skipped until enough outcomes have been recorded.

Metrics (precision, recall, F1, accuracy, ROC-AUC, confusion matrix) are computed on a stratified 20 % hold-out of those
field outcomes.

## Model artefact

```json
{ "riskType": "HEAT_ICE_ICE", "version": "v1", "algorithm": "logistic_regression_gd_l2_balanced",
  "featureNames": [...], "weights": [...], "bias": -0.4, "means": [...], "stds": [...],
  "trainedAt": "...", "trainingRecords": ..., "testRecords": ..., "syntheticData": false, "dataset": "field-outcomes",
  "metrics": { "precision": ..., "recall": ..., "f1": ..., "accuracy": ..., "rocAuc": ..., "confusionMatrix": { "tp": ..., "fp": ..., "tn": ..., "fn": ... } } }
```

Registered versions appear in **Admin → Models**, where an admin can activate or retire them. See [docs/AI.md](../docs/AI.md).
