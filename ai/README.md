# ai/ — model training from field outcomes

The ML code used at runtime lives in `backend/src/ai/ml/` (feature vector, logistic regression, metrics). This folder holds
the offline training script and the model files it produces. No Python is required — everything runs on Node.js.

The rule-based risk engine is the default and is always available. ML models are optional and are trained **only on
recorded field outcomes**; nothing is generated or invented.

```
ai/
├── scripts/
│   └── trainModel.js        load field outcomes → validate → preprocess → train → evaluate → save → register
├── datasets/                (unused; kept for exported datasets, git-ignored)
└── models/                  <RISK_TYPE>_vN.json, <RISK_TYPE>_vN.metrics.json, last_training_summary.json (generated, git-ignored)
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
