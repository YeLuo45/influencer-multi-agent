import { test } from 'node:test';
import assert from 'node:assert/strict';
import { err, needInput, ok, makeHistoryEntry, sourceToString } from '../src/protocol.js';
import type { HistoryEntry, Source } from '../src/types.js';

void test('protocol: ok() builds a kind=ok result with data', () => {
  const r = ok({ foo: 1 });
  assert.equal(r.kind, 'ok');
  assert.deepEqual(r.data, { foo: 1 });
});

void test('protocol: err() defaults recoverable=true and surfaces the message', () => {
  const r = err('boom');
  assert.equal(r.kind, 'error');
  if (r.kind === 'error') {
    assert.equal(r.message, 'boom');
    assert.equal(r.recoverable, true);
  }
  const r2 = err('fatal', false);
  if (r2.kind === 'error') {
    assert.equal(r2.recoverable, false);
  }
});

void test('protocol: needInput() carries the question and optional options', () => {
  const r = needInput('Which voice?', ['a', 'b']);
  assert.equal(r.kind, 'needs-input');
  if (r.kind === 'needs-input') {
    assert.equal(r.question, 'Which voice?');
    assert.deepEqual(r.options, ['a', 'b']);
  }
  const r2 = needInput('plain');
  if (r2.kind === 'needs-input') {
    assert.equal(r2.options, undefined);
  }
});

void test('protocol: makeHistoryEntry() captures from/to/agent/note/at', () => {
  const h: HistoryEntry = makeHistoryEntry('intake', 'research', 'pipeline', 'auto transition', '2026-06-21T00:00:00.000Z');
  assert.equal(h.from, 'intake');
  assert.equal(h.to, 'research');
  assert.equal(h.agent, 'pipeline');
  assert.equal(h.note, 'auto transition');
  assert.equal(h.at, '2026-06-21T00:00:00.000Z');
});

void test('protocol: sourceToString() joins title + snippet + url with newlines', () => {
  const s: Source = { url: 'https://example.com/x', title: 'T', snippet: 'S', fetchedAt: '2026-06-21T00:00:00.000Z', signals: [] };
  assert.equal(sourceToString(s), 'T\nS\nhttps://example.com/x');
});
