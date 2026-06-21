import { createApp, saveContent, listContentIds, loadContent, savePersonas, fetchAndAppendEngagement } from './app.js';
import { Pipeline } from '@ima/core';
import { PublishWorker, summarizeQueue } from './queue-worker.js';

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
    console.log(`[ok] ${final.id} stage=${final.stage} posts=${final.posts.length}`);
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
  ima queue list                        List durable publish queue (.ima/queue)
  ima queue work [--limit N]            Run publish worker once (process due items)
  ima queue prune                       Remove dead-letter items from queue
  ima help                              This help
`);
}

main().catch((e: Error) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});