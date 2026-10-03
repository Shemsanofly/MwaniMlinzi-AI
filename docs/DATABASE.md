# Database — PostgreSQL + pgAdmin

MwaniMlinzi uses **PostgreSQL** accessed through **Prisma ORM**. The schema lives in
`backend/prisma/schema.prisma`; migrations live in `backend/prisma/migrations/`. Table and column
names are snake_case so they are easy to read in pgAdmin.

## 1. Install PostgreSQL

| OS | How |
|---|---|
| Windows | Download the installer from <https://www.postgresql.org/download/windows/> (EDB). It includes **pgAdmin 4** and asks you to set a password for the `postgres` superuser. Keep port `5432`. |
| macOS | `brew install postgresql@16 && brew services start postgresql@16`, or Postgres.app. Install pgAdmin from <https://www.pgadmin.org/download/>. |
| Ubuntu/Debian | `sudo apt install postgresql postgresql-contrib` then `sudo systemctl enable --now postgresql`. Install pgAdmin from <https://www.pgadmin.org/download/pgadmin-4-apt/>. |

On Linux, set a password for the `postgres` user (needed for password authentication):

```bash
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'choose-a-password';"
```

## 2. Open pgAdmin and connect

1. Start **pgAdmin 4**.
2. In the browser tree, right-click **Servers → Register → Server…**
3. *General* tab → Name: `Local PostgreSQL`.
4. *Connection* tab → Host: `localhost`, Port: `5432`, Maintenance database: `postgres`, Username: `postgres`, Password: your password → **Save**.

## 3. Create the database

In pgAdmin: right-click **Databases → Create → Database…** → Database: `mwanimlinzi` → Owner: `postgres` (or the user below) → **Save**.

Or with `psql`:

```sql
CREATE DATABASE mwanimlinzi;
```

## 4. (Recommended) Create a dedicated application user

In pgAdmin: **Login/Group Roles → Create → Login/Group Role…** → Name `mwani_app`, *Definition* → password, *Privileges* → *Can login* = Yes.
Then give it ownership of the database (right-click `mwanimlinzi` → Properties → Owner = `mwani_app`). Equivalent SQL:

```sql
CREATE ROLE mwani_app WITH LOGIN PASSWORD 'strong-password';
ALTER DATABASE mwanimlinzi OWNER TO mwani_app;
-- Needed only for `npx prisma migrate dev` (Prisma creates a temporary shadow database):
ALTER ROLE mwani_app CREATEDB;
```

> `prisma migrate dev` needs permission to create a *shadow database*. In production use
> `npx prisma migrate deploy`, which does not.

## 5. Set `DATABASE_URL`

In `backend/.env`:

