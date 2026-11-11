import { css } from '@emotion/css';

import { dateTimeFormat, systemDateFormats, type GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { Badge, useStyles2 } from '@grafana/ui';

import { type FeedbackComment } from './feedbackData';

interface Props {
  comments: FeedbackComment[];
  timeZone: string;
}

/** The conversation on a feedback, oldest first */
export const FeedbackThread = ({ comments, timeZone }: Props) => {
  const styles = useStyles2(getStyles);

  if (comments.length === 0) {
    return <div className={styles.empty}>{t('timeseries.feedback-thread.empty', 'No comments yet')}</div>;
  }

  return (
    <ul className={styles.thread} data-testid={'feedback-thread'}>
      {comments.map((comment, i) => (
        <li key={i} className={styles.entry}>
          <div className={styles.meta}>
            <span className={styles.by}>{comment.by}</span>
            <span>{dateTimeFormat(comment.at, { format: systemDateFormats.fullDate, timeZone })}</span>
            {comment.action && <Badge text={comment.action} color={comment.action === 'Rejected' ? 'red' : 'green'} />}
          </div>
          {comment.text && <div className={styles.text}>{comment.text}</div>}
        </li>
      ))}
    </ul>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  thread: css({
    listStyle: 'none',
    margin: 0,
    padding: 0,
    maxHeight: '200px',
    overflowY: 'auto',
  }),
  entry: css({
    borderLeft: `2px solid ${theme.colors.border.medium}`,
    padding: theme.spacing(0.25, 1),
    marginBottom: theme.spacing(0.75),
  }),
  meta: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
  by: css({
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeightMedium,
  }),
  text: css({
    whiteSpace: 'pre-wrap',
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  empty: css({
    fontSize: theme.typography.bodySmall.fontSize,
    color: theme.colors.text.secondary,
  }),
});
