import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { setBackendSrv, type BackendSrv } from '@grafana/runtime';
import { usePanelContext } from '@grafana/ui';

import { FeedbackTooltip } from './FeedbackTooltip';

jest.mock('@grafana/ui', () => ({
  ...jest.requireActual('@grafana/ui'),
  usePanelContext: jest.fn(),
}));

const mockUsePanelContext = jest.mocked(usePanelContext);
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const panelContext = (context: object) => context as ReturnType<typeof usePanelContext>;
const get = jest.fn();

describe('FeedbackTooltip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    setBackendSrv({ get } as unknown as BackendSrv);
    mockUsePanelContext.mockReturnValue(panelContext({ canEditAnnotations: () => true }));
  });

  it('shows class, review, people and the conversation', async () => {
    get.mockResolvedValue({
      id: 7,
      data: {
        authoredBy: 'Jan',
        reviewedBy: 'Piet',
        comments: [{ by: 'Piet', at: 1759388895560, action: 'Rejected', text: 'tool was changed' }],
      },
    });
    const onEdit = jest.fn();

    render(
      <FeedbackTooltip
        annoVals={{
          id: [7],
          time: [1759388895560],
          timeEnd: [1759389095560],
          tags: [['M1', 'M1B', 'FP', 'Rejected']],
          text: ['loose cable'],
        }}
        annoIdx={0}
        timeZone="browser"
        isPinned={true}
        onClose={jest.fn()}
        onEdit={onEdit}
      />
    );

    expect(screen.getByText('FP')).toBeInTheDocument();
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);
    expect(screen.getByText('M1B')).toBeInTheDocument();
    expect(screen.getByText('loose cable')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('tool was changed')).toBeInTheDocument());
    expect(screen.getByText('Jan')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Reply / review' }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('marks unreviewed feedback and hides editing without permission', async () => {
    get.mockResolvedValue({ id: 8, data: {} });
    mockUsePanelContext.mockReturnValue(panelContext({ canEditAnnotations: () => false }));

    render(
      <FeedbackTooltip
        annoVals={{ id: [8], time: [1000], tags: [['M1', 'TP']], text: ['x'] }}
        annoIdx={0}
        timeZone="browser"
        isPinned={false}
        onClose={jest.fn()}
        onEdit={jest.fn()}
      />
    );

    expect(screen.getByText('Not reviewed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply / review' })).not.toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/annotations/8'));
  });

  it('closes without the click reaching the marker', async () => {
    get.mockResolvedValue({ id: 9, data: {} });
    const onClose = jest.fn();
    const onMarkerClick = jest.fn();

    render(
      <div onClick={onMarkerClick}>
        <FeedbackTooltip
          annoVals={{ id: [9], time: [1000], tags: [['TP']], text: ['x'] }}
          annoIdx={0}
          timeZone="browser"
          isPinned={true}
          onClose={onClose}
        />
      </div>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(onMarkerClick).not.toHaveBeenCalled();
  });

  it('deletes the feedback after confirming', async () => {
    get.mockResolvedValue({ id: 10, data: {} });
    const onAnnotationDelete = jest.fn();
    mockUsePanelContext.mockReturnValue(panelContext({ canDeleteAnnotations: () => true, onAnnotationDelete }));

    render(
      <FeedbackTooltip
        annoVals={{ id: [10], time: [1000], tags: [['TP']], text: ['x'] }}
        annoIdx={0}
        timeZone="browser"
        isPinned={true}
        onClose={jest.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete feedback' }));
    expect(onAnnotationDelete).toHaveBeenCalledWith('10');
  });
});
