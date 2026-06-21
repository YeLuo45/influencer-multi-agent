import type { EngagementMetric } from './types.js';

export interface FeedbackState {
  records: EngagementMetric[];
  windowDays: number;
  lastUpdated: string;
  totalRecords: number;
}

export function emptyFeedback(now: string = new Date().toISOString()): FeedbackState {
  return {
    records: [],
    windowDays: 7,
    lastUpdated: now,
    totalRecords: 0,
  };
}

export function filterByWindow(records: EngagementMetric[], windowDays: number, now: string = new Date().toISOString()): EngagementMetric[] {
  if (windowDays <= 0) return [...records];
  const cutoff = Date.parse(now) - windowDays * 24 * 60 * 60 * 1000;
  return records.filter((r) => {
    const t = Date.parse(r.fetchedAt);
    return !Number.isNaN(t) && t >= cutoff;
  });
}

export function appendFeedback(state: FeedbackState, newRecords: EngagementMetric[], now: string = new Date().toISOString()): FeedbackState {
  const filtered = filterByWindow([...state.records, ...newRecords], state.windowDays, now);
  return {
    ...state,
    records: filtered,
    lastUpdated: now,
    totalRecords: filtered.length,
  };
}