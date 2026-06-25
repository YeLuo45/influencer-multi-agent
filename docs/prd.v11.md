# PRD v11 — Complete Web Ops Workbench

Proposal: P-20260625-014
Project: PRJ-20260620-002 influencer-multi-agent
Mode: unattended

## Scope
Complete all remaining Web operations directions as one cohesive operator workbench batch:
1. Approval Diff Preview
2. Credential Setup Wizard v2
3. SLA Alert Center
4. Operator Session Replay
5. CI Artifact Browser
6. Safe Execute Ledger Persistence
7. Web Command Palette

## Acceptance
- Core pure helpers cover all seven directions with node:test.
- `/api/production` returns `webOpsWorkbench` payload with non-mutating plans.
- Web production panel exposes all seven workbench surfaces visibly.
- CLI/API remains dry-run by default and does not execute shell, GitHub, MCP, or platform posting side effects.
- Full gates pass: check, test, coverage, build, verify:readme.
- Local Web smoke validates `/` and `/api/production` with current JSON shape.
