-- Consolidate 47 application tables into 29 (30 including _prisma_migrations).
-- All original IDs and field values are copied and checked inside one transaction.
-- Related farm records and events remain relational, indexed and separated by record_type.
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';
LOCK TABLE "action_outcomes", "audit_logs", "disease_observations", "environmental_observations", "extension_notes", "farm_costs", "farm_locations", "farm_observations", "farms", "integration_events", "job_runs", "loss_records", "model_feedback", "model_metrics", "notification_logs", "ocean_observations", "permissions", "role_permissions", "roles", "sale_records", "sms_messages", "system_settings", "uploaded_files", "weather_observations", "work_logs" IN ACCESS EXCLUSIVE MODE;

-- CreateEnum
CREATE TYPE "FarmRecordType" AS ENUM ('SALE', 'COST', 'WORK', 'LOSS', 'NOTE', 'OUTCOME');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('AUDIT', 'JOB', 'INTEGRATION', 'SMS', 'UPLOAD', 'DELIVERY', 'METRIC', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "EnvironmentalRecordType" AS ENUM ('FARM', 'WEATHER', 'OCEAN');

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "farm_locations" DROP CONSTRAINT "farm_locations_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "farm_observations" DROP CONSTRAINT "farm_observations_image_file_id_fkey";

-- DropForeignKey
ALTER TABLE "disease_observations" DROP CONSTRAINT "disease_observations_observation_id_fkey";

-- DropForeignKey
ALTER TABLE "disease_observations" DROP CONSTRAINT "disease_observations_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "uploaded_files" DROP CONSTRAINT "uploaded_files_uploaded_by_id_fkey";

-- DropForeignKey
ALTER TABLE "sale_records" DROP CONSTRAINT "sale_records_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "sale_records" DROP CONSTRAINT "sale_records_planting_cycle_id_fkey";

-- DropForeignKey
ALTER TABLE "sale_records" DROP CONSTRAINT "sale_records_harvest_record_id_fkey";

-- DropForeignKey
ALTER TABLE "farm_costs" DROP CONSTRAINT "farm_costs_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "farm_costs" DROP CONSTRAINT "farm_costs_planting_cycle_id_fkey";

-- DropForeignKey
ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "work_logs" DROP CONSTRAINT "work_logs_planting_cycle_id_fkey";

-- DropForeignKey
ALTER TABLE "environmental_observations" DROP CONSTRAINT "environmental_observations_weather_observation_id_fkey";

-- DropForeignKey
ALTER TABLE "environmental_observations" DROP CONSTRAINT "environmental_observations_ocean_observation_id_fkey";

-- DropForeignKey
ALTER TABLE "action_outcomes" DROP CONSTRAINT "action_outcomes_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "action_outcomes" DROP CONSTRAINT "action_outcomes_farmer_action_id_fkey";

-- DropForeignKey
ALTER TABLE "action_outcomes" DROP CONSTRAINT "action_outcomes_recommendation_id_fkey";

-- DropForeignKey
ALTER TABLE "action_outcomes" DROP CONSTRAINT "action_outcomes_prediction_id_fkey";

-- DropForeignKey
ALTER TABLE "loss_records" DROP CONSTRAINT "loss_records_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "loss_records" DROP CONSTRAINT "loss_records_planting_cycle_id_fkey";

-- DropForeignKey
ALTER TABLE "notification_logs" DROP CONSTRAINT "notification_logs_notification_id_fkey";

-- DropForeignKey
ALTER TABLE "model_feedback" DROP CONSTRAINT "model_feedback_risk_prediction_id_fkey";

-- DropForeignKey
ALTER TABLE "model_feedback" DROP CONSTRAINT "model_feedback_model_id_fkey";

-- DropForeignKey
ALTER TABLE "model_feedback" DROP CONSTRAINT "model_feedback_user_id_fkey";

-- DropForeignKey
ALTER TABLE "model_metrics" DROP CONSTRAINT "model_metrics_model_id_fkey";

-- DropForeignKey
ALTER TABLE "extension_notes" DROP CONSTRAINT "extension_notes_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "extension_notes" DROP CONSTRAINT "extension_notes_author_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "farms" ADD COLUMN     "location" JSONB;

-- AlterTable
ALTER TABLE "farm_observations" ADD COLUMN     "diseases" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "environmental_observations" ADD COLUMN     "condition" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "record_type" "EnvironmentalRecordType" NOT NULL DEFAULT 'FARM',
ALTER COLUMN "farm_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "farm_records" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_cycle_id" UUID,
    "harvest_record_id" UUID,
    "sale_date" TIMESTAMP(3),
    "quantity_kg" DOUBLE PRECISION,
    "price_per_kg" INTEGER,
    "total_tzs" INTEGER,
    "buyer_name" TEXT,
    "quality_grade" "QualityGrade",
    "payment_status" "PaymentStatus",
    "notes" TEXT,
    "channel" "DataChannel",
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cost_date" TIMESTAMP(3),
    "category" "CostCategory",
    "amount_tzs" INTEGER,
    "work_date" TIMESTAMP(3),
    "activity" "WorkActivity",
    "loss_date" DATE,
    "cause" "LossCause",
    "percent_lost" DOUBLE PRECISION,
    "author_id" UUID,
    "note" TEXT,
    "visit_priority" "RiskLevel",
    "visit_by" TIMESTAMP(3),
    "farmer_action_id" UUID,
    "recommendation_id" UUID,
    "prediction_id" UUID,
    "outcome_type" "OutcomeType",
    "loss_percent" DOUBLE PRECISION,
    "outcome_date" TIMESTAMP(3),
    "risk_materialized" BOOLEAN,
    "record_type" "FarmRecordType" NOT NULL,

CONSTRAINT "farm_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "job_name" TEXT,
    "trigger" TEXT,
    "status" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,
    "provider" TEXT,
    "kind" TEXT,
    "reference" TEXT,
    "phone_number" TEXT,
    "payload" JSONB,
    "response" TEXT,
    "duration_ms" INTEGER,
    "direction" TEXT,
    "body" TEXT,
    "command" TEXT,
    "simulated" BOOLEAN,
    "original_name" TEXT,
    "stored_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "storage" TEXT,
    "uploaded_by_id" UUID,
    "notification_id" UUID,
    "channel" "NotificationChannel",
    "recipient" TEXT,
    "provider_ref" TEXT,
    "provider_status" TEXT,
    "message_type" TEXT,
    "language" "Language",
    "message" TEXT,
    "cost" TEXT,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "model_id" UUID,
    "dataset" TEXT,
    "metric" TEXT,
    "value" DOUBLE PRECISION,
    "risk_prediction_id" UUID,
    "feedback_type" "FeedbackType",
    "notes" TEXT,
    "record_type" "EventType" NOT NULL,

CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

-- Preserve permission definitions, including unassigned permissions and their original IDs.
INSERT INTO "system_settings" ("key", "value", "description", "updated_at")
SELECT 'database.permissionCatalog', jsonb_build_object(
  'permissions', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM permissions p), '[]'::jsonb),
  'rolePermissions', COALESCE((SELECT jsonb_agg(to_jsonb(rp) ORDER BY rp.role_id, rp.permission_id) FROM role_permissions rp), '[]'::jsonb)
), 'Original permission definitions retained during table consolidation', CURRENT_TIMESTAMP;
UPDATE roles r SET permissions = COALESCE((
  SELECT array_agg(p.key ORDER BY p.key) FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = r.id
), ARRAY[]::TEXT[]);
UPDATE farms f SET location = jsonb_build_object('id', l."id", 'farmId', l."farm_id", 'latitude', l."latitude", 'longitude', l."longitude", 'locationName', l."location_name", 'district', l."district", 'region', l."region", 'waterDepthM', l."water_depth_m") FROM farm_locations l WHERE l.farm_id = f.id;
UPDATE farm_observations o SET diseases = (SELECT jsonb_agg(jsonb_build_object('id', d."id", 'observationId', d."observation_id", 'farmId', d."farm_id", 'diseaseType', d."disease_type", 'severity', d."severity", 'percentAffected', d."percent_affected", 'notes', d."notes", 'createdAt', d."created_at") ORDER BY d.created_at, d.id) FROM disease_observations d WHERE d.observation_id = o.id)
WHERE EXISTS (SELECT 1 FROM disease_observations d WHERE d.observation_id = o.id);

