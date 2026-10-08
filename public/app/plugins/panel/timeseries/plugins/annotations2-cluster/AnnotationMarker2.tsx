import { css } from '@emotion/css';
import { autoUpdate } from '@floating-ui/dom';
import { useFloating } from '@floating-ui/react';
import * as React from 'react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type uPlot from 'uplot';

import {
  type ActionModel,
  type DataFrame,
  type GrafanaTheme2,
  type InterpolateFunction,
  type LinkModel,
} from '@grafana/data';
import { selectors } from '@grafana/e2e-selectors';
import { t } from '@grafana/i18n';
import { type TimeZone } from '@grafana/schema';
import { ClickOutsideWrapper, floatingUtils, useStyles2 } from '@grafana/ui';
import { getDataLinks, getFieldActions } from 'app/plugins/panel/status-history/utils';

import { type NewAnnotationPrefill } from '../annotationUrlPrefill';

import { AnnotationEditor2 } from './AnnotationEditor2';
import { AnnotationTooltip2 } from './AnnotationTooltip2';
import { AnnotationTooltip2Cluster } from './AnnotationTooltip2Cluster';
import { type AnnotationVals } from './types';

interface AnnotationMarkerProps {
  // Annotation dataframe
  frame: DataFrame;
  // The values from the annotation fields
  annoVals: AnnotationVals;
  // The value index, sometimes called rowIndex
  annoIdx: number;
  // Styles calculated from plot, e.g. calculated region width & annotation offset
  style: React.CSSProperties | null;
  // Method to close user created (wip) annotation
  exitWipEdit?: null | (() => void);
  // From PanelContext.canExecuteActions(), controls whether the user has permission to execute field actions
  canExecuteActions: boolean;
  // Sets if the user pinned via keyboard or mouse click
  setPinned: (pin: boolean) => void;
  // Current pin state
  isPinned: boolean;
  // Determines if we should display the tooltip when hovering, keeps adjacent annotations from rendering a tooltip that overlays the pinned tooltip
  showTooltipOnHover: boolean;
  timeZone: TimeZone;
  portalRoot: HTMLElement;
  replaceVariables: InterpolateFunction;
  // Used to support draggable boundary handles for WIP creation and for
  // editing an existing region annotation's start/end.
  plot?: uPlot | null;
  // Only provided for WIP markers — drives the parent's setNewRange. For
  // existing annotations the marker manages a local override instead.
  onResizeRange?: (from: number, to: number) => void;
  // Opens the editor without user interaction, e.g. when requested from the URL
  startEditing?: boolean;
  editPrefill?: NewAnnotationPrefill;
  onEditDone?: () => void;
}

