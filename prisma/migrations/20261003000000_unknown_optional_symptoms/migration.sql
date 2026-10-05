-- An unanswered optional symptom is unknown, not a reported absence.
-- Existing reports retain their recorded values.
ALTER TABLE "farm_observations"
  ALTER COLUMN "epiphytes" DROP NOT NULL,
  ALTER COLUMN "epiphytes" DROP DEFAULT,
  ALTER COLUMN "disease_symptoms" DROP NOT NULL,
  ALTER COLUMN "disease_symptoms" DROP DEFAULT;
