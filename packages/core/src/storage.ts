import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

function findMonorepoRoot(start: string): string {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as { workspaces?: unknown };
        if (Array.isArray(pkg.workspaces)) return dir;
      } catch {
        // ignore
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

export class JsonStore {
  public readonly root: string;

  constructor(opts: { cwd?: string; rootDir?: string } = {}) {
    const cwd = opts.cwd ?? process.cwd();
    const startDir = opts.rootDir ?? findMonorepoRoot(cwd);
    this.root = join(startDir, '.ima');
    if (!existsSync(this.root)) {
      mkdirSync(this.root, { recursive: true });
    }
  }

  path(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  async read<T>(rel: string): Promise<T | null> {
    const p = this.path(rel);
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, 'utf-8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  }

  async write<T>(rel: string, data: T): Promise<void> {
    const p = this.path(rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
  }

  async list(dir: string): Promise<string[]> {
    const p = this.path(dir);
    if (!existsSync(p)) return [];
    return readdirSync(p).filter((name) => !name.startsWith('.'));
  }

  async remove(rel: string): Promise<void> {
    const p = this.path(rel);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}