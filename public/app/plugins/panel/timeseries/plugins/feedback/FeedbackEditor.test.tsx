import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { setBackendSrv, type BackendSrv } from '@grafana/runtime';
import { usePanelContext } from '@grafana/ui';
import { contextSrv } from 'app/core/services/context_srv';

import { FeedbackEditor } from './FeedbackEditor';

jest.mock('@grafana/ui', () => ({
  ...jest.requireActual('@grafana/ui'),
  usePanelContext: jest.fn(),
}));

const mockUsePanelContext = jest.mocked(usePanelContext);
const get = jest.fn();

const variables: Record<string, string> = { '${annotation_feedback_tags}': '$Component', $Component: 'Module_1' };
const replaceVariables = (value: string) =>
  Object.entries(variables).reduce((text, [name, resolved]) => text.split(name).join(resolved), value);

describe('FeedbackEditor', () => {
  const onAnnotationCreate = jest.fn().mockResolvedValue(undefined);
  const onAnnotationUpdate = jest.fn().mockResolvedValue(undefined);
  const range = { time: [1759388895560], timeEnd: [1759389095560] };

  beforeEach(() => {
    jest.clearAllMocks();
    contextSrv.user.name = 'Jan';
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    setBackendSrv({ get } as unknown as BackendSrv);
    // @ts-ignore
    mockUsePanelContext.mockReturnValue({
      onAnnotationCreate,
      onAnnotationUpdate,
      eventsScope: '',
      eventBus: jest.fn(),
    });
  });

  it('creates feedback authored by the logged in user, with the review section disabled', async () => {
    render(
      <FeedbackEditor
        annoVals={{ ...range, tags: [['M1']], id: [undefined] }}
        annoIdx={0}
        timeZone="browser"
        dismiss={jest.fn()}
        replaceVariables={replaceVariables}
      />
    );

    expect(screen.getByTestId('feedback-editor-review')).toBeDisabled();
    expect(screen.getByTestId('feedback-editor-authored-by')).toHaveValue('Jan');

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Choose a class or comment only')).toBeInTheDocument();

    await userEvent.click(screen.getByText('TP'));
    await userEvent.type(screen.getByTestId('feedback-editor-comment'), 'loose cable');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onAnnotationCreate).toHaveBeenCalledWith({
      id: undefined,
      from: 1759388895560,
      to: 1759389095560,
      tags: ['M1', 'Module_1', 'TP'],
      description: 'loose cable',
      data: { authoredBy: 'Jan' },
    });
    expect(get).not.toHaveBeenCalled();
  });

  it('reviews existing feedback, keeping its author', async () => {
    contextSrv.user.name = 'Piet';
    get.mockResolvedValue({ id: 7, data: { authoredBy: 'Jan' } });

    render(
      <FeedbackEditor
        annoVals={{ ...range, tags: [['M1', 'M1B', 'FP']], text: ['loose cable'], id: [7] }}
        annoIdx={0}
        timeZone="browser"
        dismiss={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('feedback-editor-authored-by')).toHaveValue('Jan'));
    expect(screen.getByTestId('feedback-editor-authored-by')).toBeDisabled();
    expect(screen.getByTestId('feedback-editor-review')).toBeEnabled();
    expect(screen.getByTestId('feedback-editor-reviewed-by')).toHaveValue('Piet');

    await userEvent.click(screen.getByText('Confirm'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(get).toHaveBeenCalledWith('/api/annotations/7');
    expect(onAnnotationUpdate).toHaveBeenCalledWith({
      id: 7,
      from: 1759388895560,
      to: 1759389095560,
      tags: ['M1', 'M1B', 'FP', 'Confirmed'],
      description: 'loose cable',
      data: { authoredBy: 'Jan', reviewedBy: 'Piet' },
    });
  });

  it('saves edits without a new review without touching the names', async () => {
    get.mockResolvedValue({ id: 7, data: { authoredBy: 'Jan', reviewedBy: 'Piet' } });

    render(
      <FeedbackEditor
        annoVals={{ ...range, tags: [['M1', 'TP', 'Rejected']], text: ['x'], id: [7] }}
        annoIdx={0}
        timeZone="browser"
        dismiss={jest.fn()}
      />
    );

    await waitFor(() => expect(screen.getByTestId('feedback-editor-authored-by')).toHaveValue('Jan'));
    await userEvent.click(screen.getByText('FP'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onAnnotationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['M1', 'FP', 'Rejected'], data: undefined })
    );
  });
});

describe('FeedbackEditor review on create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    contextSrv.user.name = 'Jan';
  });

  it('can review new feedback right away once the review section is turned on', async () => {
    const onAnnotationCreate = jest.fn().mockResolvedValue(undefined);
    // @ts-ignore
    mockUsePanelContext.mockReturnValue({
      onAnnotationCreate,
      onAnnotationUpdate: jest.fn(),
      eventsScope: '',
      eventBus: jest.fn(),
    });

    render(
      <FeedbackEditor
        annoVals={{ time: [1000], timeEnd: [2000], tags: [['M1']], id: [undefined] }}
        annoIdx={0}
        timeZone="browser"
        dismiss={jest.fn()}
      />
    );

    expect(screen.getByTestId('feedback-editor-review')).toBeDisabled();
    await userEvent.click(screen.getByTestId('feedback-editor-review-toggle'));
    expect(screen.getByTestId('feedback-editor-review')).toBeEnabled();

    await userEvent.click(screen.getByText('TP'));
    await userEvent.click(screen.getByText('Confirm'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onAnnotationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['M1', 'TP', 'Confirmed'], data: { authoredBy: 'Jan', reviewedBy: 'Jan' } })
    );
  });
});

describe('FeedbackEditor comment only', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    contextSrv.user.name = 'Jan';
  });

  it('saves a comment without a class tag, and needs the comment', async () => {
    const onAnnotationCreate = jest.fn().mockResolvedValue(undefined);
    // @ts-ignore
    mockUsePanelContext.mockReturnValue({
      onAnnotationCreate,
      onAnnotationUpdate: jest.fn(),
      eventsScope: '',
      eventBus: jest.fn(),
    });

    render(
      <FeedbackEditor
        annoVals={{ time: [1000], timeEnd: [2000], tags: [['M1']], id: [undefined] }}
        annoIdx={0}
        timeZone="browser"
        dismiss={jest.fn()}
      />
    );

    await userEvent.click(screen.getByText('Comment only'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Write a comment')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('feedback-editor-comment'), 'press stopped for cleaning');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onAnnotationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['M1'], description: 'press stopped for cleaning', data: { authoredBy: 'Jan' } })
    );
  });
});