-- Preserve sale_records as SALE rows.
INSERT INTO "farm_records" ("id", "farm_id", "planting_cycle_id", "harvest_record_id", "sale_date", "quantity_kg", "price_per_kg", "total_tzs", "buyer_name", "quality_grade", "payment_status", "notes", "channel", "created_by_id", "created_at", "record_type")
SELECT "id", "farm_id", "planting_cycle_id", "harvest_record_id", "sale_date", "quantity_kg", "price_per_kg", "total_tzs", "buyer_name", "quality_grade", "payment_status", "notes", "channel", "created_by_id", "created_at", 'SALE'::"FarmRecordType" FROM "sale_records";

DO $$ BEGIN
  IF (SELECT count(*) FROM "sale_records") <> (SELECT count(*) FROM "farm_records" WHERE record_type = 'SALE')
     OR EXISTS (SELECT 1 FROM "sale_records" old LEFT JOIN "farm_records" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'SALE' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for sale_records'; END IF;
END $$;

-- Preserve farm_costs as COST rows.
INSERT INTO "farm_records" ("id", "farm_id", "planting_cycle_id", "cost_date", "category", "amount_tzs", "notes", "channel", "created_by_id", "created_at", "record_type")
SELECT "id", "farm_id", "planting_cycle_id", "cost_date", "category", "amount_tzs", "notes", "channel", "created_by_id", "created_at", 'COST'::"FarmRecordType" FROM "farm_costs";

DO $$ BEGIN
  IF (SELECT count(*) FROM "farm_costs") <> (SELECT count(*) FROM "farm_records" WHERE record_type = 'COST')
     OR EXISTS (SELECT 1 FROM "farm_costs" old LEFT JOIN "farm_records" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'COST' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for farm_costs'; END IF;
END $$;

-- Preserve work_logs as WORK rows.
INSERT INTO "farm_records" ("id", "farm_id", "planting_cycle_id", "work_date", "activity", "notes", "channel", "created_by_id", "created_at", "record_type")
SELECT "id", "farm_id", "planting_cycle_id", "work_date", "activity", "notes", "channel", "created_by_id", "created_at", 'WORK'::"FarmRecordType" FROM "work_logs";

DO $$ BEGIN
  IF (SELECT count(*) FROM "work_logs") <> (SELECT count(*) FROM "farm_records" WHERE record_type = 'WORK')
     OR EXISTS (SELECT 1 FROM "work_logs" old LEFT JOIN "farm_records" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'WORK' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for work_logs'; END IF;
END $$;

-- Preserve loss_records as LOSS rows.
INSERT INTO "farm_records" ("id", "farm_id", "planting_cycle_id", "loss_date", "cause", "quantity_kg", "percent_lost", "notes", "created_at", "record_type")
SELECT "id", "farm_id", "planting_cycle_id", "loss_date", "cause", "quantity_kg", "percent_lost", "notes", "created_at", 'LOSS'::"FarmRecordType" FROM "loss_records";

DO $$ BEGIN
  IF (SELECT count(*) FROM "loss_records") <> (SELECT count(*) FROM "farm_records" WHERE record_type = 'LOSS')
     OR EXISTS (SELECT 1 FROM "loss_records" old LEFT JOIN "farm_records" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'LOSS' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for loss_records'; END IF;
END $$;

-- Preserve extension_notes as NOTE rows.
INSERT INTO "farm_records" ("id", "farm_id", "author_id", "note", "visit_priority", "visit_by", "created_at", "record_type")
SELECT "id", "farm_id", "author_id", "note", "visit_priority", "visit_by", "created_at", 'NOTE'::"FarmRecordType" FROM "extension_notes";

DO $$ BEGIN
  IF (SELECT count(*) FROM "extension_notes") <> (SELECT count(*) FROM "farm_records" WHERE record_type = 'NOTE')
     OR EXISTS (SELECT 1 FROM "extension_notes" old LEFT JOIN "farm_records" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'NOTE' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for extension_notes'; END IF;
END $$;

-- Preserve action_outcomes as OUTCOME rows.
INSERT INTO "farm_records" ("id", "farm_id", "farmer_action_id", "recommendation_id", "prediction_id", "outcome_type", "loss_percent", "outcome_date", "risk_materialized", "notes", "created_at", "record_type")
SELECT "id", "farm_id", "farmer_action_id", "recommendation_id", "prediction_id", "outcome_type", "loss_percent", "outcome_date", "risk_materialized", "notes", "created_at", 'OUTCOME'::"FarmRecordType" FROM "action_outcomes";

DO $$ BEGIN
  IF (SELECT count(*) FROM "action_outcomes") <> (SELECT count(*) FROM "farm_records" WHERE record_type = 'OUTCOME')
     OR EXISTS (SELECT 1 FROM "action_outcomes" old LEFT JOIN "farm_records" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'OUTCOME' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for action_outcomes'; END IF;
END $$;

-- Preserve audit_logs as AUDIT rows.
INSERT INTO "event_logs" ("id", "user_id", "action", "entity_type", "entity_id", "details", "ip_address", "created_at", "record_type")
SELECT "id", "user_id", "action", "entity_type", "entity_id", "details", "ip_address", "created_at", 'AUDIT'::"EventType" FROM "audit_logs";

DO $$ BEGIN
  IF (SELECT count(*) FROM "audit_logs") <> (SELECT count(*) FROM "event_logs" WHERE record_type = 'AUDIT')
     OR EXISTS (SELECT 1 FROM "audit_logs" old LEFT JOIN "event_logs" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'AUDIT' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for audit_logs'; END IF;
END $$;

-- Preserve job_runs as JOB rows.
INSERT INTO "event_logs" ("id", "job_name", "trigger", "status", "started_at", "finished_at", "summary", "error", "record_type")
SELECT "id", "job_name", "trigger", "status", "started_at", "finished_at", "summary", "error", 'JOB'::"EventType" FROM "job_runs";

DO $$ BEGIN
  IF (SELECT count(*) FROM "job_runs") <> (SELECT count(*) FROM "event_logs" WHERE record_type = 'JOB')
     OR EXISTS (SELECT 1 FROM "job_runs" old LEFT JOIN "event_logs" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'JOB' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for job_runs'; END IF;
END $$;

-- Preserve integration_events as INTEGRATION rows.
INSERT INTO "event_logs" ("id", "provider", "kind", "reference", "phone_number", "status", "payload", "response", "error", "duration_ms", "created_at", "record_type")
SELECT "id", "provider", "kind", "reference", "phone_number", "status", "payload", "response", "error", "duration_ms", "created_at", 'INTEGRATION'::"EventType" FROM "integration_events";

DO $$ BEGIN
  IF (SELECT count(*) FROM "integration_events") <> (SELECT count(*) FROM "event_logs" WHERE record_type = 'INTEGRATION')
     OR EXISTS (SELECT 1 FROM "integration_events" old LEFT JOIN "event_logs" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'INTEGRATION' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for integration_events'; END IF;
END $$;

-- Preserve sms_messages as SMS rows.
INSERT INTO "event_logs" ("id", "direction", "phone_number", "body", "command", "simulated", "created_at", "record_type")
SELECT "id", "direction", "phone_number", "body", "command", "simulated", "created_at", 'SMS'::"EventType" FROM "sms_messages";

DO $$ BEGIN
  IF (SELECT count(*) FROM "sms_messages") <> (SELECT count(*) FROM "event_logs" WHERE record_type = 'SMS')
     OR EXISTS (SELECT 1 FROM "sms_messages" old LEFT JOIN "event_logs" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'SMS' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for sms_messages'; END IF;
END $$;

-- Preserve uploaded_files as UPLOAD rows.
INSERT INTO "event_logs" ("id", "original_name", "stored_name", "mime_type", "size_bytes", "storage", "uploaded_by_id", "created_at", "record_type")
SELECT "id", "original_name", "stored_name", "mime_type", "size_bytes", "storage", "uploaded_by_id", "created_at", 'UPLOAD'::"EventType" FROM "uploaded_files";

DO $$ BEGIN
  IF (SELECT count(*) FROM "uploaded_files") <> (SELECT count(*) FROM "event_logs" WHERE record_type = 'UPLOAD')
     OR EXISTS (SELECT 1 FROM "uploaded_files" old LEFT JOIN "event_logs" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'UPLOAD' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for uploaded_files'; END IF;
END $$;

-- Preserve notification_logs as DELIVERY rows.
INSERT INTO "event_logs" ("id", "notification_id", "channel", "provider", "recipient", "status", "provider_ref", "provider_status", "message_type", "language", "message", "cost", "error", "sent_at", "delivered_at", "created_at", "updated_at", "record_type")
SELECT "id", "notification_id", "channel", "provider", "recipient", "status"::text, "provider_ref", "provider_status", "message_type", "language", "message", "cost", "error", "sent_at", "delivered_at", "created_at", "updated_at", 'DELIVERY'::"EventType" FROM "notification_logs";

DO $$ BEGIN
  IF (SELECT count(*) FROM "notification_logs") <> (SELECT count(*) FROM "event_logs" WHERE record_type = 'DELIVERY')
     OR EXISTS (SELECT 1 FROM "notification_logs" old LEFT JOIN "event_logs" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'DELIVERY' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for notification_logs'; END IF;
END $$;

-- Preserve model_metrics as METRIC rows.
INSERT INTO "event_logs" ("id", "model_id", "dataset", "metric", "value", "details", "created_at", "record_type")
SELECT "id", "model_id", "dataset", "metric", "value", "details", "created_at", 'METRIC'::"EventType" FROM "model_metrics";

DO $$ BEGIN
  IF (SELECT count(*) FROM "model_metrics") <> (SELECT count(*) FROM "event_logs" WHERE record_type = 'METRIC')
     OR EXISTS (SELECT 1 FROM "model_metrics" old LEFT JOIN "event_logs" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'METRIC' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for model_metrics'; END IF;
END $$;

-- Preserve model_feedback as FEEDBACK rows.
INSERT INTO "event_logs" ("id", "risk_prediction_id", "model_id", "user_id", "feedback_type", "notes", "created_at", "record_type")
SELECT "id", "risk_prediction_id", "model_id", "user_id", "feedback_type", "notes", "created_at", 'FEEDBACK'::"EventType" FROM "model_feedback";

DO $$ BEGIN
  IF (SELECT count(*) FROM "model_feedback") <> (SELECT count(*) FROM "event_logs" WHERE record_type = 'FEEDBACK')
     OR EXISTS (SELECT 1 FROM "model_feedback" old LEFT JOIN "event_logs" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'FEEDBACK' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for model_feedback'; END IF;
END $$;

-- Preserve weather_observations as WEATHER rows.
INSERT INTO "environmental_observations" ("id", "latitude", "longitude", "observed_at", "source", "provider", "air_temperature_c", "rainfall_mm", "wind_speed_kmh", "wind_direction_deg", "humidity_pct", "condition", "created_at", "record_type")
SELECT "id", "latitude", "longitude", "observed_at", "source", "provider", "air_temperature_c", "rainfall_mm", "wind_speed_kmh", "wind_direction_deg", "humidity_pct", "condition", "created_at", 'WEATHER'::"EnvironmentalRecordType" FROM "weather_observations";

DO $$ BEGIN
  IF (SELECT count(*) FROM "weather_observations") <> (SELECT count(*) FROM "environmental_observations" WHERE record_type = 'WEATHER')
     OR EXISTS (SELECT 1 FROM "weather_observations" old LEFT JOIN "environmental_observations" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'WEATHER' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for weather_observations'; END IF;
END $$;

-- Preserve ocean_observations as OCEAN rows.
INSERT INTO "environmental_observations" ("id", "latitude", "longitude", "observed_at", "source", "provider", "sea_surface_temp_c", "sst_anomaly_c", "wave_height_m", "current_velocity_ms", "salinity_psu", "chlorophyll_mg_m3", "created_at", "record_type")
SELECT "id", "latitude", "longitude", "observed_at", "source", "provider", "sea_surface_temp_c", "sst_anomaly_c", "wave_height_m", "current_velocity_ms", "salinity_psu", "chlorophyll_mg_m3", "created_at", 'OCEAN'::"EnvironmentalRecordType" FROM "ocean_observations";

DO $$ BEGIN
  IF (SELECT count(*) FROM "ocean_observations") <> (SELECT count(*) FROM "environmental_observations" WHERE record_type = 'OCEAN')
     OR EXISTS (SELECT 1 FROM "ocean_observations" old LEFT JOIN "environmental_observations" fresh ON fresh.id = old.id
       WHERE fresh.id IS NULL OR fresh.record_type <> 'OCEAN' OR NOT (to_jsonb(fresh) @> to_jsonb(old)))
  THEN RAISE EXCEPTION 'Data verification failed for ocean_observations'; END IF;
END $$;

-- Verify embedded one-to-one data and every embedded disease entry before dropping source tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM farm_locations l JOIN farms f ON f.id = l.farm_id WHERE f.location IS DISTINCT FROM jsonb_build_object('id', l."id", 'farmId', l."farm_id", 'latitude', l."latitude", 'longitude', l."longitude", 'locationName', l."location_name", 'district', l."district", 'region', l."region", 'waterDepthM', l."water_depth_m"))
    OR (SELECT count(*) FROM farm_locations) <> (SELECT count(*) FROM farms WHERE location IS NOT NULL)
  THEN RAISE EXCEPTION 'Farm location verification failed'; END IF;
  IF (SELECT count(*) FROM disease_observations) <> (SELECT COALESCE(sum(jsonb_array_length(diseases)), 0) FROM farm_observations)
    OR EXISTS (SELECT 1 FROM disease_observations d JOIN farm_observations o ON o.id = d.observation_id WHERE NOT (o.diseases @> jsonb_build_array(jsonb_build_object('id', d."id", 'observationId', d."observation_id", 'farmId', d."farm_id", 'diseaseType', d."disease_type", 'severity', d."severity", 'percentAffected', d."percent_affected", 'notes', d."notes", 'createdAt', d."created_at"))))
  THEN RAISE EXCEPTION 'Disease verification failed'; END IF;
  IF EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id JOIN roles r ON r.id = rp.role_id WHERE NOT (p.key = ANY(r.permissions)))
    OR (SELECT COALESCE(sum(cardinality(permissions)), 0) FROM roles) <> (SELECT count(*) FROM role_permissions)
  THEN RAISE EXCEPTION 'Role permission verification failed'; END IF;
END $$;

ALTER TABLE farm_records ADD CONSTRAINT "farm_records_sale_required" CHECK (record_type <> 'SALE' OR (sale_date IS NOT NULL AND quantity_kg IS NOT NULL AND price_per_kg IS NOT NULL AND total_tzs IS NOT NULL AND payment_status IS NOT NULL AND channel IS NOT NULL));

ALTER TABLE farm_records ADD CONSTRAINT "farm_records_cost_required" CHECK (record_type <> 'COST' OR (cost_date IS NOT NULL AND category IS NOT NULL AND amount_tzs IS NOT NULL AND channel IS NOT NULL));

ALTER TABLE farm_records ADD CONSTRAINT "farm_records_work_required" CHECK (record_type <> 'WORK' OR (work_date IS NOT NULL AND activity IS NOT NULL AND channel IS NOT NULL));

ALTER TABLE farm_records ADD CONSTRAINT "farm_records_loss_required" CHECK (record_type <> 'LOSS' OR (loss_date IS NOT NULL AND cause IS NOT NULL AND percent_lost IS NOT NULL));

ALTER TABLE farm_records ADD CONSTRAINT "farm_records_note_required" CHECK (record_type <> 'NOTE' OR (note IS NOT NULL));

ALTER TABLE farm_records ADD CONSTRAINT "farm_records_outcome_required" CHECK (record_type <> 'OUTCOME' OR (outcome_type IS NOT NULL AND outcome_date IS NOT NULL));

ALTER TABLE event_logs ADD CONSTRAINT "event_logs_audit_required" CHECK (record_type <> 'AUDIT' OR (action IS NOT NULL AND entity_type IS NOT NULL));

ALTER TABLE event_logs ADD CONSTRAINT "event_logs_job_required" CHECK (record_type <> 'JOB' OR (job_name IS NOT NULL AND trigger IS NOT NULL AND status IS NOT NULL AND started_at IS NOT NULL));

ALTER TABLE event_logs ADD CONSTRAINT "event_logs_integration_required" CHECK (record_type <> 'INTEGRATION' OR (provider IS NOT NULL AND kind IS NOT NULL AND status IS NOT NULL));

ALTER TABLE event_logs ADD CONSTRAINT "event_logs_sms_required" CHECK (record_type <> 'SMS' OR (direction IS NOT NULL AND phone_number IS NOT NULL AND body IS NOT NULL AND simulated IS NOT NULL));

ALTER TABLE event_logs ADD CONSTRAINT "event_logs_upload_required" CHECK (record_type <> 'UPLOAD' OR (original_name IS NOT NULL AND stored_name IS NOT NULL AND mime_type IS NOT NULL AND size_bytes IS NOT NULL AND storage IS NOT NULL));

ALTER TABLE event_logs ADD CONSTRAINT "event_logs_delivery_required" CHECK (record_type <> 'DELIVERY' OR (channel IS NOT NULL AND provider IS NOT NULL AND recipient IS NOT NULL AND status IS NOT NULL));

ALTER TABLE event_logs ADD CONSTRAINT "event_logs_metric_required" CHECK (record_type <> 'METRIC' OR (dataset IS NOT NULL AND metric IS NOT NULL AND value IS NOT NULL));

ALTER TABLE event_logs ADD CONSTRAINT "event_logs_feedback_required" CHECK (record_type <> 'FEEDBACK' OR (risk_prediction_id IS NOT NULL AND feedback_type IS NOT NULL));

ALTER TABLE environmental_observations ADD CONSTRAINT environmental_observations_type_required CHECK (
  (record_type = 'FARM' AND farm_id IS NOT NULL) OR
  (record_type IN ('WEATHER', 'OCEAN') AND farm_id IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL AND provider IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "farm_records_farm_id_record_type_created_at_idx" ON "farm_records"("farm_id", "record_type", "created_at");

-- CreateIndex
CREATE INDEX "farm_records_farm_id_record_type_sale_date_idx" ON "farm_records"("farm_id", "record_type", "sale_date");

-- CreateIndex
CREATE INDEX "farm_records_farm_id_record_type_cost_date_idx" ON "farm_records"("farm_id", "record_type", "cost_date");

-- CreateIndex
CREATE INDEX "farm_records_farm_id_record_type_work_date_idx" ON "farm_records"("farm_id", "record_type", "work_date");

-- CreateIndex
CREATE INDEX "farm_records_planting_cycle_id_idx" ON "farm_records"("planting_cycle_id");

-- CreateIndex
CREATE INDEX "farm_records_harvest_record_id_idx" ON "farm_records"("harvest_record_id");

-- CreateIndex
CREATE INDEX "farm_records_prediction_id_idx" ON "farm_records"("prediction_id");

-- CreateIndex
CREATE INDEX "farm_records_farm_id_record_type_loss_date_idx" ON "farm_records"("farm_id", "record_type", "loss_date");

-- CreateIndex
CREATE INDEX "farm_records_farm_id_record_type_outcome_date_idx" ON "farm_records"("farm_id", "record_type", "outcome_date");

-- CreateIndex
CREATE UNIQUE INDEX "event_logs_stored_name_key" ON "event_logs"("stored_name");

-- CreateIndex
CREATE INDEX "event_logs_record_type_created_at_idx" ON "event_logs"("record_type", "created_at");

-- CreateIndex
CREATE INDEX "event_logs_record_type_provider_ref_idx" ON "event_logs"("record_type", "provider_ref");

-- CreateIndex
CREATE INDEX "event_logs_record_type_kind_reference_idx" ON "event_logs"("record_type", "kind", "reference");

-- CreateIndex
CREATE INDEX "event_logs_record_type_model_id_idx" ON "event_logs"("record_type", "model_id");

-- CreateIndex
CREATE INDEX "event_logs_record_type_risk_prediction_id_idx" ON "event_logs"("record_type", "risk_prediction_id");

-- CreateIndex
CREATE INDEX "event_logs_record_type_entity_type_entity_id_idx" ON "event_logs"("record_type", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "event_logs_record_type_started_at_idx" ON "event_logs"("record_type", "started_at");

-- CreateIndex
CREATE INDEX "event_logs_notification_id_idx" ON "event_logs"("notification_id");

-- CreateIndex
CREATE INDEX "environmental_observations_record_type_latitude_longitude_c_idx" ON "environmental_observations"("record_type", "latitude", "longitude", "created_at");

-- AddForeignKey
ALTER TABLE "farm_observations" ADD CONSTRAINT "farm_observations_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "event_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_observations" ADD CONSTRAINT "environmental_observations_weather_observation_id_fkey" FOREIGN KEY ("weather_observation_id") REFERENCES "environmental_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_observations" ADD CONSTRAINT "environmental_observations_ocean_observation_id_fkey" FOREIGN KEY ("ocean_observation_id") REFERENCES "environmental_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_planting_cycle_id_fkey" FOREIGN KEY ("planting_cycle_id") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_harvest_record_id_fkey" FOREIGN KEY ("harvest_record_id") REFERENCES "harvest_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_farmer_action_id_fkey" FOREIGN KEY ("farmer_action_id") REFERENCES "farmer_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "action_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_records" ADD CONSTRAINT "farm_records_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "risk_predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ml_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_risk_prediction_id_fkey" FOREIGN KEY ("risk_prediction_id") REFERENCES "risk_predictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropTable
DROP TABLE "permissions";

-- DropTable
DROP TABLE "role_permissions";

-- DropTable
DROP TABLE "farm_locations";

-- DropTable
DROP TABLE "disease_observations";

-- DropTable
DROP TABLE "uploaded_files";

-- DropTable
DROP TABLE "weather_observations";

-- DropTable
DROP TABLE "ocean_observations";

-- DropTable
DROP TABLE "sale_records";

-- DropTable
DROP TABLE "farm_costs";

-- DropTable
DROP TABLE "work_logs";

-- DropTable
DROP TABLE "action_outcomes";

-- DropTable
DROP TABLE "loss_records";

-- DropTable
DROP TABLE "notification_logs";

-- DropTable
DROP TABLE "model_feedback";

-- DropTable
DROP TABLE "model_metrics";

-- DropTable
DROP TABLE "extension_notes";

-- DropTable
DROP TABLE "integration_events";

-- DropTable
DROP TABLE "sms_messages";

-- DropTable
DROP TABLE "job_runs";

-- DropTable
DROP TABLE "audit_logs";

COMMIT;
