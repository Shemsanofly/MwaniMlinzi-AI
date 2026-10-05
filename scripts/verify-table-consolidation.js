import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

dotenv.config({ quiet: true });
const original = new URL(process.env.DATABASE_URL);
const databaseName = `table_consolidation_${Date.now()}_verify_test`;
const target = new URL(original);
target.pathname = `/${databaseName}`;
const adminUrl = new URL(original);
adminUrl.pathname = '/postgres';
const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
const db = new PrismaClient({ datasourceUrl: target.toString() });
let created = false;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const folder = fs.readdirSync('backups').filter((name) => name.startsWith('before-table-consolidation-')).sort().at(-1);
  if (!folder) throw new Error('Run scripts/backup-database.js first.');
  const binary = process.env.PG_RESTORE_PATH || (process.platform === 'win32'
    ? 'C:/Program Files/PostgreSQL/18/bin/pg_restore.exe' : 'pg_restore');
  const restore = spawnSync(binary, [
    '--host', target.hostname, '--port', target.port || '5432', '--username', decodeURIComponent(target.username),
    '--dbname', databaseName, '--no-owner', '--no-privileges', path.join('backups', folder, 'database.dump'),
  ], { env: { ...process.env, PGPASSWORD: decodeURIComponent(target.password) }, encoding: 'utf8', windowsHide: true });
  if (restore.error || restore.status !== 0) throw new Error('Restoring the verification database failed.');

  // Exercise backfills that can be empty in a developer's database. This is an isolated copy.
  const [farm] = await db.$queryRawUnsafe('SELECT id FROM farms LIMIT 1');
  if (farm) {
    const [user] = await db.$queryRawUnsafe('SELECT id FROM users LIMIT 1');
    await db.$executeRawUnsafe(`INSERT INTO sale_records (id, farm_id, sale_date, quantity_kg, price_per_kg, total_tzs) VALUES (gen_random_uuid(), $1::uuid, now(), 10, 1000, 10000)`, farm.id);
    await db.$executeRawUnsafe(`INSERT INTO farm_costs (id, farm_id, cost_date, category, amount_tzs) VALUES (gen_random_uuid(), $1::uuid, now(), 'LABOUR', 5000)`, farm.id);
    await db.$executeRawUnsafe(`INSERT INTO work_logs (id, farm_id, work_date, activity) VALUES (gen_random_uuid(), $1::uuid, now(), 'CLEANING_LINES')`, farm.id);
    await db.$executeRawUnsafe(`INSERT INTO loss_records (id, farm_id, loss_date, cause, percent_lost) VALUES (gen_random_uuid(), $1::uuid, now(), 'STORM', 12)`, farm.id);
    await db.$executeRawUnsafe(`INSERT INTO extension_notes (id, farm_id, author_id, note) VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'Migration verification')`, farm.id, user.id);
    await db.$executeRawUnsafe(`INSERT INTO sms_messages (id, direction, phone_number, body, simulated) VALUES (gen_random_uuid(), 'INBOUND', '+255700000000', 'Migration verification', false)`);
    await db.$executeRawUnsafe(`INSERT INTO uploaded_files (id, original_name, stored_name, mime_type, size_bytes, uploaded_by_id) VALUES (gen_random_uuid(), 'verify.png', 'migration-verify.png', 'image/png', 10, $1::uuid)`, user.id);
    await db.$executeRawUnsafe(`UPDATE farm_observations SET image_file_id = (SELECT id FROM uploaded_files WHERE stored_name = 'migration-verify.png') WHERE id = (SELECT id FROM farm_observations LIMIT 1)`);
    await db.$executeRawUnsafe(`INSERT INTO ml_models (id, name, version, risk_type, algorithm, trained_at, training_records, test_records, synthetic_data, feature_names, file_path) VALUES (gen_random_uuid(), 'Migration verification', 'migration-verify', 'HEAT_ICE_ICE', 'test', now(), 1, 1, false, '[]', 'verify.json')`);
    await db.$executeRawUnsafe(`INSERT INTO model_metrics (id, model_id, dataset, metric, value, details) SELECT gen_random_uuid(), id, 'TEST', 'accuracy', 0.75, '{"nested":{"preserved":true}}'::jsonb FROM ml_models WHERE version = 'migration-verify'`);
  }

  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: target.toString() }, encoding: 'utf8', windowsHide: true,
  });
  if (migration.error || migration.status !== 0) throw new Error(`Verification migration failed: ${migration.stderr}\n${migration.stdout}`);
  const [{ count }] = await db.$queryRawUnsafe("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  if (count !== 30) throw new Error(`Expected 30 tables, found ${count}.`);
  const records = await db.$queryRawUnsafe('SELECT record_type, count(*)::int AS count FROM farm_records GROUP BY record_type ORDER BY record_type');
  const events = await db.$queryRawUnsafe('SELECT record_type, count(*)::int AS count FROM event_logs GROUP BY record_type ORDER BY record_type');
  console.log(JSON.stringify({ verifiedTables: count, records, events }, null, 2));
  console.log('Backup restored successfully; all migration data assertions passed in an isolated database.');
} finally {
  await db.$disconnect();
  // Only drop the unique verification database created by this invocation.
  if (created && /^table_consolidation_\d+_verify_test$/.test(databaseName)) {
    await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  }
  await admin.$disconnect();
}
