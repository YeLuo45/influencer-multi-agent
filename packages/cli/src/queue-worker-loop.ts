import { PublishWorker, type WorkerRunResult } from './queue-worker.js';
import type { AppContext } from './app.js';

export interface QueueWorkerLoopOptions {
  app: AppContext;
  /** Active-scan interval (ms) when there are due items. Default 1000. */
  intervalMs?: number;
  /** Sleep between empty scans (ms). Default 5000. */
  idleSleepMs?: number;
  /** Limit per runOnce. Default unlimited. */
  limit?: number;
}

export interface QueueWorkerLoopHandle {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  /** Force one synchronous tick and return the result. */
  runOnceAndWait(): Promise<WorkerRunResult>;
  /** Current cycle counter (increments per tick). */
  cycles(): number;
}

export function createQueueWorkerLoop(opts: QueueWorkerLoopOptions): QueueWorkerLoopHandle {
  const intervalMs = opts.intervalMs ?? 1000;
  const idleSleepMs = opts.idleSleepMs ?? 5000;
  const worker = new PublishWorker(opts.app.queue, opts.app.registry);
  let running = false;
  let cycles = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async (): Promise<WorkerRunResult> => {
    cycles += 1;
    return worker.runOnce({
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    });
  };

  const scheduleNext = (last: WorkerRunResult): void => {
    if (!running) return;
    const sleep = last.processed === 0 ? idleSleepMs : intervalMs;
    timer = setTimeout(() => {
      if (!running) return;
      (async () => {
        try {
          const r = await tick();
          scheduleNext(r);
        } catch {
          // swallow; daemon must not die on a single bad cycle
        }
      })();
    }, sleep);
  };

  return {
    start() {
      if (running) return;
      running = true;
      (async () => {
        try {
          const r = await tick();
          scheduleNext(r);
        } catch {
          // ignore
        }
      })();
    },
    stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    isRunning() {
      return running;
    },
    async runOnceAndWait() {
      const r = await tick();
      return r;
    },
    cycles() {
      return cycles;
    },
  };
}
