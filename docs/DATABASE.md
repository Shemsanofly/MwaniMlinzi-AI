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
npx prisma migrate dev     # applies migrations (creates ~45 tables)
```

For production / CI: `npx prisma migrate deploy` (`npm run prisma:deploy`).

## 7. Seed demo data

```bash
npm run seed
```

⚠️ The seed **wipes all data** in the configured database first (it refuses in `NODE_ENV=production` unless run with `--force`).
It creates: roles & permissions, 2 seaweed species, 17 Action Library entries, default system settings, 3 demo
cooperatives, 30 demo farmers, 50 demo farms (Unguja south-east coast and Pemba), active and past planting cycles,
harvest/loss/quality/drying records, 14 days of **demo** environmental history per farm, observations, historical
predictions with actions and outcomes (feedback-loop data), and then runs the **real** risk engine, action engine, alert
service and harvest forecast service for every farm. All demo rows have `is_demo = true`.

The demo password is `DEMO_PASSWORD` from `.env`, or a generated one printed at the end and saved to
`backend/DEMO_CREDENTIALS.local.txt`.

## 8. Verify tables in pgAdmin

Right-click the `mwanimlinzi` database → **Refresh**, then expand **Schemas → public → Tables**. You should see tables such as
`users`, `roles`, `farms`, `planting_cycles`, `farm_observations`, `risk_predictions`, `risk_factors`, `action_library`,
`action_recommendations`, `farmer_actions`, `action_outcomes`, `harvest_records`, `alerts`, `ml_models`, `audit_logs`, `system_settings` …

Useful queries (Tools → Query Tool):

```sql
-- Latest risk per demo scenario farm
SELECT DISTINCT ON (f.farm_code, p.risk_type) f.farm_code, p.risk_type, p.risk_level, round(p.probability::numeric, 2) AS probability, p.created_at
FROM risk_predictions p JOIN farms f ON f.id = p.farm_id
WHERE p.is_simulation = false AND f.farm_code IN ('FARM001','FARM002','FARM003','FARM004','FARM005')
ORDER BY f.farm_code, p.risk_type, p.created_at DESC;

-- Explanation factors of a prediction
SELECT code, label, value, contribution, direction FROM risk_factors WHERE prediction_id = '<uuid>' ORDER BY contribution DESC;

-- The feedback loop: prediction → recommendation → action → outcome
SELECT f.farm_code, p.risk_type, p.risk_level, a.code AS action, fa.action_taken, o.outcome_type, o.loss_percent, o.risk_materialized
FROM action_outcomes o
JOIN farms f ON f.id = o.farm_id
LEFT JOIN risk_predictions p ON p.id = o.prediction_id
LEFT JOIN action_recommendations r ON r.id = o.recommendation_id
LEFT JOIN action_library a ON a.id = r.action_library_id
LEFT JOIN farmer_actions fa ON fa.id = o.farmer_action_id
ORDER BY o.created_at DESC LIMIT 20;

-- Risk thresholds (editable in Admin → Settings)
SELECT key, value FROM system_settings;
```

You can also browse data with `npx prisma studio` (http://localhost:5555).

## Schema overview

| Area | Tables |
|---|---|
| Identity & access | `users`, `roles`, `permissions`, `role_permissions`, `user_roles` |
| Farmers & cooperatives | `farmers`, `cooperatives`, `cooperative_members` |
| Farms | `farms`, `farm_locations`, `seaweed_species`, `planting_cycles` |
| Observations | `farm_observations`, `disease_observations`, `uploaded_files` |
| Environment | `weather_observations`, `ocean_observations`, `environmental_observations` (per-farm snapshot used by the AI; `source` = LIVE/CACHED/DEMO) |
| AI | `risk_predictions`, `risk_factors`, `action_library`, `action_recommendations` |
| Feedback loop | `farmer_actions`, `action_outcomes`, `model_feedback` |
| Harvest | `harvest_records`, `loss_records`, `quality_records`, `drying_records`, `harvest_forecasts` |
| Buyers | `buyers`, `buyer_demand` |
| Alerts | `alerts`, `notifications`, `notification_logs` |
| ML lifecycle | `ml_models`, `model_predictions`, `model_metrics` |
| Operations | `extension_notes`, `ussd_sessions`, `sms_messages`, `job_runs`, `audit_logs`, `system_settings` |

Key relationships:

```
users 1─1 farmers 1─* farms 1─* planting_cycles
farms 1─1 farm_locations
farms 1─* farm_observations 1─* disease_observations
farms 1─* environmental_observations *─1 weather_observations / ocean_observations
farms 1─* risk_predictions 1─* risk_factors
risk_predictions 1─* action_recommendations *─1 action_library
action_recommendations 1─* farmer_actions 1─* action_outcomes ─ risk_predictions
risk_predictions 1─* model_feedback, model_predictions *─1 ml_models 1─* model_metrics
cooperatives 1─* cooperative_members *─1 farmers ; cooperatives 1─* farms
buyers 1─* buyer_demand ; farms 1─* harvest_forecasts
```

Indexes exist on `farmer_id`, `farm_id`, `cooperative_id`, `created_at`, `risk_level`, `planting_date`,
`expected_harvest_date` and the common composite lookups (e.g. `(farm_id, risk_type, created_at)`).

## Backups

```bash
pg_dump -Fc -d mwanimlinzi -f mwanimlinzi_$(date +%F).dump      # backup
pg_restore -d mwanimlinzi --clean mwanimlinzi_2026-09-23.dump      # restore
```

In pgAdmin: right-click the database → **Backup…** / **Restore…**.

## Test database

`npm test` uses a separate database named `<your database>_test` (e.g. `mwanimlinzi_test`), or `TEST_DATABASE_URL` if set.
Prisma creates it automatically if your database user may create databases (otherwise create it once with
`CREATE DATABASE mwanimlinzi_test;`); the tests migrate and seed it on every run, so never point it at real data.
