import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';
import { boot, pendingMigrations } from '../../src/server/boot.js';

const fakePrisma = (applied = []) => ({
  $connect: jest.fn().mockResolvedValue(),
  $disconnect: jest.fn().mockResolvedValue(),
  $queryRaw: jest.fn().mockResolvedValue(applied.map((migration_name) => ({ migration_name }))),
});
const migrationsDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  fs.mkdirSync(path.join(dir, '001_init')); fs.mkdirSync(path.join(dir, '002_more'));
  return dir;
};
const quiet = { log: jest.fn(), error: jest.fn() };

beforeEach(() => {
  delete globalThis.__mwaniBoot;
  quiet.log.mockClear();
  quiet.error.mockClear();
});

test('pendingMigrations lists folders not yet applied', async () => {
  expect(await pendingMigrations(fakePrisma(['001_init']), migrationsDir())).toEqual(['002_more']);
});

test('boot connects, warns about pending migrations and starts jobs only when enabled', async () => {
  const start = jest.fn(() => [{ destroy: jest.fn() }]);
  const prismaClient = fakePrisma(['001_init']);
  const { tasks } = await boot({ startScheduler: start, prismaClient, logger: quiet, migrationsDir: migrationsDir(), enableJobs: true });
  expect(prismaClient.$connect).toHaveBeenCalled();
  expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('002_more'));
  expect(start).toHaveBeenCalledTimes(1);
  expect(tasks).toHaveLength(1);
});

test('boot is idempotent and keeps serving when the database is down', async () => {
  const start = jest.fn(() => []);
  const prismaClient = { ...fakePrisma(), $connect: jest.fn().mockRejectedValue(new Error('down')) };
  const first = await boot({ startScheduler: start, prismaClient, logger: quiet, migrationsDir: migrationsDir(), enableJobs: false });
  const second = await boot({ startScheduler: start, prismaClient, logger: quiet, migrationsDir: migrationsDir(), enableJobs: false });
  expect(second).toBe(first);
  expect(start).not.toHaveBeenCalled();
  expect(quiet.error).toHaveBeenCalledWith(expect.stringContaining('could not connect to PostgreSQL'), 'down');
});

test('graceful shutdown destroys tasks and disconnects from database', async () => {
  const task1 = { destroy: jest.fn() };
  const task2 = { destroy: jest.fn() };
  const start = jest.fn(() => [task1, task2]);
  const prismaClient = fakePrisma();
  const { shutdown } = await boot({ startScheduler: start, prismaClient, logger: quiet, migrationsDir: migrationsDir(), enableJobs: true });

  await shutdown('SIGTERM');
  expect(task1.destroy).toHaveBeenCalledTimes(1);
  expect(task2.destroy).toHaveBeenCalledTimes(1);
  expect(prismaClient.$disconnect).toHaveBeenCalledTimes(1);
  expect(quiet.log).toHaveBeenCalledWith('[api] SIGTERM received, shutting down');

  // Second shutdown should not call destroy/disconnect again
  await shutdown('SIGTERM');
  expect(task1.destroy).toHaveBeenCalledTimes(1);
  expect(task2.destroy).toHaveBeenCalledTimes(1);
  expect(prismaClient.$disconnect).toHaveBeenCalledTimes(1);
});

test('enableJobs false never calls startScheduler', async () => {
  const start = jest.fn(() => []);
  const prismaClient = fakePrisma();
  await boot({ startScheduler: start, prismaClient, logger: quiet, migrationsDir: migrationsDir(), enableJobs: false });
  expect(start).not.toHaveBeenCalled();
});
