import { createApp, saveContent, listContentIds, loadContent, savePersonas, fetchAndAppendEngagement } from './app.js';
import { Pipeline, buildAbReport } from '@ima/core';
import { PublishWorker, summarizeQueue } from './queue-worker.js';
import { startWebServer } from './web-server.js';

async function main(): Promise<void> {
  const app = createApp();
  const argv = process.argv.slice(2);
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

  if (cmd === 'doctor') {
    const rpt = await app.registry.doctor();
    for (const r of rpt) console.log(`${r.ok ? 'OK ' : 'FAIL'}  ${r.id.padEnd(12)}  ${r.detail}`);
    const crawlerCheck = await app.crawler.fetch('https://example.com/ping').catch(() => null);
    console.log(crawlerCheck ? 'OK   crawler      composite ok' : 'FAIL  crawler      unreachable');
    console.log(`OK   engagement   ${createEngagementInfo()}`);
    console.log(`OK   llm          provider=${app.llm.provider} model=${app.llm.model}`);
    console.log(`OK   personas     count=${app.personas.count()}`);
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
    return;
  }

  if (cmd === 'web') {
    const portArg = argv.indexOf('--port');
    const port = portArg >= 0 ? Number(argv[portArg + 1]) : 5173;
    const host = argv.indexOf('--host') >= 0 ? argv[argv.indexOf('--host') + 1] : '127.0.0.1';
    const handle = await startWebServer({ store: app.store, host, port, now: app.now });
    console.log(`[ok] web console at ${handle.url}`);
    console.log('press Ctrl-C to stop');
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

function printHelp(): void {
  console.log(`ima — influencer multi-agent CLI

Usage:
  ima run <topic>                       Create content and run pipeline to done
  ima run-ab <N> <topic>                Run with N A/B variants (N >= 2)
  ima run-with-persona <id> <topic>     Run pipeline with a specific persona
  ima list                              List all content records
  ima status <id>                       Show content detail (JSON)
  ima step <id>                         Run one pipeline step on existing content
  ima doctor                            Check crawler + channel + engagement health
  ima persona list                      List all personas
  ima persona show <id>                 Show persona detail (JSON)
  ima persona add <id> <name> [tone]    Add a new persona
  ima persona remove <id>               Remove a persona
  ima feedback                          Fetch engagement for all done contents
  ima ab report <id> [--min-samples N]  Show A/B test report for a content
  ima queue list                        List durable publish queue (.ima/queue)
  ima queue work [--limit N]            Run publish worker once (process due items)
  ima queue prune                       Remove dead-letter items from queue
  ima web [--port N] [--host addr]      Start web console (default 127.0.0.1:5173)
  ima help                              This help
`);
}

main().catch((e: Error) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});