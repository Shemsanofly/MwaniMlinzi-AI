/** Node-only startup: boots the app and registers graceful-shutdown handlers. */
import { boot } from './src/server/boot.js';

const state = await boot();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => { await state.shutdown(signal); process.exit(0); });
}
