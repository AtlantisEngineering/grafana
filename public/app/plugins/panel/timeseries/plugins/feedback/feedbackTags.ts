import { type InterpolateFunction } from '@grafana/data';

export const FEEDBACK_CLASSES = ['TP', 'FP', 'TN', 'FN'];
export const FEEDBACK_STATUSES = ['Confirmed', 'Rejected'];

const EDITOR_VARIABLE = '${annotation_editor}';
const TAGS_VARIABLE = '${annotation_feedback_tags}';

/** The dashboard picks the feedback popup with a (hidden) variable annotation_editor = feedback */
export function isFeedbackEditor(replaceVariables?: InterpolateFunction): boolean {
  return replaceVariables?.(EDITOR_VARIABLE) === 'feedback';
}

/**
 * Tags added to new feedback, from the (hidden) variable annotation_feedback_tags.
 * Its value may reference other variables, e.g. $Component, which resolve per repeated panel.
 */
export function getFeedbackExtraTags(replaceVariables?: InterpolateFunction): string[] {
  const template = replaceVariables?.(TAGS_VARIABLE);
  if (!replaceVariables || !template || template === TAGS_VARIABLE) {
    return [];
  }
  return replaceVariables(template, undefined, 'csv')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && !tag.startsWith('$'));
}

/** Splits annotation tags into the feedback class, the review status and the rest */
export function splitFeedbackTags(tags: string[]): { feedbackClass?: string; status?: string; other: string[] } {
  return {
    feedbackClass: tags.find((tag) => FEEDBACK_CLASSES.includes(tag)),
    status: tags.find((tag) => FEEDBACK_STATUSES.includes(tag)),
    other: tags.filter((tag) => !FEEDBACK_CLASSES.includes(tag) && !FEEDBACK_STATUSES.includes(tag)),
  };
}

export function joinFeedbackTags(other: string[], feedbackClass?: string, status?: string): string[] {
  return [...new Set([...other, ...(feedbackClass ? [feedbackClass] : []), ...(status ? [status] : [])])];
}
