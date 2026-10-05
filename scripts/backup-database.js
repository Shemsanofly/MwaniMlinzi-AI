import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

dotenv.config({ quiet: true });
const url = new URL(process.env.DATABASE_URL);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.resolve('backups', `before-table-consolidation-${stamp}`);
fs.mkdirSync(directory, { recursive: true });
const binary = process.env.PG_DUMP_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe' : 'pg_dump');
const dump = path.join(directory, 'database.dump');
const result = spawnSync(binary, [
  '--host', url.hostname, '--port', url.port || '5432', '--username', decodeURIComponent(url.username),
  '--dbname', decodeURIComponent(url.pathname.slice(1)), '--format', 'custom', '--file', dump,
], { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, encoding: 'utf8', windowsHide: true });
if (result.error || result.status !== 0) throw new Error('Database backup failed; no migration should be applied.');
fs.copyFileSync('prisma/schema.prisma', path.join(directory, 'schema.prisma'));
fs.writeFileSync(path.join(directory, 'RESTORE.txt'),
  'This is a complete PostgreSQL custom-format backup from before table consolidation.\n' +
  'Restore into a separate, empty database using pg_restore --dbname <database> database.dump.\n' +
  'The schema.prisma file records the application schema at backup time. Keep this directory private.\n');
console.log(`Backup saved: ${directory}`);
