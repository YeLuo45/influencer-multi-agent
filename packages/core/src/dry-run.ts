import { adaptForPlatform } from './platform-adapter.js';
import type { Content, PlatformId } from './types.js';
import { JsonStore } from './storage.js';

export interface DryRunPreviewEntry {
  platform: PlatformId;
  body: string;
  tags: string[];
  variantTag?: string;
}

export interface DryRunResult {
  dryRun: true;
  contentId: string;
  error?: string;
  preview: Partial<Record<PlatformId, DryRunPreviewEntry>>;
  targets: PlatformId[];
}

/**
 * Resolve target platforms from a content's ideas + posts (mirrors
 * PublishAgent.deriveTargets semantics) without invoking any channel.
 */
export function deriveDryRunTargets(content: Content): Array<{ platform: PlatformId; variantTag?: string }> {
  const out: Array<{ platform: PlatformId; variantTag?: string }> = [];
  const seen = new Set<PlatformId>();
  for (const idea of content.ideas) {
    for (const p of idea.targetPlatform) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push({ platform: p, ...(idea.variantTag ? { variantTag: idea.variantTag } : {}) });
    }
  }
  if (out.length === 0) out.push({ platform: 'x' });
  for (const p of content.posts) {
    if (!seen.has(p.platform)) {
      seen.add(p.platform);
      out.push({ platform: p.platform, ...(p.variantTag ? { variantTag: p.variantTag } : {}) });
    }
  }
  return out;
}

export interface RunDryRunOptions {
  store: JsonStore;
  id: string;
  /** Optional; the dry-run never calls a channel. Accepted for API
   * symmetry with PublishAgent.run so callers can pass a registry. */
  registry?: unknown;
}

/**
 * Run the platform adapter for each target platform without invoking any
 * publisher. Returns an empty preview if the content is missing.
 */
export async function runDryRun(input: RunDryRunOptions): Promise<DryRunResult> {
  void input.registry;
  const content = await input.store.read<Content>(`content/${input.id}.json`);
  if (!content) {
    return { dryRun: true, contentId: input.id, error: `content not found: ${input.id}`, preview: {}, targets: [] };
  }
  if (!content.draft) {
    return { dryRun: true, contentId: input.id, error: 'draft missing', preview: {}, targets: [] };
  }
  const targets = deriveDryRunTargets(content);
  const draft = content.draft;
  const preview: Partial<Record<PlatformId, DryRunPreviewEntry>> = {};
  for (const { platform, variantTag } of targets) {
    const adapted = adaptForPlatform({ title: draft.title, body: draft.body, tags: draft.tags, platform });
    preview[platform] = {
      platform,
      body: adapted.body,
      tags: draft.tags,
      ...(variantTag ? { variantTag } : {}),
    };
  }
  return { dryRun: true, contentId: input.id, preview, targets: targets.map((t) => t.platform) };
}
