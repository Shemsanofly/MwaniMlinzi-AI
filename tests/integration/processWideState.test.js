import prisma from '../../src/server/config/prisma.js';
import { events } from '../../src/server/db/records.js';

// instrumentation-node.js (the cron scheduler) and the route handlers (admin "Run now") are separate
// module graphs in Next, so each gets its own copy of jobs.js. The "already running" lock must still be
// one per process, as it was under Express.
const JOB = 'test-shared-lock';

afterAll(async () => {
  await events(prisma, 'JOB').deleteMany({ where: { jobName: JOB } });
  await prisma.$disconnect();
});

// A query string gives a separate module instance (separate top-level state), like a second module graph.
const freshJobsModule = (instance) => import(`../../src/server/jobs/jobs.js?instance=${instance}`);
// A second call that is not skipped would block on the gate; report that instead of hanging the test.
const settle = (promise) => Promise.race([promise, new Promise((r) => setTimeout(() => r('ran concurrently'), 1000))]);

test('two separately loaded jobs.js instances share one running-job lock', async () => {
  const a = await freshJobsModule('scheduler');
  const b = await freshJobsModule('route-handler');
  expect(a).not.toBe(b);
  expect(a.runJob).not.toBe(b.runJob);

  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const job = { schedule: '0 0 * * *', description: 'test', async run() { calls += 1; await gate; return { ok: true }; } };
  a.JOBS[JOB] = job;
  b.JOBS[JOB] = job;
  try {
    const first = a.runJob(JOB, 'SCHEDULED');
    // Let the first call take the lock (it awaits the JOB row insert before running).
    await new Promise((r) => setTimeout(r, 50));
    await expect(settle(b.runJob(JOB, 'MANUAL'))).resolves.toEqual({ skipped: true, reason: 'Job is already running' });
    await expect(settle(a.runJob(JOB, 'MANUAL'))).resolves.toEqual({ skipped: true, reason: 'Job is already running' });
    release();
    const row = await first;
    expect(row.status).toBe('SUCCESS');
    expect(calls).toBe(1);
    expect(await events(prisma, 'JOB').count({ where: { jobName: JOB } })).toBe(1);
  } finally {
    release();
    delete a.JOBS[JOB];
    delete b.JOBS[JOB];
  }
});

test('settings cache invalidation reaches every module instance', async () => {
  const key = 'alerts.dedupHours';
  const a = await import('../../src/server/services/settingsService.js?instance=scheduler');
  const b = await import('../../src/server/services/settingsService.js?instance=route-handler');
  expect(a.clearSettingsCache).not.toBe(b.clearSettingsCache);
  const original = await prisma.systemSetting.findUnique({ where: { key } });
  try {
    a.clearSettingsCache();
    const before = await a.getSetting(key);
    await b.setSetting(key, Number(before) + 7, null); // route handler writes + clears its cache
    expect(await a.getSetting(key)).toBe(Number(before) + 7); // scheduler instance sees it at once
  } finally {
    if (original) await prisma.systemSetting.update({ where: { key }, data: { value: original.value } });
    else await prisma.systemSetting.deleteMany({ where: { key } });
    a.clearSettingsCache();
  }
});

test('ML model cache invalidation reaches every module instance', async () => {
  const a = await import('../../src/server/ai/mlRiskProvider.js?instance=scheduler');
  const b = await import('../../src/server/ai/mlRiskProvider.js?instance=route-handler');
  expect(a.MLRiskProvider).not.toBe(b.MLRiskProvider);
  expect(globalThis.__mwaniMlModelCache).toBeDefined();
  await a.MLRiskProvider.status();
  expect(globalThis.__mwaniMlModelCache.activeCache).not.toBeNull();
  b.MLRiskProvider.clearCache();
  expect(globalThis.__mwaniMlModelCache.activeCache).toBeNull();
});
