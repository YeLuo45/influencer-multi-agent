// Shared Env interface for `process.env` used across all packages.
// This file is intentionally a module (has `export`) so that other modules
// can write:
//   import type { Env } from '../../types/env.js';
// without polluting the global namespace.

export interface Env extends Record<string, string | undefined> {}