// Tiny observability primitives: structured JSON logger + in-memory metrics.
// Designed to be dependency-free so core/ can ship them without bloating
// the bundle, and to be tree-shakeable.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogEntry {
  level: LogLevel;
  msg: string;
  ts: string;
  [k: string]: unknown;
}

export type LogSink = (entry: LogEntry) => void;

export interface Logger {
  level: LogLevel;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(ctx: Record<string, unknown>): Logger;
  with(ctx: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  sink: LogSink;
  level?: LogLevel;
  base?: Record<string, unknown>;
  now?: () => string;
}

export function createLogger(opts: LoggerOptions): Logger {
  const level = opts.level ?? 'info';
  const base = opts.base ?? {};
  const now = opts.now ?? (() => new Date().toISOString());

  function emit(entryLevel: LogLevel, msg: string, ctx: Record<string, unknown> | undefined, parent: Record<string, unknown>): void {
    if (LEVEL_RANK[entryLevel] < LEVEL_RANK[level]) return;
    opts.sink({ level: entryLevel, msg, ts: now(), ...parent, ...(ctx ?? {}) });
  }

  function makeLogger(parent: Record<string, unknown>): Logger {
    return {
      level,
      debug: (m, c) => emit('debug', m, c, parent),
      info: (m, c) => emit('info', m, c, parent),
      warn: (m, c) => emit('warn', m, c, parent),
      error: (m, c) => emit('error', m, c, parent),
      child(c) { return makeLogger({ ...parent, ...c }); },
      with(c) { return makeLogger({ ...parent, ...c }); },
    };
  }

  return makeLogger(base);
}

// ---------------------------------------------------------------- metrics

export interface CounterSnapshot {
  count: number;
}

export interface HistogramSnapshot {
  count: number;
  sum: number;
  p50: number;
  /** Recorded sorted samples (capped) for percentile-based math. */
  samples: number[];
}

export interface MetricSnapshot {
  counters: Record<string, CounterSnapshot>;
  histograms: Record<string, HistogramSnapshot>;
}

export interface CounterHandle {
  inc(n?: number): void;
  reset(): void;
}

export interface HistogramHandle {
  observe(v: number): void;
  reset(): void;
}

export interface MetricRegistry {
  counter(name: string): CounterHandle;
  histogram(name: string): HistogramHandle;
  snapshot(): MetricSnapshot;
  reset(): void;
}

const HISTOGRAM_MAX_SAMPLES = 1024;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx]!;
}

export class InMemoryMetrics implements MetricRegistry {
  private readonly counters = new Map<string, { count: number }>();
  private readonly histograms = new Map<string, { samples: number[]; sum: number }>();

  counter(name: string): CounterHandle {
    let entry = this.counters.get(name);
    if (!entry) { entry = { count: 0 }; this.counters.set(name, entry); }
    return {
      inc: (n = 1) => { entry!.count += n; },
      reset: () => { entry!.count = 0; },
    };
  }

  histogram(name: string): HistogramHandle {
    let entry = this.histograms.get(name);
    if (!entry) { entry = { samples: [], sum: 0 }; this.histograms.set(name, entry); }
    return {
      observe: (v) => {
        entry!.sum += v;
        if (entry!.samples.length < HISTOGRAM_MAX_SAMPLES) entry!.samples.push(v);
      },
      reset: () => { entry!.samples = []; entry!.sum = 0; },
    };
  }

  snapshot(): MetricSnapshot {
    const counters: Record<string, CounterSnapshot> = {};
    for (const [k, v] of this.counters) counters[k] = { count: v.count };
    const histograms: Record<string, HistogramSnapshot> = {};
    for (const [k, v] of this.histograms) {
      const sorted = [...v.samples].sort((a, b) => a - b);
      histograms[k] = { count: sorted.length, sum: v.sum, p50: percentile(sorted, 0.5), samples: sorted };
    }
    return { counters, histograms };
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
  }
}
