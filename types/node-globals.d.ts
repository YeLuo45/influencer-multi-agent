// Minimal Node.js type declarations for projects that can't install @types/node.
// Only declares the symbols used in this codebase.

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  cwd(): string;
  exit(code?: number): never;
  stdout: NodeJS.ReadableStream & { write(s: string): boolean };
  stderr: NodeJS.ReadableStream & { write(s: string): boolean };
  stdin: NodeJS.ReadableStream;
  platform: string;
  version: string;
  pid: number;
  nextTick(cb: () => void): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners(event?: string): void;
  listeners(event: string): Array<(...args: unknown[]) => void>;
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

declare function setTimeout(cb: () => void, ms?: number): NodeJS.Timeout;
declare function clearTimeout(handle: NodeJS.Timeout | undefined): void;

// Minimal Node.js http / fs / path / url typing for the web console server.
// We only declare the surface we actually use.

declare module 'http' {
  export interface IncomingMessage {
    url?: string;
  }
  export interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string>): void;
    end(body?: string | Uint8Array): void;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>): {
    listen(port: number, host: string, cb: () => void): void;
    close(cb?: (err?: Error) => void): void;
    once(event: 'error', cb: (err: Error) => void): void;
    address(): { port: number } | null;
  };
}

declare module 'fs' {
  export function readFile(path: string): Promise<Buffer>;
  export function readFileSync(path: string): Buffer;
  export function readFileSync(path: string, encoding: 'utf-8'): string;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
}

declare module 'path' {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function resolve(...parts: string[]): string;
}

declare module 'url' {
  export function fileURLToPath(url: string): string;
}

type AnyBuffer = { toString(encoding?: string): string };
declare const Buffer: {
  isBuffer(obj: unknown): obj is AnyBuffer;
};
declare const setTimeout: (cb: (value?: unknown) => void, ms?: number) => unknown;
declare const clearTimeout: (id: unknown) => void;
declare const setInterval: (cb: (value?: unknown) => void, ms?: number) => unknown;
declare const clearInterval: (id: unknown) => void;
type ImmediateFn = (cb: (value?: unknown) => void) => unknown;
declare const setImmediate: ImmediateFn;
declare const queueMicrotask: (cb: () => void) => void;
declare const global: Record<string, unknown>;
declare const __dirname: string;
declare const __filename: string;
declare const require: (id: string) => unknown;
declare const module: { exports: Record<string, unknown> };

declare function fetch(input: string | URL, init?: {
  method?: string;
  headers?: Record<string, string> | Headers;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}): Promise<Response>;

declare class Response {
  constructor(body?: string | Uint8Array | null, init?: { status?: number; statusText?: string; headers?: Record<string, string> });
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
  headers: Headers;
}

declare class Headers {
  get(name: string): string | null;
  has(name: string): boolean;
  forEach(cb: (value: string, key: string) => void): void;
}

declare class AbortController {
  constructor();
  signal: AbortSignal;
  abort(): void;
}

interface AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}
declare const AbortSignal_: { new (): AbortSignal };

declare class URL {
  constructor(input: string, base?: string | URL);
  href: string;
  protocol: string;
  host: string;
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
  toString(): string;
  static createObjectURL(blob: Blob): string;
}

declare class URLSearchParams {
  constructor(init?: string | Record<string, string>);
  get(name: string): string | null;
  has(name: string): boolean;
  toString(): string;
}

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array): string;
}

declare const crypto: {
  randomUUID(): string;
  getRandomValues<T extends ArrayBufferView>(arr: T): T;
};

declare const performance: {
  now(): number;
};

declare namespace NodeJS {
  interface ReadableStream {
    on(event: string, cb: (...args: unknown[]) => void): void;
    on(event: 'data', cb: (chunk: string) => void): void;
    on(event: 'end', cb: () => void): void;
    on(event: 'error', cb: (err: Error) => void): void;
    pause(): void;
    resume(): void;
    read(): unknown;
  }
  interface ReadLine {
    on(event: string, cb: (...args: unknown[]) => void): void;
    on(event: 'line', cb: (line: string) => void): void;
    on(event: 'close', cb: () => void): void;
    close(): void;
  }
  interface ReadLineInterface extends ReadLine {}
  function createInterface(opts: { input: NodeJS.ReadableStream }): ReadLineInterface;
}

declare module 'node:readline' {
  export function createInterface(opts: { input: NodeJS.ReadableStream }): NodeJS.ReadLineInterface;
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, opts?: { recursive?: boolean }): void;
  export function readFileSync(path: string, encoding?: string): string;
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  export function readdirSync(path: string): string[];
  export function rmSync(path: string, opts?: { recursive?: boolean; force?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:crypto' {
  export function randomUUID(): string;
}

declare module 'node:child_process' {
  export interface ChildProcess {
    on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    kill(signal?: string): boolean;
    unref(): void;
    ref(): void;
    pid?: number;
    killed?: boolean;
  }
  export interface SpawnOptions {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdio?: 'ignore' | 'pipe' | 'inherit' | Array<'ignore' | 'pipe' | 'inherit'>;
    detached?: boolean;
  }
  export function spawn(
    command: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ): ChildProcess;
  export function spawnSync(
    command: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ): { status: number | null; stdout: string; stderr: string; error?: Error };
}

declare module 'node:http' {
  import type { IncomingMessage, ServerResponse, Server } from 'node:http';
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server;
}

declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, opts: { skip?: boolean }, fn: () => void | Promise<void>): void;
  export function test(fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function before(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function after(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
}

declare module 'node:assert/strict' {
  const a: typeof import('node:assert');
  export = a;
}

declare module 'node:assert' {
  namespace assert {
    function equal<T>(actual: T, expected: T, msg?: string): void;
    function notEqual<T>(actual: T, expected: T, msg?: string): void;
    function ok(value: unknown, msg?: string): void;
    function notOk(value: unknown, msg?: string): void;
    function deepEqual<T>(actual: T, expected: T, msg?: string): void;
    function match(value: string, reg: RegExp | string, msg?: string): void;
    function doesNotMatch(value: string, reg: RegExp | string, msg?: string): void;
    function rejects(block: () => unknown | Promise<unknown>, error?: RegExp | Error | Function, msg?: string): Promise<void>;
    function throws(block: () => unknown, error?: RegExp | Error | Function, msg?: string): void;
    function fail(msg?: string): never;
  }
  export = assert;
}