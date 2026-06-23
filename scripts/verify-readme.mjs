import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const checks = [
  { name: 'build', cmd: 'npm', args: ['run', 'build'] },
  { name: 'check', cmd: 'npm', args: ['run', 'check'] },
  { name: 'targeted sandbox publish test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/core/test/sandbox-publish.test.ts'] },
  { name: 'targeted persistent metrics test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/core/test/persistent-metrics.test.ts'] },
  { name: 'targeted unattended roadmap test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/core/test/roadmap.test.ts'] },
  { name: 'targeted production automation test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/core/test/production-automation.test.ts'] },
  { name: 'targeted web metrics endpoint test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/cli/test/web-server-metrics.test.ts'] },
  { name: 'targeted web events endpoint test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/cli/test/web-server-events.test.ts'] },
  { name: 'targeted web roadmap endpoint test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/cli/test/web-server-roadmap.test.ts'] },
  { name: 'targeted web realtime ui test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/cli/test/web-ui-events.test.ts'] },
  { name: 'targeted web roadmap ui test', cmd: 'node', args: ['--test', '--import', 'tsx', 'packages/cli/test/web-ui-roadmap.test.ts'] },
  { name: 'prepublish gate CLI', cmd: 'npm', args: ['run', 'cli', 'prepublish-gate'] },
  { name: 'production snapshot CLI', cmd: 'npm', args: ['run', 'cli', 'production'] },
  { name: 'release local json CLI', cmd: 'npm', args: ['run', 'cli', 'release-local-json'] },
];

for (const path of [
  'packages/core/test/publish-rate-limit.test.ts',
  'packages/core/test/sandbox-publish.test.ts',
  'packages/core/test/secret-diagnostics.test.ts',
  'packages/core/test/persistent-metrics.test.ts',
  'packages/core/test/roadmap.test.ts',
  'packages/core/test/production-automation.test.ts',
  'packages/cli/test/web-server-metrics.test.ts',
  'packages/cli/test/web-server-events.test.ts',
  'packages/cli/test/web-server-roadmap.test.ts',
  'packages/cli/test/web-ui-events.test.ts',
  'packages/cli/test/web-ui-roadmap.test.ts',
]) {
  if (!existsSync(path)) {
    console.error(`[readme] missing documented test file: ${path}`);
    process.exit(1);
  }
}

for (const check of checks) {
  const cwd = mkdtempSync(join(tmpdir(), 'ima-readme-'));
  try {
    const result = spawnSync(check.cmd, check.args, {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf-8',
      env: { ...process.env, IMA_README_TMP: cwd },
    });
    if (result.status !== 0) {
      console.error(`[readme] ${check.name} failed (${result.status})`);
      console.error(result.stdout);
      console.error(result.stderr);
      process.exit(result.status ?? 1);
    }
    console.log(`[readme] ok ${check.name}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
