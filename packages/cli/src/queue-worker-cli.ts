#!/usr/bin/env node
import { createApp } from './app.js';
import { PublishWorker } from './queue-worker.js';

async function main(): Promise<void> {
  const app = createApp();
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;
  const worker = new PublishWorker(app.queue, app.registry);
  const r = await worker.runOnce({
    ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
  });
  console.log(`[ok] scanned=${r.scanned} processed=${r.processed} posted=${r.posted} retry=${r.retryScheduled} dead=${r.deadLettered}`);
}

main().catch((e: Error) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});
