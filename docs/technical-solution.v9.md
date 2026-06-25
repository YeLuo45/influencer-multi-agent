# Technical Solution v9 — Web Ops Completion Batch

Proposal: P-20260625-009

## Architecture
Keep side-effect-free planning in `@ima/core` and wire it through thin CLI/Web adapters. `/api/production` only returns plans, previews, and copy-ready commands; it never mutates Git, MCP, credentials, or external platforms.

## Implementation
- Extend `production-ops.ts` with a composed Web Ops completion model.
- Add tests in `production-ops.test.ts` before implementation.
- Expand `web-server.ts` production payload assembly with new fields.
- Expand static Web production panel discoverability in `app.js` / `index.html` if needed.
- Keep README verifier expectations synchronized if new commands are documented.

## Verification
Run targeted core tests first, then full gates:
`npm run check && npm test && npm run coverage && npm run build && npm run verify:readme`.
