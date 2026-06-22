// Pure aggregator for the web console. Combines contents, queue, feedback,
// AB, and LLM metadata into a single stats payload that the dashboard
// renders without re-querying individual endpoints.

export interface WebStatsContentRow {
  stage: string;
  persona: string;
  posts: number;
  engagement: number;
  createdAt?: string;
}

export interface WebStatsQueueRow {
  status: string;
  platform: string;
  createdAt?: string;
}

export interface WebStatsFeedback {
  totalRecords: number;
  recentCount: number;
  lastUpdated: string | null;
}

export interface WebStatsAb {
  winner: string | null;
  variants: number;
  minSampleSize: number;
}

export interface WebStatsLlm {
  provider: string;
  model: string;
}

export interface WebStatsInput {
  contents: WebStatsContentRow[];
  queueItems: WebStatsQueueRow[];
  feedback: WebStatsFeedback;
  ab: WebStatsAb;
  llm: WebStatsLlm;
}

export interface WebStatsOutput {
  totalContents: number;
  contentsByStage: Record<string, number>;
  postsByPersona: Record<string, number>;
  totalPosts: number;
  totalQueue: number;
  queueByStatus: Record<string, number>;
  queueByPlatform: Record<string, number>;
  feedback: WebStatsFeedback;
  ab: WebStatsAb;
  llm: WebStatsLlm;
}

const EMPTY_STAGE: Record<string, number> = {};
const EMPTY_STATUS: Record<string, number> = {
  pending: 0, posting: 0, posted: 0, failed_retry: 0, failed_dead: 0,
};
const EMPTY_PLATFORM: Record<string, number> = {};
const EMPTY_PERSONA: Record<string, number> = {};

export function computeWebStats(input: WebStatsInput): WebStatsOutput {
  const contentsByStage = { ...EMPTY_STAGE };
  const postsByPersona = { ...EMPTY_PERSONA };
  let totalPosts = 0;
  for (const c of input.contents) {
    contentsByStage[c.stage] = (contentsByStage[c.stage] ?? 0) + 1;
    if (c.posts > 0) {
      postsByPersona[c.persona] = (postsByPersona[c.persona] ?? 0) + c.posts;
      totalPosts += c.posts;
    }
  }

  const queueByStatus = { ...EMPTY_STATUS };
  const queueByPlatform = { ...EMPTY_PLATFORM };
  for (const it of input.queueItems) {
    queueByStatus[it.status] = (queueByStatus[it.status] ?? 0) + 1;
    queueByPlatform[it.platform] = (queueByPlatform[it.platform] ?? 0) + 1;
  }

  return {
    totalContents: input.contents.length,
    contentsByStage,
    postsByPersona,
    totalPosts,
    totalQueue: input.queueItems.length,
    queueByStatus,
    queueByPlatform,
    feedback: input.feedback,
    ab: input.ab,
    llm: input.llm,
  };
}
