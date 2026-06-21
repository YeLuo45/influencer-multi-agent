#!/usr/bin/env node
/**
 * Wrapper entry for `npm run cli …` / `npm run web …` style invocations.
 *
 * When npm runs a script without an explicit `--` separator, modern npm (9+)
 * captures the trailing tokens into `npm_config_argv` instead of forwarding
 * them to the script's argv. Without help, this means:
 *
 *   $ npm run cli status c1
 *
 * would launch the CLI with no arguments and error out with `unknown command`.
 *
 * This wrapper reads `npm_config_argv`, drops the leading `npm run <script>`
 * segment, and forwards the remainder as if it had been passed on argv.
 *
 * Usage from `package.json` scripts:
 *
 *   "cli": "node --import tsx packages/cli/src/cli-bin.ts"
 *
 * Both forms work end-to-end:
 *
 *   npm run cli -- status c1       # classic, still supported
 *   npm run cli status c1          # new: wrapper extracts from npm_config_argv
 */
import { runCli, readNpmPassthroughArgs } from './index.js';

const env: Record<string, string | undefined> = process.env;
const passthrough = readNpmPassthroughArgs(env);

// When called directly (e.g. `node packages/cli/src/cli-bin.ts status c1`),
// process.argv.slice(2) is already the real subcommand + flags.
// When invoked through npm without `--`, the trailing tokens live in
// npm_config_argv; readNpmPassthroughArgs has already extracted them.
// Prefer the npm passthrough when present (it merges in positional values
// that npm collapsed into npm_config_* env flags), and fall back to direct
// argv otherwise.
const direct = process.argv.slice(2);
const finalArgv = passthrough.length > 0 ? passthrough : direct;

runCli(finalArgv).catch((e: Error) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});