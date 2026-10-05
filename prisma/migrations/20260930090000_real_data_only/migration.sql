-- Real data only: remove demo flags, the demo scenario column and the DEMO data source.
-- Readings that came from the old demo generator are deleted (they were never real measurements);
-- predictions that used them keep their record but are marked UNAVAILABLE (no real environmental input).
-- For a completely clean start on an old development database run: npx prisma migrate reset (then npm run seed).

DELETE FROM "environmental_observations" WHERE "source" = 'DEMO' OR "weather_source" = 'DEMO' OR "ocean_source" = 'DEMO';
DELETE FROM "weather_observations" WHERE "source" = 'DEMO';
DELETE FROM "ocean_observations" WHERE "source" = 'DEMO';

-- AlterEnum
BEGIN;
CREATE TYPE "DataSource_new" AS ENUM ('LIVE', 'CACHED', 'SIMULATION', 'UNAVAILABLE');
ALTER TABLE "weather_observations" ALTER COLUMN "source" TYPE "DataSource_new" USING ("source"::text::"DataSource_new");
ALTER TABLE "ocean_observations" ALTER COLUMN "source" TYPE "DataSource_new" USING ("source"::text::"DataSource_new");
ALTER TABLE "environmental_observations" ALTER COLUMN "source" TYPE "DataSource_new" USING ("source"::text::"DataSource_new");
ALTER TABLE "environmental_observations" ALTER COLUMN "weather_source" TYPE "DataSource_new" USING ("weather_source"::text::"DataSource_new");
ALTER TABLE "environmental_observations" ALTER COLUMN "ocean_source" TYPE "DataSource_new" USING ("ocean_source"::text::"DataSource_new");
ALTER TABLE "risk_predictions" ALTER COLUMN "data_source" TYPE "DataSource_new" USING ((CASE WHEN "data_source"::text = 'DEMO' THEN 'UNAVAILABLE' ELSE "data_source"::text END)::"DataSource_new");
ALTER TYPE "DataSource" RENAME TO "DataSource_old";
ALTER TYPE "DataSource_new" RENAME TO "DataSource";
DROP TYPE "public"."DataSource_old";
COMMIT;

-- AlterTable
ALTER TABLE "action_outcomes" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "action_recommendations" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "alerts" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "buyers" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "cooperatives" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "environmental_observations" DROP COLUMN "is_demo",
ALTER COLUMN "weather_source" DROP NOT NULL,
ALTER COLUMN "ocean_source" DROP NOT NULL;

-- AlterTable
ALTER TABLE "farm_observations" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "farmer_actions" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "farmers" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "farms" DROP COLUMN "demo_scenario",
DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "harvest_forecasts" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "harvest_records" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "loss_records" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "ocean_observations" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "planting_cycles" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "risk_predictions" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "is_demo";

-- AlterTable
ALTER TABLE "weather_observations" DROP COLUMN "is_demo";


-- Starter action-library wording (no longer called a demo rule set).
UPDATE "action_library" SET "source" = 'MwaniMlinzi starter rule set v1 — awaiting validation by local seaweed extension experts'
WHERE "source" = 'MwaniMlinzi demo rule set v1 — requires local expert validation before real-world deployment';

-- Models trained on the old synthetic dataset are retired; only models trained on field outcomes may be active.
UPDATE "ml_models" SET "status" = 'RETIRED' WHERE "synthetic_data" = true;
