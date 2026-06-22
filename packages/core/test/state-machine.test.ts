import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSITIONS,
  canTransition,
  assertTransition,
  isTerminal,
  InvalidTransition,
} from '../src/state-machine.js';
import { CONTENT_STAGES } from '../src/types.js';

test('state-machine: every stage in CONTENT_STAGES', () => {
  for (const s of CONTENT_STAGES) assert.ok(TRANSITIONS[s], `missing transition for ${s}`);
});

test('state-machine: done is terminal (lifecycle)', () => {
  assert.equal(isTerminal('done'), true);
  // done can still go to paused (v1.0) but that does not change the
  // lifecycle terminal contract.
  assert.ok(TRANSITIONS.done.includes('paused'));
  // All non-paused outgoing edges from `done` should be empty.
  const lifecycleEdges = [...TRANSITIONS.done].filter((t) => t !== 'paused');
  assert.deepEqual(lifecycleEdges, []);
});

test('state-machine: valid transitions', () => {
  assert.equal(canTransition('intake', 'research'), true);
  assert.equal(canTransition('review', 'publish'), true);
  assert.equal(canTransition('review', 'needs_revision'), true);
  assert.equal(canTransition('needs_revision', 'draft'), true);
  assert.equal(canTransition('publish', 'done'), true);
  // v1.0: paused super-stage
  assert.equal(canTransition('intake', 'paused'), true);
  assert.equal(canTransition('paused', 'draft'), true);
});

test('state-machine: invalid transitions rejected', () => {
  assert.equal(canTransition('intake', 'draft'), false);
  assert.equal(canTransition('done', 'intake'), false);
  assert.equal(canTransition('publish', 'intake'), false);
  assert.throws(() => assertTransition('done', 'intake'), InvalidTransition);
  assert.throws(() => assertTransition('intake', 'done'), InvalidTransition);
});

test('state-machine: skip-level rejected', () => {
  assert.throws(() => assertTransition('research', 'draft'), InvalidTransition);
  assert.throws(() => assertTransition('ideas', 'review'), InvalidTransition);
});

test('state-machine: needs_revision lifecycle edges (excluding paused super-stage)', () => {
  const lifecycle = [...TRANSITIONS.needs_revision].filter((t) => t !== 'paused');
  assert.deepEqual(lifecycle, ['draft']);
  assert.throws(() => assertTransition('needs_revision', 'review'), InvalidTransition);
});

test('state-machine: review lifecycle edges (excluding paused super-stage)', () => {
  const lifecycle = [...TRANSITIONS.review].filter((t) => t !== 'paused');
  assert.deepEqual(lifecycle.sort(), ['needs_revision', 'publish']);
});