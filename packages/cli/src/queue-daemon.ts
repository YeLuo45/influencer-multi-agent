#!/usr/bin/env node
import { createApp } from './app.js';
import { createQueueWorkerLoop } from './queue-worker-loop.js';

async function main(): Promise<void> {
  const app = createApp();
  const idx = process.argv.indexOf('--interval');
  const intervalMs = idx >= 0 ? Number(process.argv[idx + 1]) : 1000;
  const loop = createQueueWorkerLoop({ app, intervalMs, idleSleepMs: 5000 });
  loop.start();
  const stop = (): void => {
    loop.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`[queue:daemon] started, interval=${intervalMs}ms (SIGINT/SIGTERM to stop)`);
  // Keep the process alive
  await new Promise<void>(() => {});
}

main().catch((e: Error) => {
  console.error(`[queue:daemon] ${e.message}`);
  process.exit(1);
});
