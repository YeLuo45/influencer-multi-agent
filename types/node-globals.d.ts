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
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

declare const Buffer: {
  from(data: string | Uint8Array, encoding?: string): Uint8Array;
  alloc(size: number, fill?: number): Uint8Array;
  toString(buf: Uint8Array, encoding?: string): string;
  isBuffer(obj: unknown): boolean;
};

declare const setTimeout: (cb: () => void, ms?: number) => unknown;
declare const clearTimeout: (id: unknown) => void;
declare const setInterval: (cb: () => void, ms?: number) => unknown;
declare const clearInterval: (id: unknown) => void;
declare const setImmediate: (cb: () => void) => unknown;
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
  aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

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
    function rejects(block: () => unknown | Promise<unknown>, error?: RegExp | Error | Function, msg?: string): Promise<void>;
    function throws(block: () => unknown, error?: RegExp | Error | Function, msg?: string): void;
    function fail(msg?: string): never;
  }
  export = assert;
}