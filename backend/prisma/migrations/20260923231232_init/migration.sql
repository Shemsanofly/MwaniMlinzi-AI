-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('FARMER', 'COOPERATIVE_ADMIN', 'EXTENSION_OFFICER', 'BUYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'sw');

-- CreateEnum
CREATE TYPE "FarmingMethod" AS ENUM ('OFF_BOTTOM', 'LONG_LINE', 'RAFT', 'FLOATING_LINE');

-- CreateEnum
CREATE TYPE "FarmExposure" AS ENUM ('SHELTERED', 'MODERATE', 'EXPOSED');

-- CreateEnum
CREATE TYPE "AnchoringMethod" AS ENUM ('WOODEN_STAKES', 'CONCRETE_BLOCKS', 'SAND_BAGS', 'ROCKS');

-- CreateEnum
CREATE TYPE "FarmStatus" AS ENUM ('ACTIVE', 'FALLOW', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('ACTIVE', 'HARVESTED', 'FAILED');

-- CreateEnum
CREATE TYPE "CropCondition" AS ENUM ('GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "GrowthCondition" AS ENUM ('NORMAL', 'SLOW', 'UNUSUAL');

-- CreateEnum
CREATE TYPE "WaterAppearance" AS ENUM ('CLEAR', 'TURBID', 'DISCOLORED');

-- CreateEnum
CREATE TYPE "GearCondition" AS ENUM ('GOOD', 'LOOSE', 'BROKEN', 'MISSING');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "DataChannel" AS ENUM ('APP', 'SMS', 'USSD', 'EXTENSION', 'SEED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "DiseaseType" AS ENUM ('ICE_ICE', 'EPIPHYTES', 'GRAZING', 'OTHER');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('LIVE', 'CACHED', 'DEMO', 'SIMULATION');

-- CreateEnum
CREATE TYPE "RiskType" AS ENUM ('HEAT_ICE_ICE', 'STORM_LINE_DAMAGE', 'POOR_GROWTH', 'HARVEST_WINDOW');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ModelType" AS ENUM ('RULE', 'ML', 'HYBRID');

-- CreateEnum
CREATE TYPE "PredictionTrigger" AS ENUM ('SCHEDULED', 'OBSERVATION', 'MANUAL', 'SIMULATION', 'SEED');

-- CreateEnum
CREATE TYPE "CropStage" AS ENUM ('ANY', 'EARLY', 'GROWING', 'MATURING', 'HARVEST_READY');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('ROUTINE', 'SOON', 'URGENT', 'IMMEDIATE');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'DISMISSED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('NO_LOSS', 'MINOR_LOSS', 'MAJOR_LOSS', 'TOTAL_LOSS', 'HARVESTED');

-- CreateEnum
CREATE TYPE "QuantityUnit" AS ENUM ('KG_DRY', 'KG_WET');

-- CreateEnum
CREATE TYPE "QualityGrade" AS ENUM ('A', 'B', 'C', 'REJECT');

-- CreateEnum
CREATE TYPE "DryingMethod" AS ENUM ('RACK', 'TARPAULIN', 'ROPE_HANGING', 'GROUND');

-- CreateEnum
CREATE TYPE "LossCause" AS ENUM ('ICE_ICE', 'STORM', 'EPIPHYTES', 'GRAZING', 'THEFT', 'POOR_GROWTH', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('HEAT_HIGH', 'HEAT_CRITICAL', 'STORM_HIGH', 'STORM_CRITICAL', 'POOR_GROWTH', 'HARVEST_WINDOW', 'MISSING_REPORT', 'RISK_CHANGE');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'SIMULATED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ModelStatus" AS ENUM ('TRAINED', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('CORRECT', 'FALSE_POSITIVE', 'FALSE_NEGATIVE', 'FLAGGED');

-- CreateEnum
CREATE TYPE "DemandStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "preferred_language" "Language" NOT NULL DEFAULT 'sw',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "consent_given" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "cooperative_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "farmers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "farmer_code" TEXT NOT NULL,
    "village" TEXT,
    "district" TEXT,
    "region" TEXT,
    "years_experience" INTEGER,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farmers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooperatives" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "description" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cooperatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooperative_members" (
    "id" UUID NOT NULL,
    "cooperative_id" UUID NOT NULL,
    "farmer_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cooperative_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seaweed_species" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "scientific_name" TEXT NOT NULL,
    "common_name" TEXT NOT NULL,
    "common_name_sw" TEXT NOT NULL,
    "typical_cycle_days" INTEGER NOT NULL,
    "optimal_sst_min" DOUBLE PRECISION NOT NULL,
    "optimal_sst_max" DOUBLE PRECISION NOT NULL,
    "heat_sensitivity" DOUBLE PRECISION NOT NULL,
    "yield_kg_dry_per_line" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "seaweed_species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" UUID NOT NULL,
    "farm_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "farmer_id" UUID NOT NULL,
    "cooperative_id" UUID,
    "species_id" UUID NOT NULL,
    "farming_method" "FarmingMethod" NOT NULL DEFAULT 'OFF_BOTTOM',
    "exposure" "FarmExposure" NOT NULL DEFAULT 'MODERATE',
    "anchoring_method" "AnchoringMethod" NOT NULL DEFAULT 'WOODEN_STAKES',
    "area_hectares" DOUBLE PRECISION,
    "line_count" INTEGER NOT NULL DEFAULT 0,
    "status" "FarmStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "demo_scenario" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_locations" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location_name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "water_depth_m" DOUBLE PRECISION,

    CONSTRAINT "farm_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planting_cycles" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_date" DATE NOT NULL,
    "expected_harvest_date" DATE NOT NULL,
    "lines_planted" INTEGER NOT NULL,
    "seed_quantity_kg" DOUBLE PRECISION,
    "status" "CycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planting_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_observations" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_cycle_id" UUID,
    "reporter_id" UUID,
    "observed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crop_condition" "CropCondition" NOT NULL,
    "whitening" BOOLEAN NOT NULL DEFAULT false,
    "breakage" BOOLEAN NOT NULL DEFAULT false,
    "epiphytes" BOOLEAN NOT NULL DEFAULT false,
    "disease_symptoms" BOOLEAN NOT NULL DEFAULT false,
    "unusual_growth" BOOLEAN NOT NULL DEFAULT false,
    "growth_condition" "GrowthCondition",
    "water_appearance" "WaterAppearance",
    "line_condition" "GearCondition",
    "anchor_condition" "GearCondition",
    "percent_affected" DOUBLE PRECISION,
    "notes" TEXT,
    "confidence" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "channel" "DataChannel" NOT NULL DEFAULT 'APP',
    "image_file_id" UUID,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disease_observations" (
    "id" UUID NOT NULL,
    "observation_id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "disease_type" "DiseaseType" NOT NULL,
    "severity" "ConfidenceLevel" NOT NULL DEFAULT 'MEDIUM',
    "percent_affected" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disease_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage" TEXT NOT NULL DEFAULT 'LOCAL',
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_observations" (
    "id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "source" "DataSource" NOT NULL,
    "provider" TEXT NOT NULL,
    "air_temperature_c" DOUBLE PRECISION,
    "rainfall_mm" DOUBLE PRECISION,
    "wind_speed_kmh" DOUBLE PRECISION,
    "wind_direction_deg" DOUBLE PRECISION,
    "humidity_pct" DOUBLE PRECISION,
    "condition" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocean_observations" (
    "id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "source" "DataSource" NOT NULL,
    "provider" TEXT NOT NULL,
    "sea_surface_temp_c" DOUBLE PRECISION,
    "sst_anomaly_c" DOUBLE PRECISION,
    "wave_height_m" DOUBLE PRECISION,
    "current_velocity_ms" DOUBLE PRECISION,
    "salinity_psu" DOUBLE PRECISION,
    "chlorophyll_mg_m3" DOUBLE PRECISION,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocean_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environmental_observations" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "source" "DataSource" NOT NULL,
    "weather_source" "DataSource" NOT NULL,
    "ocean_source" "DataSource" NOT NULL,
    "weather_observation_id" UUID,
    "ocean_observation_id" UUID,
    "sea_surface_temp_c" DOUBLE PRECISION,
    "sst_anomaly_c" DOUBLE PRECISION,
    "sst_anomaly_days" INTEGER,
    "wave_height_m" DOUBLE PRECISION,
    "current_velocity_ms" DOUBLE PRECISION,
    "salinity_psu" DOUBLE PRECISION,
    "chlorophyll_mg_m3" DOUBLE PRECISION,
    "air_temperature_c" DOUBLE PRECISION,
    "rainfall_mm" DOUBLE PRECISION,
    "wind_speed_kmh" DOUBLE PRECISION,
    "wind_direction_deg" DOUBLE PRECISION,
    "humidity_pct" DOUBLE PRECISION,
    "weather_condition" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environmental_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_predictions" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_cycle_id" UUID,
    "environmental_obs_id" UUID,
    "risk_type" "RiskType" NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "forecast_horizon_hours" INTEGER NOT NULL DEFAULT 72,
    "model_type" "ModelType" NOT NULL,
    "model_version" TEXT NOT NULL,
    "rule_probability" DOUBLE PRECISION NOT NULL,
    "ml_probability" DOUBLE PRECISION,
    "features" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "explanation_sw" TEXT NOT NULL,
    "data_source" "DataSource" NOT NULL,
    "trigger" "PredictionTrigger" NOT NULL DEFAULT 'MANUAL',
    "is_simulation" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" TEXT,
    "flagged_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_factors" (
    "id" UUID NOT NULL,
    "prediction_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_sw" TEXT NOT NULL,
    "value" TEXT,
    "contribution" DOUBLE PRECISION NOT NULL,
    "direction" TEXT NOT NULL,

    CONSTRAINT "risk_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_library" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "risk_type" "RiskType" NOT NULL,
    "minimum_risk_level" "RiskLevel" NOT NULL,
    "maximum_risk_level" "RiskLevel",
    "crop_stage" "CropStage" NOT NULL DEFAULT 'ANY',
    "conditions" JSONB,
    "action" TEXT NOT NULL,
    "action_sw" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "explanation_sw" TEXT NOT NULL,
    "urgency" "Urgency" NOT NULL DEFAULT 'ROUTINE',
    "urgency_hours" INTEGER NOT NULL DEFAULT 72,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validated_by_id" UUID,
    "validated_at" TIMESTAMP(3),
    "validation_note" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "escalate_to_extension" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_recommendations" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "prediction_id" UUID,
    "action_library_id" UUID NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "due_by" TIMESTAMP(3) NOT NULL,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "is_simulation" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_actions" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "recommendation_id" UUID,
    "user_id" UUID,
    "action_taken" BOOLEAN NOT NULL,
    "description" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "channel" "DataChannel" NOT NULL DEFAULT 'APP',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_outcomes" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "farmer_action_id" UUID,
    "recommendation_id" UUID,
    "prediction_id" UUID,
    "outcome_type" "OutcomeType" NOT NULL,
    "loss_percent" DOUBLE PRECISION,
    "outcome_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "risk_materialized" BOOLEAN,
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_records" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_cycle_id" UUID,
    "buyer_id" UUID,
    "harvest_date" DATE NOT NULL,
    "estimated_quantity" DOUBLE PRECISION,
    "actual_quantity" DOUBLE PRECISION NOT NULL,
    "unit" "QuantityUnit" NOT NULL DEFAULT 'KG_DRY',
    "quality_grade" "QualityGrade",
    "drying_method" "DryingMethod",
    "drying_duration_days" DOUBLE PRECISION,
    "price_per_kg" DOUBLE PRECISION,
    "total_value" DOUBLE PRECISION,
    "difference_quantity" DOUBLE PRECISION,
    "loss_percent" DOUBLE PRECISION,
    "notes" TEXT,
    "channel" "DataChannel" NOT NULL DEFAULT 'APP',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_records" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_cycle_id" UUID,
    "loss_date" DATE NOT NULL,
    "cause" "LossCause" NOT NULL,
    "quantity_kg" DOUBLE PRECISION,
    "percent_lost" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_records" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "harvest_record_id" UUID NOT NULL,
    "grade" "QualityGrade" NOT NULL,
    "moisture_percent" DOUBLE PRECISION,
    "impurity_percent" DOUBLE PRECISION,
    "colour" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drying_records" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "harvest_record_id" UUID NOT NULL,
    "method" "DryingMethod" NOT NULL,
    "start_date" DATE NOT NULL,
    "duration_days" DOUBLE PRECISION,
    "ground_contact" BOOLEAN NOT NULL DEFAULT false,
    "rain_during_drying" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drying_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyers" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "district" TEXT,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_demand" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "species_id" UUID,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "price_per_kg" DOUBLE PRECISION,
    "needed_by" DATE NOT NULL,
    "minimum_grade" "QualityGrade",
    "status" "DemandStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buyer_demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harvest_forecasts" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "cooperative_id" UUID,
    "planting_cycle_id" UUID,
    "district" TEXT NOT NULL,
    "expected_harvest_date" DATE NOT NULL,
    "expected_quantity_kg" DOUBLE PRECISION NOT NULL,
    "risk_adjusted_quantity_kg" DOUBLE PRECISION NOT NULL,
    "low_quantity_kg" DOUBLE PRECISION NOT NULL,
    "high_quantity_kg" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "expected_grade" "QualityGrade",
    "method" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harvest_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "cooperative_id" UUID,
    "prediction_id" UUID,
    "type" "AlertType" NOT NULL,
    "severity" "RiskLevel" NOT NULL,
    "title" TEXT NOT NULL,
    "title_sw" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "message_sw" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "acknowledged_by_id" UUID,
    "acknowledged_at" TIMESTAMP(3),
    "is_simulation" BOOLEAN NOT NULL DEFAULT false,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "alert_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "notification_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "provider_ref" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_models" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "risk_type" "RiskType" NOT NULL,
    "algorithm" TEXT NOT NULL,
    "status" "ModelStatus" NOT NULL DEFAULT 'TRAINED',
    "trained_at" TIMESTAMP(3) NOT NULL,
    "training_records" INTEGER NOT NULL,
    "test_records" INTEGER NOT NULL,
    "synthetic_data" BOOLEAN NOT NULL,
    "feature_names" JSONB NOT NULL,
    "file_path" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_predictions" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "risk_prediction_id" UUID NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_feedback" (
    "id" UUID NOT NULL,
    "risk_prediction_id" UUID NOT NULL,
    "model_id" UUID,
    "user_id" UUID,
    "feedback_type" "FeedbackType" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_metrics" (
    "id" UUID NOT NULL,
    "model_id" UUID NOT NULL,
    "dataset" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_notes" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "author_id" UUID,
    "note" TEXT NOT NULL,
    "visit_priority" "RiskLevel",
    "visit_by" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ussd_sessions" (
    "id" UUID NOT NULL,
    "session_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "last_input" TEXT NOT NULL DEFAULT '',
    "last_state" TEXT NOT NULL DEFAULT 'MAIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ussd_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "command" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "job_name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "summary" JSONB,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_cooperative_id_idx" ON "users"("cooperative_id");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "farmers_user_id_key" ON "farmers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmers_farmer_code_key" ON "farmers"("farmer_code");

-- CreateIndex
CREATE INDEX "farmers_created_at_idx" ON "farmers"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cooperatives_code_key" ON "cooperatives"("code");

-- CreateIndex
CREATE INDEX "cooperative_members_farmer_id_idx" ON "cooperative_members"("farmer_id");

-- CreateIndex
CREATE INDEX "cooperative_members_cooperative_id_idx" ON "cooperative_members"("cooperative_id");

-- CreateIndex
CREATE UNIQUE INDEX "cooperative_members_cooperative_id_farmer_id_key" ON "cooperative_members"("cooperative_id", "farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "seaweed_species_code_key" ON "seaweed_species"("code");

-- CreateIndex
CREATE UNIQUE INDEX "farms_farm_code_key" ON "farms"("farm_code");

-- CreateIndex
CREATE INDEX "farms_farmer_id_idx" ON "farms"("farmer_id");

-- CreateIndex
CREATE INDEX "farms_cooperative_id_idx" ON "farms"("cooperative_id");

-- CreateIndex
CREATE INDEX "farms_created_at_idx" ON "farms"("created_at");

-- CreateIndex
CREATE INDEX "farms_status_idx" ON "farms"("status");

-- CreateIndex
CREATE UNIQUE INDEX "farm_locations_farm_id_key" ON "farm_locations"("farm_id");

-- CreateIndex
CREATE INDEX "farm_locations_district_idx" ON "farm_locations"("district");

-- CreateIndex
CREATE INDEX "planting_cycles_farm_id_idx" ON "planting_cycles"("farm_id");

-- CreateIndex
CREATE INDEX "planting_cycles_planting_date_idx" ON "planting_cycles"("planting_date");

-- CreateIndex
CREATE INDEX "planting_cycles_expected_harvest_date_idx" ON "planting_cycles"("expected_harvest_date");

-- CreateIndex
CREATE INDEX "planting_cycles_status_idx" ON "planting_cycles"("status");

-- CreateIndex
CREATE INDEX "farm_observations_farm_id_idx" ON "farm_observations"("farm_id");

-- CreateIndex
CREATE INDEX "farm_observations_created_at_idx" ON "farm_observations"("created_at");

-- CreateIndex
CREATE INDEX "farm_observations_observed_at_idx" ON "farm_observations"("observed_at");

-- CreateIndex
CREATE INDEX "farm_observations_review_status_idx" ON "farm_observations"("review_status");

-- CreateIndex
CREATE INDEX "disease_observations_farm_id_idx" ON "disease_observations"("farm_id");

-- CreateIndex
CREATE INDEX "disease_observations_created_at_idx" ON "disease_observations"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_files_stored_name_key" ON "uploaded_files"("stored_name");

-- CreateIndex
CREATE INDEX "weather_observations_created_at_idx" ON "weather_observations"("created_at");

-- CreateIndex
CREATE INDEX "weather_observations_latitude_longitude_idx" ON "weather_observations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "ocean_observations_created_at_idx" ON "ocean_observations"("created_at");

-- CreateIndex
CREATE INDEX "ocean_observations_latitude_longitude_idx" ON "ocean_observations"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "environmental_observations_farm_id_observed_at_idx" ON "environmental_observations"("farm_id", "observed_at");

-- CreateIndex
CREATE INDEX "environmental_observations_created_at_idx" ON "environmental_observations"("created_at");

-- CreateIndex
CREATE INDEX "risk_predictions_farm_id_risk_type_created_at_idx" ON "risk_predictions"("farm_id", "risk_type", "created_at");

-- CreateIndex
CREATE INDEX "risk_predictions_created_at_idx" ON "risk_predictions"("created_at");

-- CreateIndex
CREATE INDEX "risk_predictions_risk_level_idx" ON "risk_predictions"("risk_level");

-- CreateIndex
CREATE INDEX "risk_factors_prediction_id_idx" ON "risk_factors"("prediction_id");

-- CreateIndex
CREATE UNIQUE INDEX "action_library_code_key" ON "action_library"("code");

-- CreateIndex
CREATE INDEX "action_library_risk_type_minimum_risk_level_idx" ON "action_library"("risk_type", "minimum_risk_level");

-- CreateIndex
CREATE INDEX "action_recommendations_farm_id_status_idx" ON "action_recommendations"("farm_id", "status");

-- CreateIndex
CREATE INDEX "action_recommendations_created_at_idx" ON "action_recommendations"("created_at");

-- CreateIndex
CREATE INDEX "farmer_actions_farm_id_idx" ON "farmer_actions"("farm_id");

-- CreateIndex
CREATE INDEX "farmer_actions_created_at_idx" ON "farmer_actions"("created_at");

-- CreateIndex
CREATE INDEX "action_outcomes_farm_id_idx" ON "action_outcomes"("farm_id");

-- CreateIndex
CREATE INDEX "action_outcomes_created_at_idx" ON "action_outcomes"("created_at");

-- CreateIndex
CREATE INDEX "harvest_records_farm_id_idx" ON "harvest_records"("farm_id");

-- CreateIndex
CREATE INDEX "harvest_records_harvest_date_idx" ON "harvest_records"("harvest_date");

-- CreateIndex
CREATE INDEX "harvest_records_created_at_idx" ON "harvest_records"("created_at");

-- CreateIndex
CREATE INDEX "loss_records_farm_id_idx" ON "loss_records"("farm_id");

-- CreateIndex
CREATE INDEX "loss_records_created_at_idx" ON "loss_records"("created_at");

-- CreateIndex
CREATE INDEX "quality_records_farm_id_idx" ON "quality_records"("farm_id");

-- CreateIndex
CREATE INDEX "drying_records_farm_id_idx" ON "drying_records"("farm_id");

-- CreateIndex
CREATE UNIQUE INDEX "buyers_user_id_key" ON "buyers"("user_id");

-- CreateIndex
CREATE INDEX "buyer_demand_buyer_id_idx" ON "buyer_demand"("buyer_id");

-- CreateIndex
CREATE INDEX "buyer_demand_needed_by_idx" ON "buyer_demand"("needed_by");

-- CreateIndex
CREATE INDEX "harvest_forecasts_farm_id_idx" ON "harvest_forecasts"("farm_id");

-- CreateIndex
CREATE INDEX "harvest_forecasts_cooperative_id_idx" ON "harvest_forecasts"("cooperative_id");

-- CreateIndex
CREATE INDEX "harvest_forecasts_expected_harvest_date_idx" ON "harvest_forecasts"("expected_harvest_date");

-- CreateIndex
CREATE INDEX "harvest_forecasts_is_current_idx" ON "harvest_forecasts"("is_current");

-- CreateIndex
CREATE INDEX "alerts_farm_id_idx" ON "alerts"("farm_id");

-- CreateIndex
CREATE INDEX "alerts_cooperative_id_idx" ON "alerts"("cooperative_id");

-- CreateIndex
CREATE INDEX "alerts_created_at_idx" ON "alerts"("created_at");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ml_models_risk_type_version_key" ON "ml_models"("risk_type", "version");

-- CreateIndex
CREATE INDEX "model_predictions_model_id_idx" ON "model_predictions"("model_id");

-- CreateIndex
CREATE INDEX "model_predictions_created_at_idx" ON "model_predictions"("created_at");

-- CreateIndex
CREATE INDEX "model_feedback_risk_prediction_id_idx" ON "model_feedback"("risk_prediction_id");

-- CreateIndex
CREATE INDEX "model_feedback_created_at_idx" ON "model_feedback"("created_at");

-- CreateIndex
CREATE INDEX "model_metrics_model_id_idx" ON "model_metrics"("model_id");

-- CreateIndex
CREATE INDEX "extension_notes_farm_id_idx" ON "extension_notes"("farm_id");

-- CreateIndex
CREATE INDEX "extension_notes_created_at_idx" ON "extension_notes"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ussd_sessions_session_id_key" ON "ussd_sessions"("session_id");

-- CreateIndex
CREATE INDEX "ussd_sessions_phone_number_idx" ON "ussd_sessions"("phone_number");

-- CreateIndex
CREATE INDEX "sms_messages_phone_number_idx" ON "sms_messages"("phone_number");

-- CreateIndex
CREATE INDEX "sms_messages_created_at_idx" ON "sms_messages"("created_at");

-- CreateIndex
CREATE INDEX "job_runs_job_name_started_at_idx" ON "job_runs"("job_name", "started_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperative_members" ADD CONSTRAINT "cooperative_members_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooperative_members" ADD CONSTRAINT "cooperative_members_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "seaweed_species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_locations" ADD CONSTRAINT "farm_locations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planting_cycles" ADD CONSTRAINT "planting_cycles_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_observations" ADD CONSTRAINT "farm_observations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_observations" ADD CONSTRAINT "farm_observations_planting_cycle_id_fkey" FOREIGN KEY ("planting_cycle_id") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_observations" ADD CONSTRAINT "farm_observations_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_observations" ADD CONSTRAINT "farm_observations_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_observations" ADD CONSTRAINT "farm_observations_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "uploaded_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disease_observations" ADD CONSTRAINT "disease_observations_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "farm_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disease_observations" ADD CONSTRAINT "disease_observations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_observations" ADD CONSTRAINT "environmental_observations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_observations" ADD CONSTRAINT "environmental_observations_weather_observation_id_fkey" FOREIGN KEY ("weather_observation_id") REFERENCES "weather_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_observations" ADD CONSTRAINT "environmental_observations_ocean_observation_id_fkey" FOREIGN KEY ("ocean_observation_id") REFERENCES "ocean_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_predictions" ADD CONSTRAINT "risk_predictions_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_predictions" ADD CONSTRAINT "risk_predictions_planting_cycle_id_fkey" FOREIGN KEY ("planting_cycle_id") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_predictions" ADD CONSTRAINT "risk_predictions_environmental_obs_id_fkey" FOREIGN KEY ("environmental_obs_id") REFERENCES "environmental_observations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_predictions" ADD CONSTRAINT "risk_predictions_flagged_by_id_fkey" FOREIGN KEY ("flagged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_factors" ADD CONSTRAINT "risk_factors_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "risk_predictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_library" ADD CONSTRAINT "action_library_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_recommendations" ADD CONSTRAINT "action_recommendations_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_recommendations" ADD CONSTRAINT "action_recommendations_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "risk_predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_recommendations" ADD CONSTRAINT "action_recommendations_action_library_id_fkey" FOREIGN KEY ("action_library_id") REFERENCES "action_library"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_recommendations" ADD CONSTRAINT "action_recommendations_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_actions" ADD CONSTRAINT "farmer_actions_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_actions" ADD CONSTRAINT "farmer_actions_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "action_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_actions" ADD CONSTRAINT "farmer_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_farmer_action_id_fkey" FOREIGN KEY ("farmer_action_id") REFERENCES "farmer_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "action_recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "risk_predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_planting_cycle_id_fkey" FOREIGN KEY ("planting_cycle_id") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_records" ADD CONSTRAINT "harvest_records_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_records" ADD CONSTRAINT "loss_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_records" ADD CONSTRAINT "loss_records_planting_cycle_id_fkey" FOREIGN KEY ("planting_cycle_id") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_records" ADD CONSTRAINT "quality_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quality_records" ADD CONSTRAINT "quality_records_harvest_record_id_fkey" FOREIGN KEY ("harvest_record_id") REFERENCES "harvest_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_records" ADD CONSTRAINT "drying_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drying_records" ADD CONSTRAINT "drying_records_harvest_record_id_fkey" FOREIGN KEY ("harvest_record_id") REFERENCES "harvest_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyers" ADD CONSTRAINT "buyers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_demand" ADD CONSTRAINT "buyer_demand_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "buyers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_demand" ADD CONSTRAINT "buyer_demand_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "seaweed_species"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_forecasts" ADD CONSTRAINT "harvest_forecasts_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harvest_forecasts" ADD CONSTRAINT "harvest_forecasts_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_cooperative_id_fkey" FOREIGN KEY ("cooperative_id") REFERENCES "cooperatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "risk_predictions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_predictions" ADD CONSTRAINT "model_predictions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ml_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_predictions" ADD CONSTRAINT "model_predictions_risk_prediction_id_fkey" FOREIGN KEY ("risk_prediction_id") REFERENCES "risk_predictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_feedback" ADD CONSTRAINT "model_feedback_risk_prediction_id_fkey" FOREIGN KEY ("risk_prediction_id") REFERENCES "risk_predictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_feedback" ADD CONSTRAINT "model_feedback_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ml_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_feedback" ADD CONSTRAINT "model_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_metrics" ADD CONSTRAINT "model_metrics_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ml_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_notes" ADD CONSTRAINT "extension_notes_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_notes" ADD CONSTRAINT "extension_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
