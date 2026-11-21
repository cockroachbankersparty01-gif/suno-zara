// API + worker in ONE process — for free hosting plans that allow a single service (e.g. Render free).
// When a separate GPU worker is running (Kaggle / your PC), set RUN_WORKER=false here.
import { createApp } from './app.js';
import { config } from './config.js';
import { startWorker, stopWorker } from './jobs.js';
import { ensureSetup } from './setup.js';

await ensureSetup();
createApp().listen(config.port, () => {
  console.log(`🎶 Suno Zara API + worker on :${config.port} (auth=${config.authMode}, storage=${config.storageDriver}, music=${config.musicProvider})`);
});

if (process.env.RUN_WORKER !== 'false') {
  process.on('SIGTERM', () => { stopWorker(); setTimeout(() => process.exit(0), 10_000).unref(); });
  void startWorker();
}
