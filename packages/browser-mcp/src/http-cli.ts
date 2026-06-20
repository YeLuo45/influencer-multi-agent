#!/usr/bin/env node
// HTTP MCP server entry — exposes browser MCP via Streamable HTTP.
import { McpServer } from './server.js';
import { startHttpServer } from './index.js';

const port = Number(process.env.IMA_MCP_HTTP_PORT ?? 3000);
const host = process.env.IMA_MCP_HTTP_HOST ?? '127.0.0.1';

async function main() {
  const server = new McpServer();
  const handle = await startHttpServer(server, { port, host });
  console.log(`[ima-browser-mcp] HTTP listening on http://${host}:${handle.port}/mcp`);
  console.log(`[ima-browser-mcp] Health: http://${host}:${handle.port}/health`);

  const shutdown = async (sig: string) => {
    console.log(`[ima-browser-mcp] ${sig} received, shutting down...`);
    await handle.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('[ima-browser-mcp] failed:', e);
  process.exit(1);
});