export const AnnotationMarker2 = ({
  frame,
  annoVals,
  annoIdx,
  style,
  exitWipEdit,
  timeZone,
  portalRoot,
  replaceVariables,
  canExecuteActions,
  setPinned,
  showTooltipOnHover,
  isPinned,
  plot,
  onResizeRange,
  startEditing,
  editPrefill,
  onEditDone,
}: AnnotationMarkerProps) => {
  const styles = useStyles2(getStyles);
  const placement = 'bottom';
  const isRegion = annoVals?.isRegion?.[annoIdx] === true;
  const isWip = exitWipEdit != null;

  // Set when editing
  const [editAnnotationId, setEditAnnotationId] = useState(exitWipEdit != null ? annoIdx : null);
  const [isHovering, setIsHovering] = useState(false);
  const startEditId = startEditing ? annoVals.id?.[annoIdx] : undefined;

  useEffect(() => {
    if (startEditId != null) {
      setEditAnnotationId(startEditId);
    }
  }, [startEditId]);

  const isClustering =
    annoVals.isCluster?.[annoIdx] && annoVals.clusterIdx?.[annoIdx] != null && annoVals.clusterIdx?.[annoIdx] > -1;
  // Live override of (time, timeEnd) for the marker's primary annotation
  // while the editor is open. Drag-handles update this for existing
  // (non-WIP) annotations so the bar can visually track the drag before
  // the user commits the change via Save.
  const [liveOverride, setLiveOverride] = useState<{ time: number; timeEnd: number | null } | null>(null);

  const { refs, floatingStyles } = useFloating({
    open: true,
    placement,
    middleware: floatingUtils.getPositioningMiddleware(placement),
    whileElementsMounted: autoUpdate,
    strategy: 'fixed',
  });

  const onClose = () => {
    setPinned(false);
    setIsHovering(false);
  };
  const links: LinkModel[] = [];
  const actions: ActionModel[] = [];

  if (isHovering || isPinned) {
    frame.fields.forEach((field) => {
      // Since field overrides are not yet supported for annotation frames, every value in the field will have the same links... except the clustering index because it's generated on-the-fly and not had getFieldOverrides called on it
      const annotationIndexForLinks = isClustering ? 0 : annoIdx;

      // @todo https://github.com/grafana/grafana/issues/119619, need to set getLinks on field, or applyFieldOverrides on dataframe
      links.push(...getDataLinks(field, annotationIndexForLinks));

      if (canExecuteActions) {
        actions.push(...getFieldActions(frame, field, replaceVariables, annotationIndexForLinks));
      }
    });
  }

  const isEditing = editAnnotationId !== null;
  const showTooltip = (isPinned && !isEditing) || (showTooltipOnHover && isHovering && !isEditing);

  // We cannot use the array index for editing annotations since clustered and wip annotations will get sorted by date, so we need to grab them by the 'id' field which is populated by the annotations API
  const annoId = annoVals?.id?.[annoIdx];
  const _editIdx = annoVals?.id?.findIndex((annoId) => annoId === editAnnotationId);
  // wip will not have an id to set, so we need to pass in the raw idx of this annotation, as long as wip is not already clustered, this should continue to work
  const editIdx = _editIdx !== undefined && _editIdx > -1 ? _editIdx : annoIdx;

  // Boundary sync (drag handles, editor inputs, live override) is only safe
  // when the marker visually represents the annotation being edited. For a
  // cluster child being edited, the marker is the cluster — not the child —
  // so we'd be moving the wrong bar.
  const canSyncBoundaries = isEditing && editIdx === annoIdx;
  const canDragResize = isRegion && plot != null && canSyncBoundaries;

  // Clear any stale override when the editor closes (Cancel/Save).
  useEffect(() => {
    if (!isEditing) {
      setLiveOverride(null);
    }
  }, [isEditing]);

  const baseTime = annoVals.time[annoIdx];
  const baseTimeEnd = annoVals.timeEnd?.[annoIdx] != null ? annoVals.timeEnd[annoIdx] : null;
  const liveTime = liveOverride?.time ?? baseTime;
  const liveTimeEnd = liveOverride !== null ? liveOverride.timeEnd : baseTimeEnd;

  const dispatchResize = useCallback(
    (from: number, to: number | null) => {
      if (isWip && onResizeRange) {
        onResizeRange(from, to ?? from);
      } else {
        setLiveOverride({ time: from, timeEnd: to });
      }
    },
    [isWip, onResizeRange]
  );

  let contents: ReactNode | null = null;
  if (!isEditing && showTooltip && isClustering) {
    contents = (
      <AnnotationTooltip2Cluster
        actions={actions}
        links={links}
        onClose={onClose}
        isPinned={isPinned}
        annoIdx={annoIdx}
        annoVals={annoVals}
        timeZone={timeZone}
        onEdit={(annotationId: number) => setEditAnnotationId(annotationId)}
      />
    );
  } else if (showTooltip) {
    contents = (
      <AnnotationTooltip2
        annoIdx={annoIdx}
        annoVals={annoVals}
        timeZone={timeZone}
        onClose={onClose}
        isPinned={isPinned}
        onEdit={annoId !== undefined ? () => setEditAnnotationId(annoId) : undefined}
        links={links}
        actions={actions}
      />
    );
  } else if (isEditing) {
    contents = (
      <AnnotationEditor2
        annoIdx={editIdx}
        annoVals={annoVals}
        timeZone={timeZone}
        liveTime={canSyncBoundaries ? liveTime : undefined}
        liveTimeEnd={canSyncBoundaries ? liveTimeEnd : undefined}
        onTimeRangeChange={canSyncBoundaries ? dispatchResize : undefined}
        prefill={editPrefill}
        dismiss={() => {
          exitWipEdit?.();
          onEditDone?.();
          setEditAnnotationId(null);
          onClose();
        }}
      />
    );
  }

  // Drag-resize logic for region boundary handles (works for WIP and any
  // existing annotation being edited, as long as the marker visually
  // represents the annotation under edit — see canSyncBoundaries).
  //
  // The handle <div>s render visually above the chart, but uPlot's own
  // mousedown listener on .u-over runs in the capture phase and would start
  // its own drag-select before our element-level onMouseDown ever fires
  // (the chart "shifts left/right" symptom). To win, we attach a
  // document-level capture-phase mousedown listener — document is higher in
  // the capture chain than .u-over, so it runs first and we can
  // stopImmediatePropagation() before uPlot sees the event.
  const liveTimeRef = useRef(liveTime);
  liveTimeRef.current = liveTime;
  const liveTimeEndRef = useRef(liveTimeEnd);
  liveTimeEndRef.current = liveTimeEnd;
  const dispatchResizeRef = useRef(dispatchResize);
  dispatchResizeRef.current = dispatchResize;

  useEffect(() => {
    if (!canDragResize || !plot) {
      return;
    }
    const HIT_TOLERANCE = 12;

    const onDocMouseDown = (ev: MouseEvent) => {
      if (ev.button !== 0) {
        return;
      }
      const plotRect = plot.over.getBoundingClientRect();
      const x = ev.clientX - plotRect.left;
      const y = ev.clientY - plotRect.top;
      if (x < 0 || x > plotRect.width || y < 0 || y > plotRect.height) {
        return;
      }

      const startTime = liveTimeRef.current;
      const endTime = liveTimeEndRef.current ?? startTime;
      const leftPx = plot.valToPos(startTime, 'x');
      const rightPx = plot.valToPos(endTime, 'x');

      let edge: 'start' | 'end' | null = null;
      if (Math.abs(x - leftPx) <= HIT_TOLERANCE) {
        edge = 'start';
      } else if (Math.abs(x - rightPx) <= HIT_TOLERANCE) {
        edge = 'end';
      }
      if (edge == null) {
        return;
      }

      // Intercept before uPlot's .u-over mousedown listener fires.
      ev.preventDefault();
      ev.stopImmediatePropagation();

      const onMove = (mv: MouseEvent) => {
        const mx = mv.clientX - plotRect.left;
        const newTime = plot.posToVal(mx, 'x');
        if (newTime == null || !Number.isFinite(newTime)) {
          return;
        }
        const cb = dispatchResizeRef.current;
        if (edge === 'start') {
          cb(Math.min(newTime, endTime), endTime);
        } else {
          cb(startTime, Math.max(newTime, startTime));
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('mouseup', onUp, true);
      };

      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    };

    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown, true);
    };
  }, [canDragResize, plot]);

  // Override the parent-computed style while a live (non-WIP) drag has moved
  // the boundaries. Parent recomputes from base values, so we patch left/width
  // locally so the bar visually tracks the drag until save/cancel.
  let effectiveStyle = style;
  if (
    !isWip &&
    liveOverride !== null &&
    plot != null &&
    style != null &&
    isRegion &&
    liveOverride.timeEnd != null
  ) {
    const left = Math.round(plot.valToPos(liveOverride.time, 'x')) || 0;
    const right = Math.round(plot.valToPos(liveOverride.timeEnd, 'x')) || 0;
    const clampedLeft = Math.max(0, left);
    const clampedRight = Math.min(plot.rect.width, right);
    effectiveStyle = { ...style, left: clampedLeft, width: clampedRight - clampedLeft };
  }

  return (
    <button
      aria-label={
        isRegion
          ? t('timeseries.annotation-marker.annotation-region-label', 'Annotation region')
          : t('timeseries.annotation-marker.annotation-label', 'Annotation')
      }
      ref={refs.setReference}
      className={isRegion ? styles.annoRegion : styles.annoMarker}
      style={effectiveStyle!}
      onFocus={() => setIsHovering(true)}
      onBlur={() => setIsHovering(false)}
      onClick={() => setPinned(true)}
      onMouseEnter={() => showTooltipOnHover && setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      data-testid={selectors.pages.Dashboard.Annotations.marker}
    >
      {canDragResize && (
        <>
          {/* Visual-only cues; the actual drag is handled by a document-level
              capture listener (see useEffect above) so it can run before
              uPlot's own .u-over mousedown listener. */}
          <div
            className={styles.dragHandleLeft}
            data-testid="annotation-resize-handle-start"
            aria-label={t(
              'timeseries.annotation-marker.resize-start',
              'Drag to adjust annotation start'
            )}
          />
          <div
            className={styles.dragHandleRight}
            data-testid="annotation-resize-handle-end"
            aria-label={t(
              'timeseries.annotation-marker.resize-end',
              'Drag to adjust annotation end'
            )}
          />
        </>
      )}
      {contents &&
        createPortal(
          <div ref={refs.setFloating} className={styles.annoBox} style={floatingStyles} data-testid="annotation-marker">
            <ClickOutsideWrapper includeButtonPress={false} useCapture={true} onClick={() => setPinned(false)}>
              {contents}
            </ClickOutsideWrapper>
          </div>,
          portalRoot
        )}
    </button>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  annoMarker: css({
    position: 'absolute',
    width: 0,
    height: 0,
    border: 'none',
    borderLeft: '5px solid transparent',
    borderRight: '5px solid transparent',
    borderBottomWidth: '5px',
    borderBottomStyle: 'solid',
    transform: 'translateX(-50%)',
    cursor: 'pointer',
    zIndex: 1,
    padding: 0,
    background: 'none',
  }),
  annoRegion: css({
    border: 'none',
    position: 'absolute',
    height: '5px',
    cursor: 'pointer',
    zIndex: 1,
    padding: 0,
    background: 'none',
  }),
  // NOTE: shares much with TooltipPlugin2
  annoBox: css({
    top: 0,
    left: 0,
    zIndex: theme.zIndex.tooltip,
    borderRadius: theme.shape.radius.default,
    position: 'absolute',
    background: theme.colors.background.primary,
    border: `1px solid ${theme.colors.border.weak}`,
    boxShadow: theme.shadows.z2,
    userSelect: 'text',
    minWidth: '300px',
  }),
  dragHandleLeft: css({
    position: 'absolute',
    top: '-200px',
    left: '-3px',
    width: '6px',
    height: '200px',
    // Visible cue + ew-resize cursor on hover. The actual drag is captured
    // by a document-level mousedown listener (see useEffect above), so
    // this element doesn't need its own onMouseDown.
    cursor: 'ew-resize',
    background: theme.colors.primary.main,
    opacity: 0.5,
    borderRadius: theme.shape.radius.default,
    zIndex: 2,
    ':hover': {
      opacity: 0.8,
    },
  }),
  dragHandleRight: css({
    position: 'absolute',
    top: '-200px',
    right: '-3px',
    width: '6px',
    height: '200px',
    cursor: 'ew-resize',
    background: theme.colors.primary.main,
    opacity: 0.5,
    borderRadius: theme.shape.radius.default,
    zIndex: 2,
    ':hover': {
      opacity: 0.8,
    },
  }),
});
