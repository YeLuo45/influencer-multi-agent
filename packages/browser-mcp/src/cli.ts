#!/usr/bin/env node
// stdio JSON-RPC entry for @ima/browser-mcp
import { createInterface } from 'node:readline';
import { McpServer } from './server.js';

async function main() {
  const server = new McpServer();
  const rl = createInterface({ input: process.stdin });
  let buffer = '';
  rl.on('line', async (line) => {
    buffer += line;
    if (!buffer.endsWith('}')) return;
    const text = buffer.trim();
    buffer = '';
    if (!text) return;
    try {
      const req = JSON.parse(text);
      const resp = await server.handle(req);
      process.stdout.write(JSON.stringify(resp) + '\n');
    } catch (e) {
      const errResp = {
        jsonrpc: '2.0',
        id: 0,
        error: { code: -32700, message: `parse: ${(e as Error).message}` },
      };
      process.stdout.write(JSON.stringify(errResp) + '\n');
    }
  });
}

main().catch((e) => {
  console.error('mcp server crashed:', e);
  process.exit(1);
});