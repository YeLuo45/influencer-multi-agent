import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWebConsoleSnapshot, reduceBulkContentAction } from '../src/web-console.js';
import { createContent } from '../src/types.js';

void test('buildWebConsoleSnapshot exposes stats tab and queue actions', () => {
  const snapshot = buildWebConsoleSnapshot({
    stats: { totalContents: 2, totalQueue: 1, queueByStatus: { pending: 1 } },
    queue: [{ id: 'q1', status: 'pending', platform: 'x' }],
  });

  assert.equal(snapshot.tabs.includes('stats'), true);
  assert.equal(snapshot.tabs.includes('queue'), true);
  assert.deepEqual(snapshot.actions, ['run-topic', 'queue-work', 'pause', 'resume', 'retry', 'cancel']);
  assert.equal(snapshot.badges.queue, 1);
});

void test('reduceBulkContentAction pauses and resumes matching contents without touching others', () => {
  const one = createContent({ id: 'c1', topic: 'one' });
  const two = createContent({ id: 'c2', topic: 'two' });
  one.stage = 'review';
  two.stage = 'done';

  const paused = reduceBulkContentAction([one, two], { kind: 'pause', where: { stage: 'review' }, now: '2026-06-23T00:00:00.000Z' });
  assert.equal(paused.changed, 1);
  assert.equal(paused.contents[0]!.stage, 'needs_revision');
  assert.match(paused.audit[0]!.note, /pause/i);
  assert.equal(paused.contents[1]!.stage, 'done');

  const resumed = reduceBulkContentAction(paused.contents, { kind: 'resume', where: { ids: ['c1'] }, now: '2026-06-23T00:01:00.000Z' });
  assert.equal(resumed.contents[0]!.stage, 'review');
  assert.match(resumed.audit[0]!.note, /resume/i);
});
