import type { PlatformId, PostRecord } from './types.js';

export interface SandboxPublisher {
  post(platform: PlatformId, content: { title: string; body: string; tags: string[] }): Promise<PostRecord>;
  deletePost?(platform: PlatformId, postId: string): Promise<boolean>;
}

export interface SandboxCleanupResult {
  ok: boolean;
  platform: PlatformId;
  postId: string;
  error?: string;
}

export interface SandboxPublishInput {
  platform: PlatformId;
  sandbox: boolean;
  title: string;
  body: string;
  tags: string[];
}

export interface SandboxPublishPlan {
  platform: PlatformId;
  mode: 'sandbox';
  willPost: false;
  command: string;
  payload: { title: string; body: string; tags: string[] };
  checks: Array<'dry-run' | 'channel-test' | 'publish-test' | 'verify-post' | 'cleanup'>;
}

export interface SandboxVerification {
  ok: boolean;
  platform: PlatformId;
  postId: string | null;
  url?: string;
  cleanupCommand?: string;
  error?: string;
}

export function buildSandboxPublishPlan(input: SandboxPublishInput): SandboxPublishPlan {
  if (!input.sandbox) throw new Error('sandbox required for publish-test');
  return {
    platform: input.platform,
    mode: 'sandbox',
    willPost: false,
    command: `ima publish-test ${input.platform} --sandbox --verify --cleanup`,
    payload: { title: input.title, body: input.body, tags: [...input.tags] },
    checks: ['dry-run', 'channel-test', 'publish-test', 'verify-post', 'cleanup'],
  };
}

export async function executeSandboxPublish(input: SandboxPublishInput, publisher: SandboxPublisher): Promise<SandboxVerification> {
  if (!input.sandbox) throw new Error('sandbox required for publish-test');
  const record = await publisher.post(input.platform, {
    title: `[SANDBOX] ${input.title}`,
    body: input.body,
    tags: Array.from(new Set([...input.tags, 'sandbox'])),
  });
  return verifySandboxPost(record);
}

export function verifySandboxPost(record: PostRecord): SandboxVerification {
  if (record.status !== 'posted' || !record.postId) {
    return { ok: false, platform: record.platform, postId: record.postId, error: record.error ?? 'sandbox post not found' };
  }
  return {
    ok: true,
    platform: record.platform,
    postId: record.postId,
    ...(record.url ? { url: record.url } : {}),
    cleanupCommand: `ima cleanup ${record.platform} ${record.postId} --sandbox`,
  };
}

export async function cleanupSandboxPost(input: { platform: PlatformId; postId: string }, publisher: Pick<SandboxPublisher, 'deletePost'>): Promise<SandboxCleanupResult> {
  if (!publisher.deletePost) {
    return { ok: false, platform: input.platform, postId: input.postId, error: 'cleanup not supported' };
  }
  const ok = await publisher.deletePost(input.platform, input.postId);
  return ok ? { ok: true, platform: input.platform, postId: input.postId } : { ok: false, platform: input.platform, postId: input.postId, error: 'cleanup failed' };
}
