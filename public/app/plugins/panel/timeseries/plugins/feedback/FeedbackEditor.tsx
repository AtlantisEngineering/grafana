import { css } from '@emotion/css';
import { useEffect, useRef, useState } from 'react';
import { useAsync, useAsyncFn, useClickAway } from 'react-use';

import {
  type AnnotationEventUIModel,
  type DateTime,
  type GrafanaTheme2,
  type InterpolateFunction,
  dateTime,
  dateTimeFormat,
  systemDateFormats,
} from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  Button,
  DateTimePicker,
  Field,
  Input,
  RadioButtonGroup,
  Stack,
  Switch,
  TextArea,
  usePanelContext,
  useStyles2,
} from '@grafana/ui';
import { contextSrv } from 'app/core/services/context_srv';

import { applyAnnotationPrefill, type NewAnnotationPrefill } from '../annotationUrlPrefill';
import { AnnotationTooltipHeaderCloseIcon } from '../annotations2/AnnotationTooltipHeaderCloseIcon';

import { FeedbackThread } from './FeedbackThread';
import {
  AUTHORED_BY,
  type FeedbackComment,
  REVIEWED_BY,
  getComments,
  loadFeedbackData,
  mergeFeedbackData,
} from './feedbackData';
import { getFeedbackExtraTags, joinFeedbackTags, splitFeedbackTags } from './feedbackTags';

// Choice for feedback that is only a comment, without a class
const COMMENT_ONLY = 'comment';

export interface FeedbackAnnoVals {
  id?: Array<number | string | null | undefined>;
  time?: number[];
  timeEnd?: Array<number | null | undefined>;
  text?: Array<string | null | undefined>;
  tags?: Array<string[] | null | undefined>;
}

interface Props {
  annoVals: FeedbackAnnoVals;
  annoIdx: number;
  timeZone: string;
  dismiss: () => void;
  liveTime?: number;
  liveTimeEnd?: number | null;
  onTimeRangeChange?: (time: number, timeEnd: number | null) => void;
  prefill?: NewAnnotationPrefill;
  replaceVariables?: InterpolateFunction;
}

/**
 * Annotation popup for feedback: TP/FP, a comment, who authored it, and a review section
 * (Confirm / Reject, who reviewed it) that is enabled once the feedback exists.
 * Tags and names are kept out of the text; names go to the annotation's data field.
 */
