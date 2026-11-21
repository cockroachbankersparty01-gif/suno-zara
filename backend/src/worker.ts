// Standalone worker process (e.g. on the GPU machine). For a single free server, use all.ts instead.
import { startWorker, stopWorker } from './jobs.js';
import { ensureSetup } from './setup.js';

process.on('SIGTERM', stopWorker);
process.on('SIGINT', stopWorker);

await ensureSetup();
await startWorker();
process.exit(0);
