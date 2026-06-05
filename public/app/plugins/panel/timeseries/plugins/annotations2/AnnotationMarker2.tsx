import { css } from '@emotion/css';
import { autoUpdate } from '@floating-ui/dom';
import { useFloating } from '@floating-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as React from 'react';
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

import { AnnotationEditor2 } from './AnnotationEditor2';
import { AnnotationTooltip2 } from './AnnotationTooltip2';

interface AnnotationMarkerProps {
  // Annotation dataframe
  frame: DataFrame;
  // The values from the annotation fields
  annoVals: Record<string, any[]>;
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
  plot?: uPlot | null;
  onResizeRange?: (from: number, to: number) => void;
}

const STATE_DEFAULT = 0;
const STATE_EDITING = 1;

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
}: AnnotationMarkerProps) => {
  const styles = useStyles2(getStyles);
  const placement = 'bottom';
  const isRegion = annoVals?.isRegion?.[annoIdx] === true;
  const isWip = exitWipEdit != null;

  const [state, setState] = useState(exitWipEdit != null ? STATE_EDITING : STATE_DEFAULT);
  const [isHovering, setIsHovering] = useState(false);
  // Live override of (time, timeEnd) while the editor is open. Allows
  // drag-handles to reposition an existing (non-WIP) annotation visually
  // before the user clicks Save. WIP markers route resizes through the
  // parent's setNewRange instead — the override is only used for existing.
  const [liveOverride, setLiveOverride] = useState<{ time: number; timeEnd: number | null } | null>(null);
  const isEditing = state === STATE_EDITING;
  const canDragResize = isRegion && plot != null && isEditing;

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
      // @todo https://github.com/grafana/grafana/issues/119619, need to set getLinks on field, or applyFieldOverrides on dataframe
      links.push(...getDataLinks(field, annoIdx));

      if (canExecuteActions) {
        actions.push(...getFieldActions(frame, field, replaceVariables, annoIdx));
      }
    });
  }

  // Is the annotation being edited
  const showEditor = state === STATE_EDITING;
  // Is the tooltip pinned and not being edited
  const isTooltipPinned = isPinned && !showEditor;
  // Is the tooltip hovered and another tooltip is not pinned and not being edited
  const isTooltipHovered = showTooltipOnHover && isHovering && !showEditor;
  // Show the tooltip if pinned or hovered
  const showTooltip = isTooltipPinned || isTooltipHovered;

  const contents = showTooltip ? (
    <AnnotationTooltip2
      annoIdx={annoIdx}
      annoVals={annoVals}
      timeZone={timeZone}
      onClose={onClose}
      isPinned={isPinned}
      onEdit={() => setState(STATE_EDITING)}
      links={links}
      actions={actions}
    />
  ) : showEditor ? (
    <AnnotationEditor2
      annoIdx={annoIdx}
      annoVals={annoVals}
      timeZone={timeZone}
      liveTime={liveTime}
      liveTimeEnd={liveTimeEnd}
      onTimeRangeChange={dispatchResize}
      dismiss={() => {
        exitWipEdit?.();
        setState(STATE_DEFAULT);
        onClose();
      }}
    />
  ) : null;

  // Drag-resize for region boundaries while the editor is open (WIP or
  // existing). See the matching comment in the annotations2-cluster marker
  // for why we use a document-level capture listener instead of an
  // onMouseDown on the handle element itself.
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
          {/* Visual cues only — the actual drag is handled by a document-level
              capture listener so it can run before uPlot's .u-over mousedown
              listener. */}
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
