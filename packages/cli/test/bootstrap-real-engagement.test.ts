import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonStore, createContent, type Content } from '../src/index.js';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootstrapDemo } from '../src/bootstrap-demo.js';
import type { Llm } from '../src/llm.js';
import { createApp } from '../src/app.js';

void test('bootstrap-real: engagementSource="real-fetch" pulls through LLM ping and writes feedback', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-bsreal-'));
  const oldCwd = process.cwd();
  try {
    process.chdir(root);
    // The "real fetch" engagement source asks the LLM once with a deterministic
    // prompt and derives a metric count from the response; we stub a fetchImpl
    // to make the LLM call deterministic and to verify the bootstrap path.
    const realLlm: Llm = {
      provider: 'mock',
      model: 'mock-llm-v1',
      async complete() {
        return '{"count": 7}';
      },
    };
    const app = createApp();
    const r = await runBootstrapDemo({ app, now: () => '2026-06-21T00:00:00.000Z', llm: realLlm, writeBackToFeedback: true, engagementSource: 'real-fetch' });
    assert.equal(r.feedbackAppended >= 1, true);
    // feedback.json should be written
    const fbPath = join(root, '.ima/feedback.json');
    assert.ok(existsSync(fbPath));
    const fb = JSON.parse(readFileSync(fbPath, 'utf-8'));
    assert.equal(fb.totalRecords >= 1, true);
  } finally {
    process.chdir(oldCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
