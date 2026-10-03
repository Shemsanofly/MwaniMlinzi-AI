/*
  Warnings:

  - `ussd_sessions.last_state` is renamed to `current_menu` (no data loss).

*/
-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryStatus" ADD VALUE 'QUEUED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'UNKNOWN';
ALTER TYPE "DeliveryStatus" ADD VALUE 'NOT_CONFIGURED';

-- AlterTable
ALTER TABLE "notification_logs" ADD COLUMN     "cost" TEXT,
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "language" "Language",
ADD COLUMN     "message" TEXT,
ADD COLUMN     "message_type" TEXT,
ADD COLUMN     "provider_status" TEXT,
ADD COLUMN     "sent_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "language" "Language" NOT NULL DEFAULT 'sw',
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'INFO',
ADD COLUMN     "source" TEXT,
ADD COLUMN     "status" "DeliveryStatus",
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_harvest_reminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_risk_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_system_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ussd_sessions" RENAME COLUMN "last_state" TO "current_menu";
ALTER TABLE "ussd_sessions" 
ADD COLUMN     "farm_id" UUID,
ADD COLUMN     "language" "Language",
ADD COLUMN     "last_response" TEXT,
ADD COLUMN     "network_code" TEXT,
ADD COLUMN     "request_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "service_code" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "temp_data" JSONB,
ADD COLUMN     "user_id" UUID;

-- CreateTable
CREATE TABLE "integration_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT,
    "phone_number" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "response" TEXT,
    "error" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_events_kind_created_at_idx" ON "integration_events"("kind", "created_at");

-- CreateIndex
CREATE INDEX "integration_events_reference_idx" ON "integration_events"("reference");

-- CreateIndex
CREATE INDEX "notification_logs_provider_ref_idx" ON "notification_logs"("provider_ref");

-- CreateIndex
CREATE INDEX "ussd_sessions_created_at_idx" ON "ussd_sessions"("created_at");
