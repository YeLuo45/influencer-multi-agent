import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MetricLabels {
  [key: string]: string | number | boolean;
}

export interface PersistentMetricSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, { count: number; sum: number; min: number; max: number }>;
}

export interface PersistentMetrics {
  increment(name: string, value?: number, labels?: MetricLabels): void;
  observe(name: string, value: number, labels?: MetricLabels): void;
  snapshot(): PersistentMetricSnapshot;
}

type MetricEvent =
  | { at: string; type: 'counter'; name: string; value: number; labels: MetricLabels }
  | { at: string; type: 'histogram'; name: string; value: number; labels: MetricLabels };

export function createPersistentMetrics(opts: { rootDir: string; now?: () => string }): PersistentMetrics {
  const now = opts.now ?? (() => new Date().toISOString());
  const dir = join(opts.rootDir, '.ima');
  const file = join(dir, 'metrics.jsonl');
  mkdirSync(dir, { recursive: true });
  return {
    increment(name, value = 1, labels = {}) {
      appendEvent(file, { at: now(), type: 'counter', name, value, labels });
    },
    observe(name, value, labels = {}) {
      appendEvent(file, { at: now(), type: 'histogram', name, value, labels });
    },
    snapshot() {
      return readSnapshot(file);
    },
  };
}

export function renderPrometheusMetrics(snapshot: PersistentMetricSnapshot): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(snapshot.counters)) {
    lines.push(`${key} ${value}`);
  }
  for (const [key, value] of Object.entries(snapshot.histograms)) {
    const parsed = splitMetricKey(key);
    lines.push(`${parsed.name}_count${parsed.labels} ${value.count}`);
    lines.push(`${parsed.name}_sum${parsed.labels} ${value.sum}`);
    lines.push(`${parsed.name}_min${parsed.labels} ${value.min}`);
    lines.push(`${parsed.name}_max${parsed.labels} ${value.max}`);
  }
  return `${lines.join('\n')}\n`;
}

function appendEvent(file: string, event: MetricEvent): void {
  const previous = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  writeFileSync(file, `${previous}${JSON.stringify(event)}\n`, 'utf-8');
}

function readSnapshot(file: string): PersistentMetricSnapshot {
  const snapshot: PersistentMetricSnapshot = { counters: {}, histograms: {} };
  if (!existsSync(file)) return snapshot;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    const event = JSON.parse(line) as MetricEvent;
    const key = metricKey(event.name, event.labels);
    if (event.type === 'counter') {
      snapshot.counters[key] = (snapshot.counters[key] ?? 0) + event.value;
    } else {
      const current = snapshot.histograms[key] ?? { count: 0, sum: 0, min: event.value, max: event.value };
      current.count += 1;
      current.sum += event.value;
      current.min = Math.min(current.min, event.value);
      current.max = Math.max(current.max, event.value);
      snapshot.histograms[key] = current;
    }
  }
  return snapshot;
}

function metricKey(name: string, labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return name;
  return `${name}{${entries.map(([key, value]) => `${key}="${String(value)}"`).join(',')}}`;
}

function splitMetricKey(key: string): { name: string; labels: string } {
  const idx = key.indexOf('{');
  if (idx < 0) return { name: key, labels: '' };
  return { name: key.slice(0, idx), labels: key.slice(idx) };
}
