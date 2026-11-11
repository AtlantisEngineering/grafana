import { getBackendSrv } from '@grafana/runtime';
import { getDashboardScenePageStateManager } from 'app/features/dashboard-scene/pages/DashboardScenePageStateManager';

export const AUTHORED_BY = 'authoredBy';
export const REVIEWED_BY = 'reviewedBy';

/** One entry of the conversation on a feedback: a reply, or a review with its action */
export interface FeedbackComment {
  by: string;
  at: number;
  text?: string;
  action?: string;
}

export interface FeedbackData {
  authoredBy?: string;
  reviewedBy?: string;
  comments?: FeedbackComment[];
  [key: string]: unknown;
}

export async function loadFeedbackData(id: number | string): Promise<FeedbackData> {
  const annotation = await getBackendSrv().get(`/api/annotations/${id}`);
  return annotation?.data ?? {};
}

export function getComments(data?: FeedbackData): FeedbackComment[] {
  return Array.isArray(data?.comments) ? data.comments : [];
}

/**
 * Data to save: the latest stored data with the names set and the new comments appended.
 * An update replaces the whole data field, so this starts from what is stored right now.
 */
export function mergeFeedbackData(
  latest: FeedbackData,
  names: Record<string, string>,
  newComments: FeedbackComment[]
): FeedbackData {
  return { ...latest, ...names, comments: [...getComments(latest), ...newComments] };
}

/** Drops cached dashboards so lists of feedback (e.g. the Feedback dashboard) reload when navigated back to */
export function forgetCachedDashboards() {
  getDashboardScenePageStateManager().clearSceneCache();
}
