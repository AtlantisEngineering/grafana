import { css } from '@emotion/css';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Controller } from 'react-hook-form';
import { useAsyncFn, useClickAway } from 'react-use';

import {
  type AnnotationEventUIModel,
  type DateTime,
  type GrafanaTheme2,
  dateTime,
  dateTimeFormat,
  systemDateFormats,
} from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import {
  Button,
  DateTimePicker,
  Field,
  Stack,
  Switch,
  TextArea,
  usePanelContext,
  useStyles2,
} from '@grafana/ui';
import { Form } from 'app/core/components/Form/Form';
import { TagFilter } from 'app/core/components/TagFilter/TagFilter';
import { annotationServer } from 'app/features/annotations/api';

import { AnnotationTooltipHeaderCloseIcon } from './AnnotationTooltipHeaderCloseIcon';
import { type AnnotationVals } from './types';

interface Props {
  annoVals: AnnotationVals;
  annoIdx: number;
  timeZone: string;
  dismiss: () => void;
  /**
   * When editing a work-in-progress (WIP) annotation, the marker may track
   * the live time range here so drag-handles outside the form can sync to
   * the form's editable inputs (and vice versa).
   */
  liveTime?: number;
  liveTimeEnd?: number | null;
  onTimeRangeChange?: (time: number, timeEnd: number | null) => void;
}

interface AnnotationEditFormDTO {
  description: string;
  tags: string[];
}

