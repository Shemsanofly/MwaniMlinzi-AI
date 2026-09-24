# ai/ — datasets, models and training scripts

The ML code used at runtime lives in `backend/src/ai/ml/` (feature vector, logistic regression, metrics). This folder holds
the offline pipeline and its artefacts. No Python is required — everything runs on Node.js.

```
ai/
├── scripts/
│   ├── generateDataset.js   synthetic dataset (500–20,000 records)
│   └── trainModel.js        load → validate → preprocess → train → evaluate → save → register
├── datasets/                synthetic_seaweed_dataset.json / .csv   (generated, git-ignored)
└── models/                  <RISK_TYPE>_vN.json, <RISK_TYPE>_vN.metrics.json, last_training_summary.json (generated, git-ignored)
```

## Commands (from `backend/`)

```bash
npm run ai:dataset                            # 1500 records, seed 42
npm run ai:dataset -- --n 5000 --seed 7
npm run ai:train                              # register models as TRAINED (rule engine still used)
npm run ai:train -- --activate                # register and activate (HYBRID mode)
npm run ai:train -- --include-field           # also use recorded outcomes from PostgreSQL
npm run ai:train -- --no-db                   # train and save files without touching the database
```

Scripts can also be run directly: `node ai/scripts/generateDataset.js`, `node ai/scripts/trainModel.js` (they read
`backend/.env` for `DATABASE_URL`).

## Dataset

Each record: `{ id, synthetic_demo_data: true, species, month, features{…29 features…}, labels{ HEAT_ICE_ICE, STORM_LINE_DAMAGE,
POOR_GROWTH, HARVEST_WINDOW }, harvestOutcome{ yieldKgDryPerLine, lossEvent } }`. Features: SST, SST anomaly, anomaly days,
SST trend, waves, wind, current, rainfall, salinity, chlorophyll, humidity, crop age, maturity ratio, species heat sensitivity,
exposure, anchoring, observation flags (whitening, breakage, epiphytes, disease, condition, slow growth, loose gear, turbid
water, % affected), history (ice-ice/storm loss rates, yield ratio).

**This is synthetic demo data from an invented latent process. It must never be presented as field data**, and metrics
from models trained on it do not measure real-world accuracy.

## Model artefact

```json
{ "riskType": "HEAT_ICE_ICE", "version": "v1", "algorithm": "logistic_regression_gd_l2_balanced",
  "featureNames": [...], "weights": [...], "bias": -0.4, "means": [...], "stds": [...],
  "trainedAt": "...", "trainingRecords": 1228, "testRecords": 307, "syntheticData": true,
  "metrics": { "precision": ..., "recall": ..., "f1": ..., "accuracy": ..., "rocAuc": ..., "confusionMatrix": { "tp": ..., "fp": ..., "tn": ..., "fn": ... } } }
```

Registered versions appear in **Admin → Models**, where an admin can activate or retire them. See [docs/AI.md](../docs/AI.md).
