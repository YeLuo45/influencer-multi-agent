import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPersona, PersonaRegistry, applyPersonaToPrompt } from '../src/persona.js';

test('createPersona: defaults', () => {
  const p = createPersona({ id: 'p1', name: 'Tech Bro' });
  assert.equal(p.id, 'p1');
  assert.equal(p.name, 'Tech Bro');
  assert.equal(p.tone, 'professional');
  assert.deepEqual(p.signaturePhrases, []);
  assert.deepEqual(p.bannedWords, []);
});

test('createPersona: with all fields', () => {
  const p = createPersona({
    id: 'p2',
    name: 'Foodie',
    tone: 'casual',
    targetAudience: 'home cooks',
    signaturePhrases: ['try this', 'taste the difference'],
    bannedWords: ['boring'],
    defaultPlatforms: ['xiaohongshu'],
    examples: ['Tested 3 ramen shops'],
  });
  assert.equal(p.tone, 'casual');
  assert.equal(p.targetAudience, 'home cooks');
  assert.equal(p.signaturePhrases.length, 2);
  assert.equal(p.bannedWords[0], 'boring');
  assert.equal(p.defaultPlatforms[0], 'xiaohongshu');
});

test('PersonaRegistry: upsert + get + list', () => {
  const r = new PersonaRegistry();
  r.upsert(createPersona({ id: 'p1', name: 'A' }));
  assert.equal(r.count(), 1);
  assert.equal(r.get('p1')?.name, 'A');
  r.upsert(createPersona({ id: 'p2', name: 'B' }));
  assert.equal(r.count(), 2);
  const list = r.list();
  assert.equal(list.length, 2);
  assert.equal(list[0]!.id, 'p1');
});

test('PersonaRegistry: get returns null for unknown', () => {
  const r = new PersonaRegistry();
  assert.equal(r.get('nope'), null);
});

test('PersonaRegistry: remove', () => {
  const r = new PersonaRegistry();
  r.upsert(createPersona({ id: 'p1', name: 'A' }));
  assert.equal(r.remove('p1'), true);
  assert.equal(r.remove('p1'), false);
  assert.equal(r.count(), 0);
});

test('PersonaRegistry: has', () => {
  const r = new PersonaRegistry();
  r.upsert(createPersona({ id: 'p1', name: 'A' }));
  assert.equal(r.has('p1'), true);
  assert.equal(r.has('nope'), false);
});

test('PersonaRegistry: upsert updates existing', () => {
  const r = new PersonaRegistry();
  r.upsert(createPersona({ id: 'p1', name: 'A' }));
  r.upsert({ ...createPersona({ id: 'p1', name: 'A2' }) });
  assert.equal(r.count(), 1);
  assert.equal(r.get('p1')?.name, 'A2');
});

test('applyPersonaToPrompt: includes all sections', () => {
  const p = createPersona({
    id: 'p1',
    name: 'Tech Bro',
    tone: 'bold',
    targetAudience: 'devs',
    signaturePhrases: ['ship it'],
    bannedWords: ['maybe'],
    examples: ['Built X in 3 days'],
  });
  const out = applyPersonaToPrompt(p, 'base prompt');
  assert.match(out, /base prompt/);
  assert.match(out, /Voice\/Tone: bold/);
  assert.match(out, /Target audience: devs/);
  assert.match(out, /Signature phrases/);
  assert.match(out, /Banned words/);
  assert.match(out, /Reference examples/);
  assert.match(out, /Built X in 3 days/);
});

test('applyPersonaToPrompt: empty persona omits sections', () => {
  const p = createPersona({ id: 'p', name: 'Empty' });
  const out = applyPersonaToPrompt(p, 'base');
  assert.match(out, /Voice\/Tone: professional/);
  assert.doesNotMatch(out, /Signature phrases/);
  assert.doesNotMatch(out, /Banned words/);
});