export const FeedbackEditor = ({
  annoVals,
  annoIdx,
  timeZone,
  dismiss,
  liveTime,
  liveTimeEnd,
  onTimeRangeChange,
  prefill,
  replaceVariables,
}: Props) => {
  const styles = useStyles2(getStyles);
  const { onAnnotationCreate, onAnnotationUpdate } = usePanelContext();
  const focusRef = useRef<HTMLButtonElement | null>(null);
  const clickAwayRef = useRef(null);
  useClickAway(clickAwayRef, dismiss);
  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  const id = annoVals.id?.[annoIdx] ?? undefined;
  const isUpdating = id != null;
  const loggedInUser = contextSrv.user.name || contextSrv.user.login || '';

  const initial = applyAnnotationPrefill(annoVals.text?.[annoIdx] ?? '', annoVals.tags?.[annoIdx] ?? [], prefill);
  const { feedbackClass: initialClass, status: initialStatus, other } = splitFeedbackTags(initial.tags);
  const [otherTags] = useState(() =>
    isUpdating ? other : [...new Set([...other, ...getFeedbackExtraTags(replaceVariables)])]
  );
  // undefined until chosen; COMMENT_ONLY for an unclassified comment
  const [choice, setChoice] = useState(initialClass ?? (isUpdating ? COMMENT_ONLY : undefined));
  const feedbackClass = choice === COMMENT_ONLY ? undefined : choice;
  const [comment, setComment] = useState(initial.description);
  const [authoredBy, setAuthoredBy] = useState(isUpdating ? '' : loggedInUser);
  // The review section is on for existing feedback; new feedback can turn it on to review right away
  const [reviewEnabled, setReviewEnabled] = useState(isUpdating);
  const [status, setStatus] = useState(initialStatus);
  const [reviewedBy, setReviewedBy] = useState(loggedInUser);
  const [reviewComment, setReviewComment] = useState('');
  const [reply, setReply] = useState('');
  const [replyBy, setReplyBy] = useState(loggedInUser);
  const [error, setError] = useState<string>();

  // Names live in the data field, which the panel's annotation frames don't carry
  const stored = useAsync(async () => (isUpdating ? loadFeedbackData(id) : undefined), [id, isUpdating]);
  useEffect(() => {
    if (stored.value) {
      setAuthoredBy(String(stored.value[AUTHORED_BY] ?? ''));
    }
  }, [stored.value]);

  const [startMs, setStartMs] = useState<number>(liveTime ?? annoVals.time?.[annoIdx] ?? 0);
  const [endMs, setEndMs] = useState<number | null>(
    (liveTimeEnd !== undefined ? liveTimeEnd : annoVals.timeEnd?.[annoIdx]) ?? null
  );
  useEffect(() => {
    if (liveTime != null) {
      setStartMs(liveTime);
    }
  }, [liveTime]);
  useEffect(() => {
    if (liveTimeEnd !== undefined) {
      setEndMs(liveTimeEnd);
    }
  }, [liveTimeEnd]);

  const isNewReview = reviewEnabled && status != null && status !== initialStatus;

  const [saveState, save] = useAsyncFn(async () => {
    if (!choice) {
      setError(t('timeseries.feedback-editor.class-required', 'Choose a class or comment only'));
      return;
    }
    if (!feedbackClass && !comment.trim()) {
      setError(t('timeseries.feedback-editor.comment-required', 'Write a comment'));
      return;
    }
    if (!isUpdating && !authoredBy.trim()) {
      setError(t('timeseries.feedback-editor.author-required', 'Authored by is required'));
      return;
    }
    if (isNewReview && !reviewedBy.trim()) {
      setError(t('timeseries.feedback-editor.reviewer-required', 'Reviewed by is required'));
      return;
    }
    if (reply.trim() && !replyBy.trim()) {
      setError(t('timeseries.feedback-editor.reply-by-required', 'Your name is required to comment'));
      return;
    }
    if (endMs != null && endMs < startMs) {
      setError(t('timeseries.feedback-editor.invalid-range', 'End time must be after the start time'));
      return;
    }

    const names: Record<string, string> = {};
    if (!isUpdating) {
      names[AUTHORED_BY] = authoredBy.trim();
    }
    if (isNewReview) {
      names[REVIEWED_BY] = reviewedBy.trim();
    }
    const now = Date.now();
    const newComments: FeedbackComment[] = [];
    if (isNewReview) {
      newComments.push({ by: reviewedBy.trim(), at: now, action: status, text: reviewComment.trim() || undefined });
    }
    if (reply.trim()) {
      newComments.push({ by: replyBy.trim(), at: now, text: reply.trim() });
    }
    const hasNewData = Object.keys(names).length > 0 || newComments.length > 0;
    const latest = hasNewData && isUpdating ? await loadFeedbackData(id) : {};

    const from = Math.round(startMs);
    const event: AnnotationEventUIModel = {
      // @ts-expect-error id is typed as string but the annotation API needs the number
      id,
      from,
      to: endMs != null ? Math.round(endMs) : from,
      tags: joinFeedbackTags(otherTags, feedbackClass, reviewEnabled ? status : initialStatus),
      description: comment.trim() || feedbackClass || '',
      data: hasNewData ? mergeFeedbackData(latest, names, newComments) : undefined,
    };
    await (isUpdating ? onAnnotationUpdate : onAnnotationCreate)?.(event);
    dismiss();
  }, [
    choice,
    feedbackClass,
    comment,
    authoredBy,
    status,
    reviewedBy,
    reviewEnabled,
    reviewComment,
    reply,
    replyBy,
    isNewReview,
    startMs,
    endMs,
    otherTags,
    id,
    isUpdating,
  ]);

  const timeFormatter = (value: number) => dateTimeFormat(value, { format: systemDateFormats.fullDate, timeZone });
  const headerLabel = endMs != null ? `${timeFormatter(startMs)} - ${timeFormatter(endMs)}` : timeFormatter(startMs);
  const clearError = () => setError(undefined);

  return (
    // Clicks must not reach the marker underneath, which would pin its card
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div ref={clickAwayRef} className={styles.editor} onClick={(e) => e.stopPropagation()}>
      <div className={styles.header}>
        <Stack justifyContent={'space-between'} alignItems={'center'}>
          <div>
            {isUpdating
              ? t('timeseries.feedback-editor.edit', 'Feedback')
              : t('timeseries.feedback-editor.add', 'Leave feedback')}
          </div>
          <div>{headerLabel}</div>
          <AnnotationTooltipHeaderCloseIcon
            forwardRef={focusRef}
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
          />
        </Stack>
      </div>
      <div className={styles.content}>
        <Stack direction="column" gap={1.5}>
          <Field noMargin label={t('timeseries.feedback-editor.label-class', 'Feedback')}>
            <RadioButtonGroup
              options={[
                { value: 'TP', label: 'TP', description: t('timeseries.feedback-editor.tp', 'True positive') },
                { value: 'FP', label: 'FP', description: t('timeseries.feedback-editor.fp', 'False positive') },
                { value: 'TN', label: 'TN', description: t('timeseries.feedback-editor.tn', 'True negative') },
                { value: 'FN', label: 'FN', description: t('timeseries.feedback-editor.fn', 'False negative') },
                {
                  value: COMMENT_ONLY,
                  label: t('timeseries.feedback-editor.comment-only', 'Comment only'),
                  description: t(
                    'timeseries.feedback-editor.comment-only-description',
                    'Leave a comment without a class'
                  ),
                },
              ]}
              value={choice}
              onChange={(value) => {
                setChoice(value);
                clearError();
              }}
            />
          </Field>
          <div className={styles.row}>
            <Field noMargin className={styles.rowField} label={t('timeseries.feedback-editor.label-start', 'Start')}>
              <DateTimePicker
                date={dateTime(startMs)}
                timeZone={timeZone}
                onChange={(d?: DateTime) => {
                  if (d) {
                    setStartMs(d.valueOf());
                    onTimeRangeChange?.(d.valueOf(), endMs);
                  }
                }}
              />
            </Field>
            <Field noMargin className={styles.rowField} label={t('timeseries.feedback-editor.label-end', 'End')}>
              <DateTimePicker
                date={dateTime(endMs ?? startMs)}
                timeZone={timeZone}
                minDate={new Date(startMs)}
                onChange={(d?: DateTime) => {
                  if (d) {
                    setEndMs(d.valueOf());
                    onTimeRangeChange?.(startMs, d.valueOf());
                  }
                }}
              />
            </Field>
          </div>
          <Field noMargin label={t('timeseries.feedback-editor.label-comment', 'Comment')}>
            <TextArea
              data-testid={'feedback-editor-comment'}
              className={styles.textarea}
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
            />
          </Field>
          <Field noMargin label={t('timeseries.feedback-editor.label-authored-by', 'Authored by')}>
            <Input
              data-testid={'feedback-editor-authored-by'}
              value={authoredBy}
              disabled={isUpdating}
              onChange={(e) => {
                setAuthoredBy(e.currentTarget.value);
                clearError();
              }}
            />
          </Field>
          <fieldset className={styles.review} disabled={!reviewEnabled} data-testid={'feedback-editor-review'}>
            <legend className={styles.legend}>
              <Stack gap={1} alignItems={'center'}>
                {t('timeseries.feedback-editor.review', 'Review')}
                {!isUpdating && (
                  <Switch
                    data-testid={'feedback-editor-review-toggle'}
                    value={reviewEnabled}
                    onChange={(e) => {
                      setReviewEnabled(e.currentTarget.checked);
                      clearError();
                    }}
                  />
                )}
              </Stack>
            </legend>
            <div className={styles.row}>
              <Field
                noMargin
                className={styles.rowField}
                label={t('timeseries.feedback-editor.label-action', 'Action')}
              >
                <RadioButtonGroup
                  disabled={!reviewEnabled}
                  options={[
                    { value: 'Confirmed', label: t('timeseries.feedback-editor.confirm', 'Confirm') },
                    { value: 'Rejected', label: t('timeseries.feedback-editor.reject', 'Reject') },
                  ]}
                  value={status}
                  onChange={(value) => {
                    setStatus(value);
                    clearError();
                  }}
                />
              </Field>
              <Field
                noMargin
                className={styles.rowField}
                label={t('timeseries.feedback-editor.label-reviewed-by', 'Reviewed by')}
              >
                <Input
                  data-testid={'feedback-editor-reviewed-by'}
                  value={reviewedBy}
                  disabled={!reviewEnabled}
                  onChange={(e) => {
                    setReviewedBy(e.currentTarget.value);
                    clearError();
                  }}
                />
              </Field>
            </div>
            <Field
              noMargin
              className={styles.reviewComment}
              label={t('timeseries.feedback-editor.label-review-comment', 'Review comment (optional)')}
            >
              <TextArea
                data-testid={'feedback-editor-review-comment'}
                className={styles.textarea}
                rows={2}
                value={reviewComment}
                disabled={!reviewEnabled}
                onChange={(e) => setReviewComment(e.currentTarget.value)}
              />
            </Field>
          </fieldset>
          {isUpdating && (
            <Field noMargin label={t('timeseries.feedback-editor.label-conversation', 'Conversation')}>
              <Stack direction="column" gap={1}>
                <FeedbackThread comments={getComments(stored.value)} timeZone={timeZone} />
                <TextArea
                  data-testid={'feedback-editor-reply'}
                  className={styles.textarea}
                  rows={2}
                  placeholder={t('timeseries.feedback-editor.reply-placeholder', 'Add a comment')}
                  value={reply}
                  onChange={(e) => {
                    setReply(e.currentTarget.value);
                    clearError();
                  }}
                />
                <Input
                  data-testid={'feedback-editor-reply-by'}
                  prefix={t('timeseries.feedback-editor.reply-by', 'As')}
                  value={replyBy}
                  onChange={(e) => {
                    setReplyBy(e.currentTarget.value);
                    clearError();
                  }}
                />
              </Stack>
            </Field>
          )}
          {(error || saveState.error) && <div className={styles.error}>{error ?? saveState.error?.message}</div>}
        </Stack>
      </div>
      <div className={styles.footer}>
        <Stack justifyContent={'flex-end'}>
          <Button size={'sm'} variant="secondary" fill="outline" onClick={dismiss}>
            {t('timeseries.feedback-editor.cancel', 'Cancel')}
          </Button>
          <Button size={'sm'} disabled={saveState.loading || stored.loading} onClick={() => save()}>
            {t('timeseries.feedback-editor.save', 'Save')}
          </Button>
        </Stack>
      </div>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  editor: css({
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    boxShadow: theme.shadows.z3,
    userSelect: 'text',
    width: '520px',
  }),
  header: css({
    borderBottom: `1px solid ${theme.colors.border.weak}`,
    padding: theme.spacing(0.5, 1),
    fontWeight: theme.typography.fontWeightBold,
    fontSize: theme.typography.fontSize,
    color: theme.colors.text.primary,
  }),
  content: css({
    padding: theme.spacing(1),
  }),
  footer: css({
    borderTop: `1px solid ${theme.colors.border.weak}`,
    padding: theme.spacing(1, 1),
  }),
  textarea: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  row: css({
    display: 'flex',
    gap: theme.spacing(1),
  }),
  rowField: css({
    flex: 1,
    minWidth: 0,
  }),
  review: css({
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(0, 1, 1),
    '&:disabled': {
      opacity: 0.5,
    },
  }),
  reviewComment: css({
    marginTop: theme.spacing(1),
  }),
  legend: css({
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
    padding: theme.spacing(0, 0.5),
    width: 'auto',
    marginBottom: 0,
  }),
  error: css({
    color: theme.colors.error.text,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
});
