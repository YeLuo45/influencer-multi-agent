import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, InMemoryMetrics, type LogEntry } from '../src/observability.js';

void test('observability: createLogger() writes JSON lines to the provided sink', () => {
  const entries: LogEntry[] = [];
  const logger = createLogger({ sink: (e) => entries.push(e), level: 'info' });
  logger.info('hello', { foo: 1 });
  logger.warn('careful', { x: 'y' });
  logger.error('boom', { code: 7 });
  logger.debug('hidden');
  assert.equal(entries.length, 3);
  assert.equal(entries[0]!.level, 'info');
  assert.equal(entries[0]!.msg, 'hello');
  assert.equal(entries[0]!.foo, 1);
  assert.equal(entries[1]!.level, 'warn');
  assert.equal(entries[2]!.level, 'error');
  assert.equal(entries[2]!.code, 7);
});

void test('observability: child logger inherits level and parent context', () => {
  const entries: LogEntry[] = [];
  const root = createLogger({ sink: (e) => entries.push(e), level: 'debug' });
  const child = root.child({ component: 'pipeline' });
  child.info('running');
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.component, 'pipeline');
  assert.match(entries[0]!.msg, /running/);
});

void test('observability: counter() increments and snapshot reflects the value', () => {
  const m = new InMemoryMetrics();
  m.counter('pipeline.run.ok').inc();
  m.counter('pipeline.run.ok').inc(3);
  const snap = m.snapshot();
  assert.equal(snap.counters['pipeline.run.ok']?.count, 4);
});

void test('observability: histogram() observes values and exposes count/sum/p50', () => {
  const m = new InMemoryMetrics();
  const h = m.histogram('llm.latency_ms');
  h.observe(10);
  h.observe(20);
  h.observe(30);
  const snap = m.snapshot();
  assert.equal(snap.histograms['llm.latency_ms']?.count, 3);
  assert.equal(snap.histograms['llm.latency_ms']?.sum, 60);
  assert.equal(snap.histograms['llm.latency_ms']?.p50, 20);
});
