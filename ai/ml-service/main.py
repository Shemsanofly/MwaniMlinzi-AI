"""
MwaniMlinzi ML microservice — LightGBM (or XGBoost) scoring for the four risk types.

Optional. The Node backend's `MLRiskProvider` tries this service first; on any error it falls
back to the built-in JavaScript logistic baseline. The rule-based engine is always on either
way, so this service going down never stops risk scoring.

Run:
    uvicorn main:app --host 127.0.0.1 --port 8800

See ./README.md for the API contract and ML_SERVICE_URL wiring.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    import lightgbm as lgb  # type: ignore
    FRAMEWORK = "lightgbm"
except ImportError:  # pragma: no cover
    lgb = None
    FRAMEWORK = "none"

RISK_TYPES = {"HEAT_ICE_ICE", "STORM_LINE_DAMAGE", "POOR_GROWTH", "HARVEST_WINDOW"}
MODEL_DIR = Path(os.environ.get("ML_MODEL_DIR", Path(__file__).resolve().parent.parent / "models" / "gbm"))

app = FastAPI(title="MwaniMlinzi ML service", version="0.1.0")

# In-memory cache of loaded boosters, keyed by risk type.
_models: Dict[str, "lgb.Booster"] = {}
_versions: Dict[str, str] = {}


def _load_models_from_disk() -> None:
    """Load any serialised LightGBM boosters that have been saved under MODEL_DIR."""
    if not MODEL_DIR.exists() or lgb is None:
        return
    for risk_type in RISK_TYPES:
        path = MODEL_DIR / f"{risk_type}.txt"
        meta_path = MODEL_DIR / f"{risk_type}.json"
        if path.exists():
            try:
                _models[risk_type] = lgb.Booster(model_file=str(path))
                if meta_path.exists():
                    _versions[risk_type] = json.loads(meta_path.read_text()).get("version", "lgb-v1")
                else:
                    _versions[risk_type] = "lgb-v1"
            except Exception as err:  # pragma: no cover
                print(f"[ml] failed to load {risk_type}: {err}")


_load_models_from_disk()


class PredictBody(BaseModel):
    riskType: str = Field(..., description="One of HEAT_ICE_ICE, STORM_LINE_DAMAGE, POOR_GROWTH, HARVEST_WINDOW")
    features: Dict[str, float] = Field(default_factory=dict)


class PredictResult(BaseModel):
    probability: float
    modelVersion: str
    framework: str


class TrainBody(BaseModel):
    riskType: str
    rows: list[dict]            # [{features: {...}, label: 0|1}, …]
    featureNames: Optional[list[str]] = None


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "framework": FRAMEWORK,
        "models": {rt: _versions[rt] for rt in sorted(_models)},
        "modelDir": str(MODEL_DIR),
    }


@app.post("/predict", response_model=PredictResult)
def predict(body: PredictBody) -> PredictResult:
    if body.riskType not in RISK_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown riskType {body.riskType}")
    if lgb is None:
        raise HTTPException(status_code=503, detail="LightGBM is not installed in this service")
    booster = _models.get(body.riskType)
    if booster is None:
        # Node falls back to the JS logistic baseline when it gets a 404.
        raise HTTPException(status_code=404, detail=f"No active LightGBM model for {body.riskType}")
    # Keep the feature ordering fixed to the booster's expected feature names.
    feature_names = booster.feature_name()
    x = np.array([[float(body.features.get(name, 0.0)) for name in feature_names]])
    prob = float(booster.predict(x)[0])
    return PredictResult(probability=prob, modelVersion=_versions.get(body.riskType, "lgb-v1"), framework=FRAMEWORK)


@app.post("/train")
def train(body: TrainBody) -> dict:
    """Stub. The Node training pipeline (ai/scripts/trainModel.js) already produces logistic artefacts;
    the LightGBM path trains here once enough labelled outcomes exist (see ../README.md)."""
    if body.riskType not in RISK_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown riskType {body.riskType}")
    if lgb is None:
        raise HTTPException(status_code=503, detail="LightGBM is not installed in this service")
    if len(body.rows) < 20:
        raise HTTPException(status_code=422, detail=f"Need at least 20 labelled rows (got {len(body.rows)})")
    feature_names = body.featureNames or sorted({k for r in body.rows for k in r.get("features", {}).keys()})
    X = np.array([[float(r["features"].get(name, 0.0)) for name in feature_names] for r in body.rows])
    y = np.array([int(r["label"]) for r in body.rows])
    booster = lgb.train(
        params={"objective": "binary", "metric": "binary_logloss", "learning_rate": 0.05, "num_leaves": 15, "verbose": -1},
        train_set=lgb.Dataset(X, y, feature_name=feature_names),
        num_boost_round=200,
    )
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(MODEL_DIR / f"{body.riskType}.txt"))
    version = f"lgb-{int(__import__('time').time())}"
    (MODEL_DIR / f"{body.riskType}.json").write_text(json.dumps({"version": version, "featureNames": feature_names}))
    _models[body.riskType] = booster
    _versions[body.riskType] = version
    return {"ok": True, "riskType": body.riskType, "version": version, "rows": len(body.rows)}
