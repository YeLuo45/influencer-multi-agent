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

test('state-machine: done is terminal', () => {
  assert.equal(isTerminal('done'), true);
  assert.deepEqual(TRANSITIONS.done, []);
});

test('state-machine: valid transitions', () => {
  assert.equal(canTransition('intake', 'research'), true);
  assert.equal(canTransition('review', 'publish'), true);
  assert.equal(canTransition('review', 'needs_revision'), true);
  assert.equal(canTransition('needs_revision', 'draft'), true);
  assert.equal(canTransition('publish', 'done'), true);
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

test('state-machine: needs_revision can only go to draft', () => {
  assert.deepEqual([...TRANSITIONS.needs_revision], ['draft']);
  assert.throws(() => assertTransition('needs_revision', 'review'), InvalidTransition);
});

test('state-machine: review has two outgoing edges', () => {
  assert.deepEqual([...TRANSITIONS.review].sort(), ['needs_revision', 'publish']);
});