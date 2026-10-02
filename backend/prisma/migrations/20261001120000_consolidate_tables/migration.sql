-- Schema simplification: fold four sub-tables into their parent rows.
--   quality_records   → harvest_records (moisture_percent, impurity_percent)
--   drying_records    → harvest_records (ground_contact, rain_during_drying)
--   model_predictions → risk_predictions (ml_model_id)
--   risk_factors      → risk_predictions.factors (JSON array)
-- Data is backfilled before each table is dropped.

-- 1. HarvestRecord: new columns
ALTER TABLE "harvest_records" ADD COLUMN "moisture_percent"   DOUBLE PRECISION;
ALTER TABLE "harvest_records" ADD COLUMN "impurity_percent"   DOUBLE PRECISION;
ALTER TABLE "harvest_records" ADD COLUMN "ground_contact"     BOOLEAN;
ALTER TABLE "harvest_records" ADD COLUMN "rain_during_drying" BOOLEAN;

-- Backfill from the sub-tables (first row wins per harvest).
UPDATE "harvest_records" h
SET "moisture_percent" = q."moisture_percent",
    "impurity_percent" = q."impurity_percent"
FROM (
  SELECT DISTINCT ON ("harvest_record_id")
         "harvest_record_id", "moisture_percent", "impurity_percent"
    FROM "quality_records"
   ORDER BY "harvest_record_id", "created_at" ASC
) q
WHERE q."harvest_record_id" = h."id";

UPDATE "harvest_records" h
SET "ground_contact"     = d."ground_contact",
    "rain_during_drying" = d."rain_during_drying"
FROM (
  SELECT DISTINCT ON ("harvest_record_id")
         "harvest_record_id", "ground_contact", "rain_during_drying"
    FROM "drying_records"
   ORDER BY "harvest_record_id", "created_at" ASC
) d
WHERE d."harvest_record_id" = h."id";

DROP TABLE "quality_records";
DROP TABLE "drying_records";

-- 2. RiskPrediction: ml_model_id column and factors JSON
ALTER TABLE "risk_predictions" ADD COLUMN "ml_model_id" UUID;
ALTER TABLE "risk_predictions" ADD COLUMN "factors"     JSONB NOT NULL DEFAULT '[]'::jsonb;

-- First `model_predictions` row per prediction wins (there is only ever one in practice).
UPDATE "risk_predictions" r
SET "ml_model_id" = mp."model_id"
FROM (
  SELECT DISTINCT ON ("risk_prediction_id")
         "risk_prediction_id", "model_id"
    FROM "model_predictions"
   ORDER BY "risk_prediction_id", "created_at" ASC
) mp
WHERE mp."risk_prediction_id" = r."id";

-- Aggregate risk_factors into a JSON array per prediction, preserving the original ordering.
UPDATE "risk_predictions" r
SET "factors" = f."arr"
FROM (
  SELECT "prediction_id",
         jsonb_agg(
           jsonb_build_object(
             'code',         "code",
             'label',        "label",
             'labelSw',      "label_sw",
             'value',        "value",
             'contribution', "contribution",
             'direction',    "direction"
           )
         ) AS "arr"
    FROM "risk_factors"
   GROUP BY "prediction_id"
) f
WHERE f."prediction_id" = r."id";

DROP TABLE "model_predictions";
DROP TABLE "risk_factors";

CREATE INDEX "risk_predictions_ml_model_id_idx" ON "risk_predictions"("ml_model_id");
ALTER TABLE "risk_predictions"
  ADD CONSTRAINT "risk_predictions_ml_model_id_fkey"
  FOREIGN KEY ("ml_model_id") REFERENCES "ml_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
