import { createApp, saveContent, listContentIds, loadContent, savePersonas, fetchAndAppendEngagement } from './app.js';
import { Pipeline, buildAbReport, runDryRun } from '@ima/core';
import { PublishWorker, summarizeQueue } from './queue-worker.js';
import { startWebServer } from './web-server.js';
import { spawn as defaultSpawn, type SpawnOptions } from 'node:child_process';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

// Local alias for `process.env`. Kept inline so this package compiles without
// the shared `types/env.d.ts` ambient being pulled into its tsconfig.
// The canonical `Env` interface lives at ../../types/env.d.ts.
type Env = Record<string, string | undefined>;

export interface WebOptions {
  port: number;
  host: string;
}

const BROWSER_UNSAFE_PORTS = new Set<number>([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540,
  548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
  3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

function valueAfterFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseWebOptions(argv: string[], env: Env = process.env): WebOptions {
  const argvPort = valueAfterFlag(argv, '--port');
  const positionalPort = argv[1] && !argv[1].startsWith('-') ? argv[1] : undefined;
  const envPort = env.npm_config_port && env.npm_config_port !== 'true' ? env.npm_config_port : undefined;
  const portInput = argvPort ?? positionalPort ?? envPort;
  const port = Number(portInput ?? 5173);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid port: ${portInput ?? ''}`);
  }
  if (BROWSER_UNSAFE_PORTS.has(port)) {
    throw new Error(`unsafe browser port: ${port}. Chromium/Edge blocks this port; use 6677 or 7777 instead.`);
  }

  const host = valueAfterFlag(argv, '--host') ?? env.npm_config_host ?? '127.0.0.1';
  return { port, host };
}

/**
 * Build a plain `string[]` argv list from the parent npm invocation so
 * `npm run <script> …` works without the `--` separator.
 *
 * Resolution rules:
 * - `npm run web --port 6677` → argv = `['web', '--port', '6677']`
 *   (the `web` script is just an alias; runCli still expects 'web' as argv[0]).
 * - `npm run cli status c1` → argv = `['status', 'c1']`
 *   (the `cli` script is a generic dispatcher; userArgs[0] is the subcommand).
 * - `npm run queue:work --limit 1` → argv = `['queue', 'work', '--limit', '1']`
 *   (alias preserved to keep the queue subcommand selector at argv[1]).
 *
 * Returns the script alias (if any) followed by the trailing user args.
 */
const NPM_SCRIPT_TO_CMD: Record<string, string[]> = {
  web: ['web'],
  queue: ['queue'],
  'queue:work': ['queue', 'work'],
  mcp: ['mcp'],
  'mcp:http': ['mcp', 'http'],
  'mcp:stdio': ['mcp', 'stdio'],
};

export function readNpmPassthroughArgs(env: Env = process.env): string[] {
  const raw = env.npm_config_argv;
  if (raw) {
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length < 3) return [];
    const scriptName = parts[2]!;
    const userArgs = parts.slice(3);
    const prefix = NPM_SCRIPT_TO_CMD[scriptName];
    const base = prefix ? [...prefix, ...userArgs] : userArgs;
    // npm collapses `--out reports/foo.json` into `npm_config_out=true` plus a
    // positional value. Detect those boolean flags and splice the value back in
    // front of the corresponding positional token so downstream parsers see a
    // canonical `--flag value` pair (boss preference: scripts work without `--`).
    return restoreFlagValues(base, env);
  }
  // Fallback: npm 7+ without `--` may set `npm_config_<flag>=true` and drop
  // the matching flag from process.argv. Rebuild canonical argv from the
  // remaining process.argv tokens so CLI parsers stay deterministic.
  return restoreFlagValues(process.argv.slice(2), env);
}

function restoreFlagValues(args: string[], env: Env): string[] {
  const restored: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      restored.push(arg);
      continue;
    }
    if (env[`npm_config_${arg.slice(2).replace(/-/g, '_')}`] === 'true') {
      restored.push(arg);
      // value follows as the next positional token (if any)
      continue;
    }
    restored.push(arg);
  }
  return restored;
}

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ReturnType<typeof defaultSpawn>;

export interface OpenBrowserOptions {
  /** Override the detected platform (`process.platform`). */
  platform?: string;
  /** Inject a custom spawn (defaults to `node:child_process#spawn`). */
  spawn?: SpawnFn;
}

/**
 * Best-effort: open `url` in the host OS default browser.
 *
 * - macOS:   `open <url>`
 * - Linux:   `xdg-open <url>`
 * - Windows: `cmd /c start "" <url>`
 *
 * The browser is launched detached and unref'd so the CLI is not blocked.
 * Any spawn failure (no DISPLAY, missing command) is swallowed — opening a
 * browser must never break the CLI.
 */
export function openBrowser(url: string, opts: OpenBrowserOptions = {}): void {
  const platform = opts.platform ?? process.platform;
  const spawn = opts.spawn ?? defaultSpawn;
  const detached = { stdio: 'ignore' as const, detached: true };
  try {
    if (platform === 'darwin') {
      spawn('open', [url], detached);
    } else if (platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', url], detached);
    } else {
      spawn('xdg-open', [url], detached);
    }
  } catch {
    // intentional: opening a browser is best-effort; do not fail the CLI
  }
}

/** Public entry point for the CLI. argv is the raw subcommand + flags. */
export async function runCli(argv: string[]): Promise<void> {
  const app = createApp();
  const cmd = argv[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'run') {
    const topic = argv.slice(1).join(' ').trim();
    if (!topic) throw new Error('topic required: ima run <topic>');
    const c = Pipeline.createContent(topic);
    const final = await app.pipeline.run(c);
    await saveContent(app.store, final);
    const xlate = final.draft?.translations?.map((t) => t.locale).join('+') ?? 'none';
    const tags = final.ideas.filter((i) => i.variantTag).map((i) => i.variantTag).join(',') || 'none';
    console.log(`[ok] ${final.id} stage=${final.stage} posts=${final.posts.length} translations=${xlate} variants=${tags}`);
    return;
  }

  if (cmd === 'run-ab') {
    const variantsArg = argv[1];
    const variants = Number(variantsArg);
    if (!Number.isInteger(variants) || variants < 2) {
      throw new Error('usage: ima run-ab <variants-count> <topic>  (variants >= 2)');
    }
    const topic = argv.slice(2).join(' ').trim();
    if (!topic) throw new Error('topic required: ima run-ab <n> <topic>');
    // Build a one-off pipeline with variantCount = N
    const { Pipeline: P } = await import('@ima/core');
    const pipeline = new P(
      {
        llm: app.llm,
        crawler: app.crawler,
        publisher: {
          post: (platform, content) => app.registry.get(platform).post(content),
          healthCheck: (platform) => app.registry.get(platform).healthCheck(),
        },
        queueSink: async (item) => { await app.queue.write(item); },
        now: app.now,
      },
      { ideaCount: Math.max(4, variants * 2), maxRevisionRounds: 2, variantCount: variants, translateTargets: ['en', 'ja'] },
    );
    const c = P.createContent(topic);
    const final = await pipeline.run(c);
    await saveContent(app.store, final);
    const counts: Record<string, number> = {};
    for (const i of final.ideas) {
      const t = i.variantTag ?? '(none)';
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const tagSummary = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`[ok] ${final.id} stage=${final.stage} posts=${final.posts.length} variants=${tagSummary}`);
    return;
  }

  if (cmd === 'run-with-persona') {
    const personaId = argv[1];
    const topic = argv.slice(2).join(' ').trim();
    if (!personaId || !topic) throw new Error('usage: ima run-with-persona <persona-id> <topic>');
    if (!app.personas.has(personaId)) throw new Error(`persona not found: ${personaId}`);
    const c = Pipeline.createContent(topic, personaId);
    const final = await app.pipeline.run(c);
    await saveContent(app.store, final);
    console.log(`[ok] ${final.id} persona=${personaId} stage=${final.stage} posts=${final.posts.length}`);
    return;
  }

  if (cmd === 'list') {
    const ids = await listContentIds(app.store);
    for (const id of ids) {
      const c = await loadContent(app.store, id);
      if (!c) continue;
      console.log(`${c.id}  [${c.stage.padEnd(14)}]  persona=${c.persona.padEnd(15)}  topic="${c.topic}"  posts=${c.posts.length}  eng=${c.engagement.length}`);
    }
    return;
  }

  if (cmd === 'status') {
    const id = argv[1];
    if (!id) throw new Error('id required: ima status <id>');
    const c = await loadContent(app.store, id);
    if (!c) throw new Error(`not found: ${id}`);
    console.log(JSON.stringify(c, null, 2));
    return;
  }

  if (cmd === 'step') {
    const id = argv[1];
    if (!id) throw new Error('id required: ima step <id>');
    const c = await loadContent(app.store, id);
    if (!c) throw new Error(`not found: ${id}`);
    const res = await app.pipeline.step(c);
    await saveContent(app.store, res.content);
    console.log(`[step] ${res.content.id} stage=${res.content.stage} advanced=${res.advanced}`);
    return;
  }

  if (cmd === 'dry-run') {
    const id = argv[1];
    if (!id) throw new Error('id required: ima dry-run <id>');
    const r = await runDryRun({ store: app.store, id, registry: app.registry });
    if (argv.includes('--json')) {
      console.log(JSON.stringify(r, null, 2));
      return;
    }
    if (r.error) {
      console.log(`[dry-run] ${id} error: ${r.error}`);
      return;
    }
    console.log(`[dry-run] ${r.contentId} targets=${r.targets.length}`);
    for (const [platform, preview] of Object.entries(r.preview)) {
      const tag = preview?.variantTag ? ` (${preview.variantTag})` : '';
      console.log(`  ${platform}${tag}: ${preview?.body?.slice(0, 60) ?? ''}${preview && preview.body && preview.body.length > 60 ? '...' : ''} [${preview?.tags?.join(',') ?? ''}]`);
    }
    return;
  }

  if (cmd === 'bootstrap-real') {
    const writeBack = argv.includes('--write-back-to-feedback');
    const { runBootstrapDemo } = await import('./bootstrap-demo.js');
    const r = await runBootstrapDemo({ app, writeBackToFeedback: writeBack });
    console.log(`[bootstrap-real] seeded ${r.contents.length} contents; feedback append=${r.feedbackAppended}`);
    return;
  }

  if (cmd === 'doctor') {
    const rpt = await app.registry.doctor();
    for (const r of rpt) console.log(`${r.ok ? 'OK ' : 'FAIL'}  ${r.id.padEnd(12)}  ${r.detail}`);
    const crawlerCheck = await app.crawler.fetch('https://example.com/ping').catch(() => null);
    console.log(crawlerCheck ? 'OK   crawler      composite ok' : 'FAIL  crawler      unreachable');
    console.log(`OK   engagement   ${createEngagementInfo()}`);
    const llmTag = app.llm.provider === 'mock' ? 'WARN  llm          provider=mock model=' + app.llm.model + ' (set IMA_LLM_ENDPOINT/KEY/MODEL)' : `OK   llm          provider=${app.llm.provider} model=${app.llm.model}`;
    console.log(llmTag);
    console.log(`OK   personas     count=${app.personas.count()}`);
    const fb = await app.store.read<{ lastUpdated?: string; windowDays?: number; totalRecords?: number }>('feedback.json');
    if (fb) {
      const ageMs = Date.now() - new Date(fb.lastUpdated ?? 0).getTime();
      const days = Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 86_400_000)) : 0;
      console.log(`OK   feedback     lastUpdated=${(fb.lastUpdated ?? '').slice(0, 10)} age=${days}d window=${fb.windowDays ?? 7}d total=${fb.totalRecords ?? 0}`);
    } else {
      console.log('WARN  feedback     none (run `npm run cli -- feedback` to seed)');
    }
    return;
  }

  if (cmd === 'persona') {
    const sub = argv[1];
    if (sub === 'list') {
      const list = app.personas.list();
      for (const p of list) {
        console.log(`${p.id.padEnd(20)}  ${p.name.padEnd(20)}  tone=${p.tone}  platforms=${p.defaultPlatforms.length}`);
      }
      return;
    }
    if (sub === 'show') {
      const id = argv[2];
      if (!id) throw new Error('usage: ima persona show <id>');
      const p = app.personas.get(id);
      if (!p) throw new Error(`persona not found: ${id}`);
      console.log(JSON.stringify(p, null, 2));
      return;
    }
    if (sub === 'add') {
      const id = argv[2];
      const name = argv[3];
      const tone = argv[4] ?? 'professional';
      if (!id || !name) throw new Error('usage: ima persona add <id> <name> [tone]');
      app.personas.upsert({
        id,
        name,
        tone,
        targetAudience: argv[5] ?? 'general',
        signaturePhrases: [],
        bannedWords: [],
        defaultPlatforms: [],
        examples: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await savePersonas(app.store, app.personas);
      console.log(`[ok] persona added: ${id}`);
      return;
    }
    if (sub === 'remove') {
      const id = argv[2];
      if (!id) throw new Error('usage: ima persona remove <id>');
      const ok = app.personas.remove(id);
      if (!ok) throw new Error(`persona not found: ${id}`);
      await savePersonas(app.store, app.personas);
      console.log(`[ok] persona removed: ${id}`);
      return;
    }
    throw new Error(`unknown persona subcommand: ${sub}`);
  }

  if (cmd === 'feedback') {
    const ids = await listContentIds(app.store);
    const contents = await Promise.all(ids.map((id) => loadContent(app.store, id)));
    const valid = contents.filter((c): c is NonNullable<typeof c> => c !== null && c.posts.length > 0);
    const { metrics, saved } = await fetchAndAppendEngagement(app.store, valid);
    console.log(`[ok] fetched ${metrics.length} engagement records; feedback.json now has ${saved} records (window-filtered)`);
    return;
  }

  if (cmd === 'ab') {
    const sub = argv[1];
    if (sub !== 'report') throw new Error('usage: ima ab report <content-id>');
    const id = argv[2];
    if (!id) throw new Error('id required: ima ab report <content-id>');
    const c = await loadContent(app.store, id);
    if (!c) throw new Error(`not found: ${id}`);
    const minSamplesArg = argv.indexOf('--min-samples');
    const minSamples = minSamplesArg >= 0 ? Number(argv[minSamplesArg + 1]) : 1;
    const report = buildAbReport(id, c.posts, c.engagement, { minSampleSize: minSamples, now: app.now() });
    const outArg = argv.indexOf('--out');
    const envOut = process.env.npm_config_out;
    let outPath: string | undefined = outArg >= 0 ? argv[outArg + 1] : undefined;
    if (!outPath && envOut && envOut !== 'true') outPath = envOut;
    if (!outPath && envOut === 'true') {
      // npm 7+ without `--` collapses `--out path` to npm_config_out=true and
      // leaves the path as the last positional token. Reattach it explicitly.
      const candidate = argv[argv.length - 1];
      if (candidate && !candidate.startsWith('-') && (candidate.includes('/') || candidate.includes('.'))) {
        outPath = candidate;
      }
    }
    const wantsJson = argv.includes('--json') || process.env.npm_config_json === 'true';
    const wantsMarkdown = argv.includes('--markdown') || process.env.npm_config_markdown === 'true';
    console.log(`AB report for ${id} (minSamples=${report.minSampleSize})`);
    console.log('variant  posts  samples  likes  comments  shares  views  score  winner');
    for (const v of report.variants) {
      const isWinner = v.variant === report.winner ? '*' : ' ';
      console.log(
        `${isWinner}${v.variant.padEnd(6)}  ${String(v.postCount).padEnd(5)}  ${String(v.engagementCount).padEnd(7)}  ` +
        `${String(v.likes).padEnd(5)}  ${String(v.comments).padEnd(8)}  ${String(v.shares).padEnd(6)}  ` +
        `${String(v.views).padEnd(5)}  ${v.score.toFixed(1).padEnd(5)}`,
      );
    }
    if (report.winner) {
      console.log(`[ok] winner=${report.winner}`);
    } else {
      console.log(`[info] no winner (insufficient samples or tie within margin)`);
    }
    if (outPath) {
      const target = join(process.cwd(), outPath);
      mkdirSync(dirname(target), { recursive: true });
      const body = wantsMarkdown && !wantsJson ? renderAbReportMarkdown(report) : JSON.stringify(report, null, 2);
      writeFileSync(target, body, 'utf-8');
      console.log(`[ok] wrote ${outPath}`);
    }
    return;
  }

  if (cmd === 'web') {
    const { port, host } = parseWebOptions(argv);
    const noOpen = argv.includes('--no-open');
    const handle = await startWebServer({ store: app.store, host, port, now: app.now });
    const url = handle.url;
    console.log(`[ok] web console at ${url}`);
    console.log('press Ctrl-C to stop');
    if (!noOpen) {
      // Give the listener a moment to be ready before opening the browser.
      setTimeout(() => openBrowser(url), 500);
    }
    // keep alive until SIGINT
    await new Promise<void>((resolveExit) => {
      const stop = (): void => {
        handle.close().finally(resolveExit);
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    });
    return;
  }

  if (cmd === 'queue') {
    const sub = argv[1];
    const items = await app.queue.list();
    const summary = summarizeQueue(items);
    if (sub === 'list' || sub === undefined) {
      console.log(`total=${summary.total} pending=${summary.byStatus.pending} posting=${summary.byStatus.posting} posted=${summary.byStatus.posted} retry=${summary.byStatus.failed_retry} dead=${summary.byStatus.failed_dead}`);
      for (const it of items) {
        const attemptsShown = it.status === 'posted' && it.attempts === 0 ? '-' : `${it.attempts}/${it.maxAttempts}`;
        console.log(`${it.id}  [${it.status.padEnd(13)}]  c=${it.contentId}  p=${it.platform}  attempts=${attemptsShown}  next=${it.nextAttemptAt}`);
      }
      return;
    }
    if (sub === 'work') {
      const limitArg = argv.indexOf('--limit');
      const limit = limitArg >= 0 ? Number(argv[limitArg + 1]) : undefined;
      const worker = new PublishWorker(app.queue, app.registry);
      const r = await worker.runOnce({
        ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
      });
      console.log(`[ok] scanned=${r.scanned} processed=${r.processed} posted=${r.posted} retry=${r.retryScheduled} dead=${r.deadLettered}`);
      return;
    }
    if (sub === 'prune') {
      const before = items.length;
      let removed = 0;
      for (const it of items) {
        if (it.status === 'failed_dead') {
          await app.queue.remove(it.id);
          removed += 1;
        }
      }
      console.log(`[ok] pruned ${removed} dead-letter items (of ${before} total)`);
      return;
    }
    throw new Error(`usage: ima queue [list|work|prune]`);
  }

  throw new Error(`unknown command: ${cmd}`);
}

function createEngagementInfo(): string {
  return 'tracker ready (MockEngagementTracker)';
}

function renderAbReportMarkdown(report: ReturnType<typeof buildAbReport>): string {
  const lines = [
    `# AB report for ${report.contentId}`,
    '',
    `- minSamples: ${report.minSampleSize}`,
    `- winner: ${report.winner ?? 'none'}`,
    '',
    '| variant | posts | samples | likes | comments | shares | views | score |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const v of report.variants) {
    lines.push(`| ${v.variant} | ${v.postCount} | ${v.engagementCount} | ${v.likes} | ${v.comments} | ${v.shares} | ${v.views} | ${v.score.toFixed(1)} |`);
  }
  return `${lines.join('\n')}\n`;
}

function printHelp(): void {
  console.log(`ima — influencer multi-agent CLI

Usage:
  ima run <topic>                       Create content and run pipeline to done
  ima run-ab <N> <topic>                Run with N A/B variants (N >= 2)
  ima run-with-persona <id> <topic>     Run pipeline with a specific persona
  ima list                              List all content records
  ima status <id>                       Show content detail (JSON)
  ima step <id>                         Run one pipeline step on existing content
  ima dry-run <id>                      Preview adapted posts per platform (no channel calls)
  ima bootstrap-real [--write-back-to-feedback]  Re-run the bootstrap demo (optionally close the feedback loop)
  ima doctor                            Check crawler + channel + engagement + LLM + feedback health
  ima persona list                      List all personas
  ima persona show <id>                 Show persona detail (JSON)
  ima persona add <id> <name> [tone]    Add a new persona
  ima persona remove <id>               Remove a persona
  ima feedback                          Fetch engagement for all done contents
  ima ab report <id> [--min-samples N] [--json|--markdown --out path]  Show/export A/B test report
  ima queue list                        List durable publish queue (.ima/queue)
  ima queue work [--limit N]            Run publish worker once (process due items)
  ima queue prune                       Remove dead-letter items from queue
  ima web [--port N] [--host addr] [--no-open]  Start web console (default 127.0.0.1:5173; opens browser unless --no-open)
  ima help                              This help
`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runCli(process.argv.slice(2)).catch((e: Error) => {
    console.error(`[error] ${e.message}`);
    process.exit(1);
  });
}