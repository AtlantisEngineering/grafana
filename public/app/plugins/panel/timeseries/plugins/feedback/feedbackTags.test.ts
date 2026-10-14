import { getFeedbackExtraTags, isFeedbackEditor, joinFeedbackTags, splitFeedbackTags } from './feedbackTags';

// Mimics the dashboard's replaceVariables: known variables resolve, unknown ones are returned as is
const variables: Record<string, string> = {
  '${annotation_editor}': 'feedback',
  '${annotation_feedback_tags}': '$Component,extra',
  $Component: 'Module_1',
};
const replaceVariables = (value: string) =>
  Object.entries(variables).reduce((text, [name, resolved]) => text.split(name).join(resolved), value);

describe('feedbackTags', () => {
  it('uses the feedback popup only when the dashboard variable says so', () => {
    expect(isFeedbackEditor(replaceVariables)).toBe(true);
    expect(isFeedbackEditor((value: string) => value)).toBe(false);
    expect(isFeedbackEditor(undefined)).toBe(false);
  });

  it('resolves the extra tags, including variables in the value', () => {
    expect(getFeedbackExtraTags(replaceVariables)).toEqual(['Module_1', 'extra']);
    expect(getFeedbackExtraTags((value: string) => value)).toEqual([]);
  });

  it('splits and joins class, status and other tags', () => {
    expect(splitFeedbackTags(['M1', 'M1B', 'TP', 'Confirmed'])).toEqual({
      feedbackClass: 'TP',
      status: 'Confirmed',
      other: ['M1', 'M1B'],
    });
    expect(splitFeedbackTags(['M1'])).toEqual({ feedbackClass: undefined, status: undefined, other: ['M1'] });
    expect(joinFeedbackTags(['M1', 'M1B'], 'FP', 'Rejected')).toEqual(['M1', 'M1B', 'FP', 'Rejected']);
    expect(joinFeedbackTags(['M1'], 'TP')).toEqual(['M1', 'TP']);
    expect(joinFeedbackTags(['M1'], undefined)).toEqual(['M1']);
    expect(splitFeedbackTags(['M1', 'FN']).feedbackClass).toBe('FN');
  });
});
