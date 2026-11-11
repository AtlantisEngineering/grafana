import { type InterpolateFunction } from '@grafana/data';
import { t } from '@grafana/i18n';

export const FEEDBACK_CLASSES = ['TP', 'FP', 'TN', 'FN'];
export const FEEDBACK_STATUSES = ['Confirmed', 'Rejected'];

/** Plain-language name and explanation of each feedback class */
export function getFeedbackClassInfo(): Record<string, { label: string; help: string }> {
  return {
    TP: {
      label: t('timeseries.feedback-class.tp', 'Real problem'),
      help: t('timeseries.feedback-class.tp-help', 'The alarm was right: there was a real problem (TP).'),
    },
    FP: {
      label: t('timeseries.feedback-class.fp', 'False alarm'),
      help: t('timeseries.feedback-class.fp-help', 'There was an alarm but no real problem (FP).'),
    },
    TN: {
      label: t('timeseries.feedback-class.tn', 'No problem'),
      help: t('timeseries.feedback-class.tn-help', 'No alarm and no problem: the press ran normally (TN).'),
    },
    FN: {
      label: t('timeseries.feedback-class.fn', 'Missed problem'),
      help: t('timeseries.feedback-class.fn-help', 'There was a real problem but no alarm (FN).'),
    },
  };
}

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
