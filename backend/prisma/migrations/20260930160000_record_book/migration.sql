-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PENDING');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('SEEDLINGS', 'ROPE_LINES', 'STAKES', 'TYING_MATERIAL', 'LABOUR', 'TRANSPORT', 'DRYING_MATERIALS', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkActivity" AS ENUM ('PLANTING', 'TYING_SEEDLINGS', 'CLEANING_LINES', 'REPAIRING_LINES', 'HARVESTING', 'DRYING', 'OTHER');

-- CreateTable
CREATE TABLE "sale_records" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_cycle_id" UUID,
    "harvest_record_id" UUID,
    "sale_date" TIMESTAMP(3) NOT NULL,
    "quantity_kg" DOUBLE PRECISION NOT NULL,
    "price_per_kg" INTEGER NOT NULL,
    "total_tzs" INTEGER NOT NULL,
    "buyer_name" TEXT,
    "quality_grade" "QualityGrade",
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PAID',
    "notes" TEXT,
    "channel" "DataChannel" NOT NULL DEFAULT 'APP',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_costs" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_cycle_id" UUID,
    "cost_date" TIMESTAMP(3) NOT NULL,
    "category" "CostCategory" NOT NULL,
    "amount_tzs" INTEGER NOT NULL,
    "notes" TEXT,
    "channel" "DataChannel" NOT NULL DEFAULT 'APP',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_logs" (
    "id" UUID NOT NULL,
    "farm_id" UUID NOT NULL,
    "planting_cycle_id" UUID,
    "work_date" TIMESTAMP(3) NOT NULL,
    "activity" "WorkActivity" NOT NULL,
    "notes" TEXT,
    "channel" "DataChannel" NOT NULL DEFAULT 'APP',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sale_records_farm_id_sale_date_idx" ON "sale_records"("farm_id", "sale_date");

-- CreateIndex
CREATE INDEX "sale_records_planting_cycle_id_idx" ON "sale_records"("planting_cycle_id");

-- CreateIndex
CREATE INDEX "farm_costs_farm_id_cost_date_idx" ON "farm_costs"("farm_id", "cost_date");

-- CreateIndex
CREATE INDEX "farm_costs_planting_cycle_id_idx" ON "farm_costs"("planting_cycle_id");

-- CreateIndex
CREATE INDEX "work_logs_farm_id_work_date_idx" ON "work_logs"("farm_id", "work_date");

-- CreateIndex
CREATE INDEX "work_logs_planting_cycle_id_idx" ON "work_logs"("planting_cycle_id");

-- AddForeignKey
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_planting_cycle_id_fkey" FOREIGN KEY ("planting_cycle_id") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_harvest_record_id_fkey" FOREIGN KEY ("harvest_record_id") REFERENCES "harvest_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_costs" ADD CONSTRAINT "farm_costs_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_costs" ADD CONSTRAINT "farm_costs_planting_cycle_id_fkey" FOREIGN KEY ("planting_cycle_id") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_planting_cycle_id_fkey" FOREIGN KEY ("planting_cycle_id") REFERENCES "planting_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

