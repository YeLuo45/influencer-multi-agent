import { createApp, saveContent, listContentIds, loadContent } from './app.js';
import { Pipeline } from '@ima/core';

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

  if (cmd === 'list') {
    const ids = await listContentIds(app.store);
    for (const id of ids) {
      const c = await loadContent(app.store, id);
      if (!c) continue;
      console.log(`${c.id}  [${c.stage.padEnd(14)}]  topic="${c.topic}"  posts=${c.posts.length}`);
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
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

function printHelp(): void {
  console.log(`ima — influencer multi-agent CLI

Usage:
  ima run <topic>        Create content and run pipeline to done
  ima list               List all content records
  ima status <id>        Show content detail (JSON)
  ima step <id>          Run one pipeline step on existing content
  ima doctor             Check crawler + channel health
  ima help               This help
`);
}

main().catch((e: Error) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});