```ini
DATABASE_URL=postgresql://mwani_app:strong-password@localhost:5432/mwanimlinzi
```

Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`. URL-encode special characters in the password
(e.g. `@` → `%40`). Never commit `.env`.

## 6. Run the Prisma migration

```bash
cd backend
npm install
npx prisma generate        # generates the Prisma client
npx prisma migrate dev     # applies migrations (creates 29 application tables + 1 Prisma migration table)
```

For production / CI: `npx prisma migrate deploy` (`npm run prisma:deploy`).

## 7. Seed reference data and the first admin

```bash
npm run seed
```

The seed is **non-destructive** and safe to re-run (also in production). It upserts roles and permissions (FARMER,
ADMIN), the 2 seaweed species (`KAPPA`, `EUCH`), default system settings and the 17 starter Action Library entries
(source *"MwaniMlinzi starter rule set v1 — awaiting validation by local seaweed extension experts"*; existing entries
are left untouched so expert edits and validations are kept). If no admin exists it creates one:

- email `ADMIN_EMAIL` (default `admin@mwanimlinzi.local`)
- password `ADMIN_PASSWORD` (at least 12 characters), or — if empty — a generated password that is printed once and
  saved to `backend/ADMIN_CREDENTIALS.local.txt` (git-ignored). Change it after the first login.

No farmers, farms, observations or environmental data are created. Farmers register themselves (web or USSD), and all
environmental readings come from live providers.

### Upgrading a database that still holds old demo data

The migration `20260930090000_real_data_only` deletes readings produced by the old demo generator, marks predictions
that used them as `UNAVAILABLE`, removes the `is_demo` and `demo_scenario` columns and the `DEMO` data source:

```bash
npx prisma migrate deploy
```

Farms, users and records created by the old demo seed are not deleted by the migration. For a completely clean start:

```bash
npx prisma migrate reset     # drops and recreates the database — all data is lost
npm run seed
```

## 8. Verify tables in pgAdmin

Right-click the `mwanimlinzi` database → **Refresh**, then expand **Schemas → public → Tables**. You should see tables such as
`users`, `roles`, `farms`, `planting_cycles`, `farm_observations`, `risk_predictions`, `risk_factors`, `action_library`,
`action_recommendations`, `farmer_actions`, `action_outcomes`, `harvest_records`, `alerts`, `ml_models`, `audit_logs`, `system_settings` …

Useful queries (Tools → Query Tool):

```sql
-- Latest real (non-simulation) risk per farm and risk type, with its data source
SELECT DISTINCT ON (f.farm_code, p.risk_type) f.farm_code, p.risk_type, p.risk_level, round(p.probability::numeric, 2) AS probability, p.data_source, p.created_at
FROM risk_predictions p JOIN farms f ON f.id = p.farm_id
WHERE p.is_simulation = false
ORDER BY f.farm_code, p.risk_type, p.created_at DESC;

-- Latest environmental reading per farm: source (LIVE/CACHED) and providers
SELECT DISTINCT ON (f.farm_code) f.farm_code, e.source, w.provider AS weather_provider, o.provider AS ocean_provider,
       e.sea_surface_temp_c, e.wave_height_m, e.wind_speed_kmh, e.rainfall_mm, e.observed_at
FROM environmental_observations e JOIN farms f ON f.id = e.farm_id
LEFT JOIN environmental_observations w ON w.id = e.weather_observation_id
LEFT JOIN environmental_observations o ON o.id = e.ocean_observation_id
ORDER BY f.farm_code, e.observed_at DESC;

-- Explanation factors of a prediction
SELECT factor->>'code' AS code, factor->>'label' AS label, factor->>'value' AS value,
       factor->>'contribution' AS contribution, factor->>'direction' AS direction
FROM risk_predictions p CROSS JOIN LATERAL jsonb_array_elements(p.factors) factor
WHERE p.id = '<uuid>' ORDER BY (factor->>'contribution')::numeric DESC;

-- The feedback loop: prediction → recommendation → action → outcome
SELECT f.farm_code, p.risk_type, p.risk_level, a.code AS action, fa.action_taken, o.outcome_type, o.loss_percent, o.risk_materialized
FROM farm_records o
JOIN farms f ON f.id = o.farm_id
LEFT JOIN risk_predictions p ON p.id = o.prediction_id
LEFT JOIN action_recommendations r ON r.id = o.recommendation_id
LEFT JOIN action_library a ON a.id = r.action_library_id
LEFT JOIN farmer_actions fa ON fa.id = o.farmer_action_id
WHERE o.record_type = 'OUTCOME'
ORDER BY o.created_at DESC LIMIT 20;

