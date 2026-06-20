import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockLlm } from '../src/llm.js';

test('MockLlm: returns title containing topic marker for title prompts', async () => {
  const llm = new MockLlm();
  const r = await llm.complete('topic: AI Agent 趋势\nGenerate a Chinese title.');
  assert.match(r, /大 V 视角/);
  assert.match(r, /AI Agent 趋势/);
});

test('MockLlm: returns body for body prompts', async () => {
  const llm = new MockLlm();
  const r = await llm.complete('topic: X\nWrite body.');
  assert.match(r, /我观察到/);
  assert.match(r, /三个信号/);
});

test('MockLlm: returns ideas JSON for ideas prompts', async () => {
  const llm = new MockLlm();
  const r = await llm.complete('topic: 美食\nReturn JSON array of ideas');
  const parsed = JSON.parse(r);
  assert.ok(Array.isArray(parsed));
  assert.ok(parsed.length >= 1);
});

test('MockLlm: returns signals for signal prompts', async () => {
  const llm = new MockLlm();
  const r = await llm.complete('topic: AI\nExtract 3 signals.');
  assert.ok(r.length > 0);
});