export const AnnotationEditor2 = ({
  annoVals,
  annoIdx,
  dismiss,
  timeZone,
  liveTime,
  liveTimeEnd,
  onTimeRangeChange,
  ...otherProps
}: Props) => {
  const styles = useStyles2(getStyles);
  const { onAnnotationCreate, onAnnotationUpdate } = usePanelContext();
  const focusRef = useRef<HTMLButtonElement | null>(null);
  const clickAwayRef = useRef(null);

  useClickAway(clickAwayRef, dismiss);

  // focus close button on render
  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  const [createAnnotationState, createAnnotation] = useAsyncFn(async (event: AnnotationEventUIModel) => {
    const result = await onAnnotationCreate!(event);
    dismiss();
    return result;
  });

  const [updateAnnotationState, updateAnnotation] = useAsyncFn(async (event: AnnotationEventUIModel) => {
    const result = await onAnnotationUpdate!(event);
    dismiss();
    return result;
  });

  const timeFormatter = (value: number) =>
    dateTimeFormat(value, {
      format: systemDateFormats.fullDate,
      timeZone,
    });

  const isUpdatingAnnotation = annoVals.id?.[annoIdx] != null;
  const initialIsRegion = annoVals.isRegion?.[annoIdx] === true;
  const operation = isUpdatingAnnotation ? updateAnnotation : createAnnotation;
  const stateIndicator = isUpdatingAnnotation ? updateAnnotationState : createAnnotationState;

  // Source-of-truth for the boundary editing happens here so external
  // drag-handles (passed via liveTime/liveTimeEnd) and the date inputs
  // stay in sync.
  const initialStart = liveTime ?? annoVals.time[annoIdx];
  const initialEndRaw = liveTimeEnd !== undefined ? liveTimeEnd : annoVals.timeEnd?.[annoIdx];
  const initialEnd = initialEndRaw != null ? initialEndRaw : null;

  const [startMs, setStartMs] = useState<number>(initialStart);
  const [endMs, setEndMs] = useState<number | null>(initialEnd);
  // Allow the user to flip a point annotation into a region (or back) while editing.
  const [isRegion, setIsRegion] = useState<boolean>(initialIsRegion || initialEnd != null);

  // Sync incoming live values (e.g. from drag handles) into local state.
  useEffect(() => {
    if (liveTime != null) {
      setStartMs(liveTime);
    }
  }, [liveTime]);

  useEffect(() => {
    if (liveTimeEnd !== undefined) {
      setEndMs(liveTimeEnd);
      if (liveTimeEnd != null) {
        setIsRegion(true);
      }
    }
  }, [liveTimeEnd]);

  const updateStart = useCallback(
    (next: number) => {
      setStartMs(next);
      onTimeRangeChange?.(next, isRegion ? endMs : null);
    },
    [onTimeRangeChange, isRegion, endMs]
  );

  const updateEnd = useCallback(
    (next: number | null) => {
      setEndMs(next);
      onTimeRangeChange?.(startMs, next);
    },
    [onTimeRangeChange, startMs]
  );

  const toggleRegion = (next: boolean) => {
    setIsRegion(next);
    if (next) {
      const fallback = endMs ?? startMs + 60_000;
      setEndMs(fallback);
      onTimeRangeChange?.(startMs, fallback);
    } else {
      setEndMs(null);
      onTimeRangeChange?.(startMs, null);
    }
  };

  const headerLabel =
    isRegion && endMs != null
      ? `${timeFormatter(startMs)} - ${timeFormatter(endMs)}`
      : timeFormatter(startMs);

  // Boundary validation (used to disable the Save button and surface an error).
  let boundaryError: string | undefined;
  if (!Number.isFinite(startMs)) {
    boundaryError = t('timeseries.annotation-editor2.invalid-start', 'Start time is invalid');
  } else if (isRegion) {
    if (endMs == null || !Number.isFinite(endMs)) {
      boundaryError = t('timeseries.annotation-editor2.invalid-end', 'End time is invalid');
    } else if (endMs < startMs) {
      boundaryError = t(
        'timeseries.annotation-editor2.invalid-range',
        'End time must be after the start time'
      );
    }
  }

  const onSubmit = ({ tags, description }: AnnotationEditFormDTO) => {
    if (boundaryError != null) {
      return;
    }
    const from = Math.round(startMs);
    const to = isRegion && endMs != null ? Math.round(endMs) : from;

    operation({
      // @ts-expect-error @todo https://github.com/grafana/grafana/issues/120097 - id is typed incorrectly as string but breaks annotation API
      id: annoVals.id?.[annoIdx] ?? undefined,
      tags,
      description,
      from,
      to,
    });
  };

  // Annotation editor
  return (
    <div ref={clickAwayRef} className={styles.editor} {...otherProps}>
      <div className={styles.header}>
        <Stack justifyContent={'space-between'} alignItems={'center'}>
          <Stack gap={0} width="100%" justifyContent={'space-between'} alignItems={'center'}>
            <div>
              {isUpdatingAnnotation
                ? t('timeseries.annotation-editor2.edit-annotation', 'Edit annotation')
                : t('timeseries.annotation-editor2.add-annotation', 'Add annotation')}
            </div>
            <div>{headerLabel}</div>
          </Stack>
          <AnnotationTooltipHeaderCloseIcon
            forwardRef={focusRef}
            onClick={(e) => {
              // Don't trigger onClick
              e.stopPropagation();
              dismiss();
            }}
          />
        </Stack>
      </div>
      <Form<AnnotationEditFormDTO>
        onSubmit={onSubmit}
        defaultValues={{ description: annoVals.text?.[annoIdx] ?? '', tags: annoVals.tags?.[annoIdx] || [] }}
      >
        {({ register, errors, control }) => {
          return (
            <>
              <div className={styles.content}>
                <Field
                  htmlFor={'annotation-description-textarea'}
                  autoFocus={true}
                  label={t('timeseries.annotation-editor2.label-description', 'Description')}
                  invalid={!!errors.description}
                  error={errors?.description?.message}
                >
                  <TextArea
                    id={'annotation-description-textarea'}
                    data-testid={'annotation-editor-description'}
                    className={styles.textarea}
                    {...register('description', {
                      required: 'Annotation description is required',
                    })}
                  />
                </Field>
                <div className={styles.timeRow}>
                  <Field
                    className={styles.timeField}
                    label={
                      isRegion
                        ? t('timeseries.annotation-editor2.label-start', 'Start')
                        : t('timeseries.annotation-editor2.label-time', 'Time')
                    }
                  >
                    <DateTimePicker
                      date={dateTime(startMs)}
                      timeZone={timeZone}
                      onChange={(d?: DateTime) => {
                        if (d) {
                          updateStart(d.valueOf());
                        }
                      }}
                    />
                  </Field>
                  {isRegion && (
                    <Field
                      className={styles.timeField}
                      label={t('timeseries.annotation-editor2.label-end', 'End')}
                    >
                      <DateTimePicker
                        date={dateTime(endMs ?? startMs)}
                        timeZone={timeZone}
                        minDate={new Date(startMs)}
                        onChange={(d?: DateTime) => {
                          if (d) {
                            updateEnd(d.valueOf());
                          }
                        }}
                      />
                    </Field>
                  )}
                </div>
                <Field
                  label={t('timeseries.annotation-editor2.label-region', 'Region annotation')}
                  description={t(
                    'timeseries.annotation-editor2.region-description',
                    'When enabled, the annotation spans a time range'
                  )}
                >
                  <Switch
                    value={isRegion}
                    onChange={(e) => toggleRegion(e.currentTarget.checked)}
                  />
                </Field>
                {boundaryError != null && <div className={styles.boundaryError}>{boundaryError}</div>}
                <Field htmlFor={'annotation-tags-input'} label={t('timeseries.annotation-editor2.label-tags', 'Tags')}>
                  <Controller
                    control={control}
                    name="tags"
                    render={({ field: { ref, onChange, ...field } }) => {
                      return (
                        <TagFilter
                          inputId={'annotation-tags-input'}
                          allowCustomValue
                          placeholder={t('timeseries.annotation-editor2.placeholder-add-tags', 'Add tags')}
                          onChange={onChange}
                          tagOptions={annotationServer().tags}
                          tags={field.value}
                        />
                      );
                    }}
                  />
                </Field>
              </div>
              <div className={styles.footer}>
                <Stack justifyContent={'flex-end'}>
                  <Button size={'sm'} variant="secondary" onClick={dismiss} fill="outline">
                    <Trans i18nKey="timeseries.annotation-editor2.cancel">Cancel</Trans>
                  </Button>
                  <Button
                    size={'sm'}
                    type={'submit'}
                    disabled={stateIndicator?.loading || boundaryError != null}
                  >
                    {stateIndicator?.loading
                      ? t('timeseries.annotation-editor2.saving', 'Saving')
                      : t('timeseries.annotation-editor2.save', 'Save')}
                  </Button>
                </Stack>
              </div>
            </>
          );
        }}
      </Form>
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => {
  return {
    editor: css({
      background: theme.colors.background.elevated,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      boxShadow: theme.shadows.z3,
      userSelect: 'text',
      width: '520px',
    }),
    content: css({
      padding: theme.spacing(1),
    }),
    header: css({
      borderBottom: `1px solid ${theme.colors.border.weak}`,
      padding: theme.spacing(0.5, 1),
      fontWeight: theme.typography.fontWeightBold,
      fontSize: theme.typography.fontSize,
      color: theme.colors.text.primary,
    }),
    footer: css({
      borderTop: `1px solid ${theme.colors.border.weak}`,
      padding: theme.spacing(1, 1),
    }),
    textarea: css({
      color: theme.colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
    }),
    timeRow: css({
      display: 'flex',
      gap: theme.spacing(1),
    }),
    timeField: css({
      flex: 1,
      minWidth: 0,
    }),
    boundaryError: css({
      color: theme.colors.error.text,
      fontSize: theme.typography.bodySmall.fontSize,
      marginBottom: theme.spacing(1),
    }),
  };
};