-- Risk thresholds (editable in Admin → Settings)
SELECT key, value FROM system_settings;
```

You can also browse data with `npx prisma studio` (http://localhost:5555).

## Schema overview

| Area | Tables |
|---|---|
| Identity & access | `users`, `roles`, `user_roles`, `password_resets`, `public_access_tokens` |
| Farmers & cooperatives | `farmers`, `cooperatives`, `cooperative_members` |
| Farms | `farms`, `seaweed_species`, `planting_cycles` |
| Observations | `farm_observations` |
| Environment | `environmental_observations`, `sea_outlooks` |
| AI & actions | `risk_predictions`, `action_library`, `action_recommendations`, `farmer_actions` |
| Record book & field outcomes | `farm_records` |
| Harvest | `harvest_records`, `harvest_forecasts` |
| Buyers | `buyers`, `buyer_demand` |
| Alerts | `alerts`, `notifications` |
| ML lifecycle | `ml_models` |
| Operations & event history | `event_logs`, `ussd_sessions`, `system_settings` |

### Consolidation applied on 2 October 2026

The migration `20261002170000_reduce_to_29_tables` reduces 47 application tables to 29 while retaining the existing IDs, timestamps, field values and foreign-key links. It copies and verifies every source row in a transaction before dropping the old tables. A failed verification rolls the transaction back.

| Previous storage | Current storage |
|---|---|
| `permissions`, `role_permissions` | Permission keys in `roles.permissions`; original permission definitions and mappings retained in `system_settings` under `database.permissionCatalog` |
| `farm_locations` | `farms.location` JSON, including original location IDs and water depth |
| `disease_observations` | `farm_observations.diseases` JSON array; each disease retains its original ID and metadata |
| `weather_observations`, `ocean_observations` | `environmental_observations` rows with `record_type` WEATHER or OCEAN; FARM rows link to those readings |
| `sale_records`, `farm_costs`, `work_logs`, `loss_records`, `extension_notes`, `action_outcomes` | `farm_records` rows with types SALE, COST, WORK, LOSS, NOTE and OUTCOME |
| `audit_logs`, `job_runs`, `integration_events`, `sms_messages`, `uploaded_files`, `notification_logs`, `model_metrics`, `model_feedback` | `event_logs` rows with types AUDIT, JOB, INTEGRATION, SMS, UPLOAD, DELIVERY, METRIC and FEEDBACK |

Application queries use the type-scoped repositories in `backend/src/db/records.js`, including unique-ID lookups and deletions. Existing HTTP endpoints and record-book calculations are preserved. SQL CHECK constraints require the appropriate fields for each type; indexes support farm/date, event/type/date, provider-reference and model queries. Upload metadata and ML metrics remain relational rows rather than being buried in audit JSON. When an ML model is deleted, its event history is retained with a null model link.

Risk factors remain in `risk_predictions.factors`; harvest quality and drying measurements remain in `harvest_records` (from the earlier consolidation).

Example queries:

```sql
SELECT record_type, count(*) FROM farm_records GROUP BY record_type;
SELECT * FROM farm_records WHERE record_type = 'SALE' ORDER BY sale_date DESC;
SELECT * FROM event_logs WHERE record_type = 'AUDIT' ORDER BY created_at DESC LIMIT 50;
SELECT * FROM event_logs WHERE record_type = 'DELIVERY' ORDER BY created_at DESC LIMIT 50;
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'; -- 30
```

### Verification

From `backend/`:

```bash
node scripts/backup-database.js             # full pg_dump backup, ignored by Git
node scripts/verify-table-consolidation.js  # restore the backup into a temporary database, exercise backfills, migrate, verify 30 tables
npm test                                  # isolated test database; includes record-type isolation and API tests
npm run lint
```

The verification script expects a backup from before this migration. It creates a uniquely named verification database and deletes only that database afterward. It requires PostgreSQL client binaries (default Windows path: PostgreSQL 18; override with PG_DUMP_PATH / PG_RESTORE_PATH). Backup files live in `backend/backups/` and include a schema snapshot and restore instructions.

## Backups

```bash
pg_dump -Fc -d mwanimlinzi -f mwanimlinzi_$(date +%F).dump      # backup
pg_restore -d mwanimlinzi --clean mwanimlinzi_2026-09-23.dump      # restore
```

In pgAdmin: right-click the database → **Backup…** / **Restore…**.

## Test database

`npm test` uses a separate database named `<your database>_test` (e.g. `mwanimlinzi_test`), or `TEST_DATABASE_URL` if set.
Prisma creates it automatically if your database user may create databases (otherwise create it once with
`CREATE DATABASE mwanimlinzi_test;`). Every run migrates it and loads test-only fixtures from `backend/tests/fixtures/`
(including deterministic environmental values injected as a fake provider), so never point it at real data. Tests set
`WEATHER_PROVIDER=none` and `OCEAN_PROVIDER=none` and never call live APIs. The fixture data is never used by the app.
