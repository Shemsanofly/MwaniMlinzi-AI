-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'DRYING_WEATHER';

-- AlterEnum
ALTER TYPE "RiskType" ADD VALUE 'DRYING_WEATHER';

-- CreateTable
CREATE TABLE "sea_outlooks" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tide_provider" TEXT,
    "rain_provider" TEXT,
    "tides" JSONB,
    "drying" JSONB,

    CONSTRAINT "sea_outlooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sea_outlooks_farm_id_fetched_at_idx" ON "sea_outlooks"("farm_id", "fetched_at");

-- AddForeignKey
ALTER TABLE "sea_outlooks" ADD CONSTRAINT "sea_outlooks_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

