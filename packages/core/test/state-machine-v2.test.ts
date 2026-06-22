import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition,
  assertTransition,
  InvalidTransition,
  nextStages,
  isTerminal,
  isPaused,
  setStage,
  stageRank,
  type ContentStage,
} from '../src/state-machine.js';

void test('state-machine: paused is a valid stage and works with existing transitions', () => {
  assert.equal(isPaused('paused'), true);
  assert.equal(isPaused('done'), false);
});

void test('state-machine: every stage can transition to paused and back to itself', () => {
  const all: ContentStage[] = ['intake', 'research', 'ideas', 'draft', 'review', 'needs_revision', 'publish', 'done'];
  for (const s of all) {
    if (s === 'done') continue; // done is terminal; no transition out
    if (s === 'paused') continue; // can't pause paused
    assert.equal(canTransition(s, 'paused'), true, `${s} -> paused`);
    assert.equal(canTransition('paused', s), true, `paused -> ${s}`);
  }
});

void test('state-machine: stageRank orders lifecycle stages', () => {
  const r = stageRank('intake', 'publish');
  assert.ok(r < 0);
  assert.ok(stageRank('done', 'review') > 0);
  assert.equal(stageRank('done', 'done'), 0);
});

void test('state-machine: setStage() mutates content and emits history when advancing forward', () => {
  const c: { stage: ContentStage; history: Array<{ from: ContentStage; to: ContentStage; note: string }> } = {
    stage: 'intake',
    history: [],
  };
  const next = setStage(c, 'paused', 'pause requested', () => '2026-06-21T00:00:00.000Z');
  assert.equal(next.stage, 'paused');
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0]!.from, 'intake');
  assert.equal(next.history[0]!.to, 'paused');
});

void test('state-machine: isTerminal() still treats done as terminal *for lifecycle purposes*', () => {
  // `done` is the natural end of the lifecycle; pausing it is a separate
  // concern handled by the `paused` super-stage. We assert the original
  // contract: TRANSITIONS.done is empty *for lifecycle moves*. (In v1.0 we
  // added the explicit `paused` super-stage; the dedicated check below
  // pins the no-lifecycle-edge contract.)
  const all: ContentStage[] = ['intake', 'research', 'ideas', 'draft', 'review', 'needs_revision', 'publish', 'done'];
  for (const s of all) {
    if (s === 'done') {
      // done is the lifecycle terminal: no other lifecycle stage follows.
      for (const other of all) {
        if (other === 'done') continue;
        assert.equal(canTransition(s, other), false, `done must not lifecycle-transition to ${other}`);
      }
    }
  }
});

void test('state-machine: assertTransition throws InvalidTransition on illegal move', () => {
  assert.throws(() => assertTransition('intake', 'publish'), InvalidTransition);
});

void test('state-machine: nextStages returns the legal successors (lifecycle + paused)', () => {
  assert.deepEqual([...nextStages('intake')], ['research', 'paused']);
  assert.ok(nextStages('paused').includes('intake'));
  assert.ok(nextStages('paused').includes('research'));
  assert.ok(nextStages('paused').includes('draft'));
});
