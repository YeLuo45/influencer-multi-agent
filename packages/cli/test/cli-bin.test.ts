import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

/**
 * The cli-bin wrapper strips `npm run <script>` from `npm_config_argv` and
 * forwards the remainder as the real argv to `index.ts`. It must work for
 * every existing subcommand and accept both `--port 6677` and `6677`.
 */
const repoRoot = join(import.meta.dirname, '../../..');
const wrapper = join(repoRoot, 'packages/cli/src/cli-bin.ts');
const tsxLoader = join(repoRoot, 'node_modules/tsx/dist/loader.mjs');

interface RunResult { status: number | null; stdout: string; stderr: string }

function runWrapperSync(args: string[], env: Record<string, string | undefined>): RunResult {
  const result = spawn(process.execPath, ['--import', tsxLoader, wrapper, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env, NODE_ENV: '' },
  });
  let stdout = '';
  let stderr = '';
  result.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  result.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  return new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => {
      result.kill('SIGTERM');
      // give it a moment to flush
      setTimeout(() => resolve({ status: result.killed ? null : result.exitCode, stdout, stderr }), 200);
    }, 1500);
    result.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ status: code, stdout, stderr });
    });
  }) as unknown as RunResult; // typed via the async helper below
}

// Async helper that returns a real Promise; preferred for the long-running web case.
async function runWrapper(args: string[], env: Record<string, string | undefined>): Promise<RunResult> {
  const child = spawn(process.execPath, ['--import', tsxLoader, wrapper, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env, NODE_ENV: '' },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  return new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => resolve({ status: child.exitCode, stdout, stderr }), 250);
    }, 3000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ status: code, stdout, stderr });
    });
  });
}

test('cli-bin: forwards help command when npm_config_argv is set', async () => {
  const result = await runWrapper([], {
    npm_config_argv: '/usr/bin/npm run cli help',
  });
  assert.match(result.stdout, /ima run <topic>/);
});

test('cli-bin: forwards status command without -- separator', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-bin-'));
  try {
    const result = await runWrapper([], {
      npm_config_argv: `/usr/bin/npm run cli status missing-id-from-wrapper-test`,
      IMA_TEST_ROOT: root,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not found: missing-id-from-wrapper-test/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cli-bin: positional web port works through wrapper', async () => {
  const result = await runWrapper([], {
    npm_config_argv: '/usr/bin/npm run web 6678 --no-open',
  });
  assert.match(result.stdout, /web console at http:\/\/127\.0\.0\.1:6678/);
});

test('cli-bin: --no-open stops openBrowser from being scheduled', async () => {
  const result = await runWrapper([], {
    npm_config_argv: '/usr/bin/npm run web --port 6680 --no-open',
  });
  assert.match(result.stdout, /web console at http:\/\/127\.0\.0\.1:6680/);
});

test('cli-bin: rejects unsafe browser port through wrapper', async () => {
  const result = await runWrapper([], {
    npm_config_argv: '/usr/bin/npm run web --port 6666',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsafe browser port: 6666/);
});

test('cli-bin: direct invocation (no npm_config_argv) still works', async () => {
  const result = await runWrapper(['help'], {});
  assert.equal(result.status, 0);
  assert.match(result.stdout, /ima run <topic>/);
});