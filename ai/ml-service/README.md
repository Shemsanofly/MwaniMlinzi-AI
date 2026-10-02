# MwaniMlinzi — ML microservice (optional)

A tiny Python microservice that trains and serves **gradient-boosted models** (LightGBM by
default, XGBoost supported) for the four risk types. Pitch-deck slide 7: *"Outcomes train
LightGBM or XGBoost models."*

The service is **optional**. The Node backend already ships with a dependency-free JavaScript
logistic-regression baseline (see `backend/src/ai/ml/logisticRegression.js`); if this service
is not reachable, the backend transparently falls back to that baseline — the rule-based engine
is always on either way.

## Why a separate service

Node has no production-grade LightGBM / XGBoost binding on Windows. Keeping ML in Python keeps
the Node runtime free of native deps and matches how the training data is produced
(`ai/scripts/trainModel.js` reads from PostgreSQL, writes model artefacts to disk — the Python
service reads those same artefacts).

## Setup (first run)

```bash
cd ai/ml-service
python -m venv .venv
. .venv/Scripts/activate   # Windows (PowerShell: .venv\Scripts\Activate.ps1)
pip install -r requirements.txt
```

## Run

```bash
# From ai/ml-service:
uvicorn main:app --host 127.0.0.1 --port 8800
```

The backend finds it via the `ML_SERVICE_URL` environment variable (set in `backend/.env`):

```ini
ML_SERVICE_URL=http://127.0.0.1:8800
ML_SERVICE_TIMEOUT_MS=2500
```

Health check: `GET http://127.0.0.1:8800/health` → `{"status":"ok", "framework":"lightgbm", ...}`.

## Endpoints

| Method | Path         | Purpose |
|--------|--------------|---------|
| GET    | `/health`    | Liveness + framework and loaded-model listing |
| POST   | `/predict`   | Score a single farm's features for one risk type |
| POST   | `/train`     | (stub) Train a new model from labelled outcomes |

### `POST /predict`

```json
{
  "riskType": "HEAT_ICE_ICE",
  "features": {
    "sstC": 29.3, "sstAnomalyC": 1.2, "waveHeightM": 0.6, "windSpeedKmh": 18,
    "rainfallMm": 0.0, "cropAgeDays": 32, "heatSensitivity": 0.75
  }
}
```

Returns:

```json
{ "probability": 0.63, "modelVersion": "lgb-v1", "framework": "lightgbm" }
```

If no model is loaded for the risk type, the service returns HTTP 404 and the Node backend
falls back to the local logistic baseline.

### `POST /train`

Not implemented yet — the Node side already runs the training pipeline in
`ai/scripts/trainModel.js` (producing JSON artefacts for the logistic baseline). The intent
is for this service to train LightGBM artefacts alongside, saved under `ai/models/`.

## Deployment

Run under PM2 or systemd beside the Node backend. The same box is fine (the API is bound to
127.0.0.1 by default). The service is stateless; models live on disk under `ai/models/`.
