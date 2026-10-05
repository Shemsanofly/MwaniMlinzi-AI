import cron from 'node-cron';
import { JOBS, runJob } from './jobs.js';

/** Registers node-cron schedules (disabled when ENABLE_JOBS=false or in tests). */
export function startScheduler() {
  const tasks = Object.entries(JOBS).map(([name, job]) => cron.schedule(job.schedule, () => {
    runJob(name, 'CRON').catch((err) => console.error(`[jobs] ${name} failed:`, err.message));
  }, { timezone: 'Africa/Dar_es_Salaam' }));
  console.log(`[jobs] scheduled ${tasks.length} jobs: ${Object.keys(JOBS).join(', ')}`);
  return tasks;
}
