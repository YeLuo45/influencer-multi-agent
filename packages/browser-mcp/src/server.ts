import type { BrowserSession } from './browser.js';
import { StubBrowserSession } from './browser.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

const SERVER_INFO = { name: 'ima-browser-mcp', version: '0.1.0' };

const TOOLS = [
  {
    name: 'navigate',
    description: 'Navigate browser to URL',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'snapshot',
    description: 'Get accessibility snapshot of current page',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'extract_text',
    description: 'Extract text under CSS selector',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' } },
      required: ['selector'],
    },
  },
  {
    name: 'click',
    description: 'Click element by ref',
    inputSchema: {
      type: 'object',
      properties: { ref: { type: 'string' } },
      required: ['ref'],
    },
  },
  {
    name: 'wait_for',
    description: 'Wait for selector or text',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        text: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
    },
  },
  {
    name: 'close',
    description: 'Close browser session',
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

export class McpServer {
  private session: BrowserSession | null = null;

  constructor(private readonly createSession: () => BrowserSession = () => new StubBrowserSession()) {}

  async handle(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const result = await this.dispatch(req);
      return { jsonrpc: '2.0', id: req.id, result };
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32603, message: (e as Error).message },
      };
    }
  }

  private async dispatch(req: JsonRpcRequest): Promise<unknown> {
    switch (req.method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        };
      case 'tools/list':
        return { tools: TOOLS };
      case 'tools/call': {
        const params = req.params ?? {};
        const name = String(params['name'] ?? '');
        const args = (params['arguments'] ?? {}) as Record<string, unknown>;
        return this.callTool(name, args);
      }
      default:
        throw new Error(`unknown method: ${req.method}`);
    }
  }

  private getSession(): BrowserSession {
    if (!this.session) this.session = this.createSession();
    return this.session;
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const session = this.getSession();
    let text = '';
    switch (name) {
      case 'navigate': {
        const url = String(args['url'] ?? '');
        await session.navigate(url);
        text = `navigated to ${url}`;
        break;
      }
      case 'snapshot': {
        const snap = await session.snapshot();
        text = JSON.stringify(snap);
        break;
      }
      case 'extract_text': {
        const selector = String(args['selector'] ?? '');
        text = await session.extractText(selector);
        break;
      }
      case 'click': {
        const ref = String(args['ref'] ?? '');
        await session.click(ref);
        text = `clicked ${ref}`;
        break;
      }
      case 'wait_for': {
        await session.waitFor({
          ...(args['selector'] ? { selector: String(args['selector']) } : {}),
          ...(args['text'] ? { text: String(args['text']) } : {}),
          ...(args['timeoutMs'] ? { timeoutMs: Number(args['timeoutMs']) } : {}),
        });
        text = 'condition met';
        break;
      }
      case 'close': {
        await session.close();
        text = 'session closed';
        break;
      }
      default:
        throw new Error(`unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text }] };
  }
}