-- Preserve accounts and existing administrator access while removing obsolete roles.
BEGIN;

INSERT INTO "roles" ("id", "name", "description", "permissions")
VALUES (gen_random_uuid(), 'FARMER', 'Seaweed farmer: manages own farms and records', ARRAY[]::text[])
ON CONFLICT ("name") DO NOTHING;

-- A user who has no Farmer/Admin assignment becomes a Farmer, never an Admin.
INSERT INTO "user_roles" ("user_id", "role_id")
SELECT u."id", r."id" FROM "users" u CROSS JOIN "roles" r
WHERE r."name" = 'FARMER'
AND NOT EXISTS (
  SELECT 1 FROM "user_roles" ur JOIN "roles" active ON active."id" = ur."role_id"
  WHERE ur."user_id" = u."id" AND active."name" IN ('FARMER', 'ADMIN')
)
ON CONFLICT ("user_id", "role_id") DO NOTHING;

-- Profiles let converted accounts use farmer screens without creating fake farms.
INSERT INTO "farmers" ("id", "user_id", "farmer_code", "updated_at")
SELECT gen_random_uuid(), u."id", 'FMR-' || upper(replace(u."id"::text, '-', '')), CURRENT_TIMESTAMP
FROM "users" u
WHERE EXISTS (
  SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."role_id"
  WHERE ur."user_id" = u."id" AND r."name" = 'FARMER'
)
ON CONFLICT ("user_id") DO NOTHING;

INSERT INTO "cooperative_members" ("id", "cooperative_id", "farmer_id")
SELECT gen_random_uuid(), u."cooperative_id", f."id"
FROM "users" u JOIN "farmers" f ON f."user_id" = u."id"
WHERE u."cooperative_id" IS NOT NULL
ON CONFLICT ("cooperative_id", "farmer_id") DO NOTHING;

DELETE FROM "user_roles" WHERE "role_id" IN (
  SELECT "id" FROM "roles" WHERE "name" NOT IN ('FARMER', 'ADMIN')
);
DELETE FROM "roles" WHERE "name" NOT IN ('FARMER', 'ADMIN');

-- PostgreSQL cannot drop enum members directly: replace the type after conversion.
ALTER TYPE "RoleName" RENAME TO "RoleName_old";
CREATE TYPE "RoleName" AS ENUM ('FARMER', 'ADMIN');
ALTER TABLE "roles" ALTER COLUMN "name" TYPE "RoleName" USING "name"::text::"RoleName";
DROP TYPE "RoleName_old";

COMMIT;
