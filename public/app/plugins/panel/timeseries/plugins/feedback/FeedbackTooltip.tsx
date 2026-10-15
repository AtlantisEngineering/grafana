import { css } from '@emotion/css';
import { useEffect, useRef } from 'react';
import { useAsync } from 'react-use';

import { dateTimeFormat, systemDateFormats, type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import {
  Badge,
  type BadgeColor,
  Button,
  ConfirmButton,
  IconButton,
  Stack,
  usePanelContext,
  useStyles2,
} from '@grafana/ui';

import { type FeedbackAnnoVals } from './FeedbackEditor';
import { FeedbackThread } from './FeedbackThread';
import { AUTHORED_BY, type FeedbackData, REVIEWED_BY, getComments, loadFeedbackData } from './feedbackData';
import { splitFeedbackTags } from './feedbackTags';

const CLASS_COLORS: Record<string, BadgeColor> = { TP: 'green', FP: 'red', TN: 'blue', FN: 'orange' };

interface Props {
  annoVals: FeedbackAnnoVals & { dashboardUID?: Array<string | null | undefined> };
  annoIdx: number;
  timeZone: string;
  isPinned: boolean;
  onClose: () => void;
  onEdit?: () => void;
}

/** Read-only card for a feedback annotation, shown instead of the default annotation tooltip */
export const FeedbackTooltip = ({ annoVals, annoIdx, timeZone, isPinned, onClose, onEdit }: Props) => {
  const styles = useStyles2(getStyles);
  const focusRef = useRef<HTMLButtonElement | null>(null);
  const { canEditAnnotations, canDeleteAnnotations, onAnnotationDelete } = usePanelContext();
  const id = annoVals.id?.[annoIdx] ?? undefined;
  const dashboardUID = annoVals.dashboardUID?.[annoIdx] ?? undefined;
  const canEdit = id != null && id !== 0 && onEdit != null && (canEditAnnotations?.(dashboardUID) ?? false);
  const canDelete =
    id != null && id !== 0 && onAnnotationDelete != null && (canDeleteAnnotations?.(dashboardUID) ?? false);

  useEffect(() => {
    if (isPinned) {
      focusRef.current?.focus();
    }
  }, [isPinned]);

  const data = useAsync(async (): Promise<FeedbackData> => (id != null ? loadFeedbackData(id) : {}), [id]);
  const { feedbackClass, status, other } = splitFeedbackTags(annoVals.tags?.[annoIdx] ?? []);

  const timeFormatter = (value: number) => dateTimeFormat(value, { format: systemDateFormats.fullDate, timeZone });
  const start = annoVals.time?.[annoIdx];
  const end = annoVals.timeEnd?.[annoIdx];
  const time =
    start == null
      ? ''
      : end != null && end !== start
        ? `${timeFormatter(start)} - ${timeFormatter(end)}`
        : timeFormatter(start);
  const authoredBy = data.value?.[AUTHORED_BY];
  const reviewedBy = data.value?.[REVIEWED_BY];

  return (
    <div className={styles.wrapper} data-testid={'feedback-tooltip'}>
      <div className={styles.header}>
        <Stack justifyContent={'space-between'} alignItems={'center'}>
          <span>{time}</span>
          {isPinned && (
            <IconButton
              name={'times'}
              size={'sm'}
              onClick={(e) => {
                // The marker underneath would pin the card again
                e.stopPropagation();
                onClose();
              }}
              tooltip={t('timeseries.feedback-tooltip.close', 'Close')}
            />
          )}
        </Stack>
      </div>
      <div className={styles.body}>
        <Stack direction="column" gap={1}>
          <Stack gap={0.5} wrap={'wrap'}>
            {feedbackClass ? (
              <Badge text={feedbackClass} color={CLASS_COLORS[feedbackClass] ?? 'darkgrey'} />
            ) : (
              <Badge text={t('timeseries.feedback-tooltip.comment', 'Comment')} color={'darkgrey'} />
            )}
            {status ? (
              <Badge text={status} color={status === 'Rejected' ? 'red' : 'green'} />
            ) : (
              feedbackClass && (
                <Badge text={t('timeseries.feedback-tooltip.unreviewed', 'Not reviewed')} color={'orange'} />
              )
            )}
            {other.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </Stack>
          {annoVals.text?.[annoIdx] && <div className={styles.text}>{annoVals.text[annoIdx]}</div>}
          {(authoredBy || reviewedBy) && (
            <div className={styles.people}>
              {authoredBy && (
                <span>
                  {t('timeseries.feedback-tooltip.authored-by', 'Authored by')} <b>{String(authoredBy)}</b>
                </span>
              )}
              {reviewedBy && (
                <span>
                  {t('timeseries.feedback-tooltip.reviewed-by', 'Reviewed by')} <b>{String(reviewedBy)}</b>
                </span>
              )}
            </div>
          )}
          {getComments(data.value).length > 0 && (
            <FeedbackThread comments={getComments(data.value)} timeZone={timeZone} />
          )}
        </Stack>
      </div>
      {(canEdit || canDelete) && (
        <div className={styles.footer}>
          <Stack justifyContent={'flex-end'} alignItems={'center'}>
            {canDelete && (
              <ConfirmButton
                size={'sm'}
                confirmText={t('timeseries.feedback-tooltip.delete-confirm', 'Delete feedback')}
                confirmVariant={'destructive'}
                onConfirm={() => onAnnotationDelete!(String(id))}
              >
                {t('timeseries.feedback-tooltip.delete', 'Delete')}
              </ConfirmButton>
            )}
            {canEdit && (
              <Button ref={focusRef} size={'sm'} variant="secondary" onClick={onEdit}>
                {t('timeseries.feedback-tooltip.reply-review', 'Reply / review')}
              </Button>
            )}
          </Stack>
        </div>
      )}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css({
    zIndex: theme.zIndex.tooltip,
    width: '400px',
    background: theme.colors.background.elevated,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    boxShadow: theme.shadows.z3,
    userSelect: 'text',
  }),
  header: css({
    borderBottom: `1px solid ${theme.colors.border.weak}`,
    padding: theme.spacing(0.5, 1),
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
  body: css({
    padding: theme.spacing(1),
  }),
  footer: css({
    borderTop: `1px solid ${theme.colors.border.weak}`,
    padding: theme.spacing(1),
  }),
  text: css({
    whiteSpace: 'pre-wrap',
  }),
  tag: css({
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    padding: theme.spacing(0, 0.5),
  }),
  people: css({
    display: 'flex',
    gap: theme.spacing(2),
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
});
