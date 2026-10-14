import { store } from '@grafana/data';
import { locationService, setBackendSrv, type BackendSrv } from '@grafana/runtime';

import {
  applyAnnotationPrefill,
  buildAnnotationData,
  clearAnnotationUrlPrefill,
  getAnnotationNameLabel,
  getAnnotationUrlEdit,
  getAnnotationUrlPrefill,
} from './annotationUrlPrefill';

describe('annotationUrlPrefill', () => {
  it('reads a region annotation for the matching panel', () => {
    locationService.push('/d/abc?annotPanelId=6&annotFrom=1000&annotTo=2000&annotText=TP%20from%20email&annotTags=M1,%20TP');

    expect(getAnnotationUrlPrefill(6)).toEqual({
      range: { from: 1000, to: 2000 },
      prefill: { text: 'TP from email', tags: ['M1', 'TP'], nameKey: undefined, nameAuto: false },
    });
  });

  it('ignores other panels and missing start', () => {
    locationService.push('/d/abc?annotPanelId=6&annotFrom=1000');
    expect(getAnnotationUrlPrefill(7)).toBeNull();

    locationService.push('/d/abc?annotPanelId=6&annotTo=2000');
    expect(getAnnotationUrlPrefill(6)).toBeNull();
  });

  it('falls back to a point annotation without a valid end', () => {
    locationService.push('/d/abc?annotPanelId=6&annotFrom=1000&annotTo=500');

    expect(getAnnotationUrlPrefill(6)).toEqual({
      range: { from: 1000, to: 1000 },
      prefill: { text: undefined, tags: [], nameKey: undefined, nameAuto: false },
    });
  });

  it('clears only its own params', () => {
    locationService.push('/d/abc?from=1&annotPanelId=6&annotFrom=1000&annotTags=TP');
    clearAnnotationUrlPrefill();

    expect(locationService.getLocation().search).toBe('?from=1');
  });
});

describe('getAnnotationUrlEdit', () => {
  it('reads the annotation id for the matching panel', () => {
    locationService.push('/d/abc?annotPanelId=6&annotEditId=42&annotText=Reviewed%20by%3A%20&annotTags=Confirmed');

    expect(getAnnotationUrlEdit(6)).toEqual({
      id: 42,
      prefill: { text: 'Reviewed by: ', tags: ['Confirmed'], removeTags: [], nameKey: undefined, nameAuto: false },
    });
    expect(getAnnotationUrlEdit(7)).toBeNull();
  });

  it('is cleared with the other params', () => {
    locationService.push('/d/abc?from=1&annotPanelId=6&annotEditId=42');
    clearAnnotationUrlPrefill();

    expect(locationService.getLocation().search).toBe('?from=1');
  });
});

describe('applyAnnotationPrefill', () => {
  it('appends text on a new line and adds missing tags', () => {
    expect(applyAnnotationPrefill('TP from email', ['M1', 'TP'], { text: 'Reviewed by: ', tags: ['TP', 'Confirmed'] })).toEqual({
      description: 'TP from email\nReviewed by: ',
      tags: ['M1', 'TP', 'Confirmed'],
    });
  });

  it('removes tags before adding the new ones', () => {
    expect(applyAnnotationPrefill('x', ['M1', 'TP'], { tags: ['FP', 'Confirmed'], removeTags: ['TP', 'FN'] }).tags).toEqual([
      'M1',
      'FP',
      'Confirmed',
    ]);
  });

  it('does not append text that is already there', () => {
    expect(applyAnnotationPrefill('TP\nReviewed by: Jan', [], { text: 'Reviewed by: ' }).description).toBe(
      'TP\nReviewed by: Jan'
    );
  });

  it('leaves the annotation as is without a prefill', () => {
    expect(applyAnnotationPrefill(undefined, ['TP'])).toEqual({ description: '', tags: ['TP'] });
  });
});

describe('annotation name', () => {
  const get = jest.fn();

  beforeEach(() => {
    get.mockReset();
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    setBackendSrv({ get } as unknown as BackendSrv);
    store.delete('grafana.annotations.editorName');
  });

  it('reads the name key from the url and clears it', () => {
    locationService.push('/d/abc?annotPanelId=6&annotFrom=1000&annotNameKey=submittedBy&annotNameAuto=1');

    expect(getAnnotationUrlPrefill(6)?.prefill).toMatchObject({ nameKey: 'submittedBy', nameAuto: true });

    clearAnnotationUrlPrefill();
    expect(locationService.getLocation().search).toBe('');
  });

  it('labels the input from the key', () => {
    expect(getAnnotationNameLabel('submittedBy')).toBe('Submitted by');
    expect(getAnnotationNameLabel('reviewed_by')).toBe('Reviewed by');
  });

  it('stores the name under the key for a new annotation', async () => {
    await expect(buildAnnotationData(undefined, 'submittedBy', 'Jan')).resolves.toEqual({ submittedBy: 'Jan' });
    expect(get).not.toHaveBeenCalled();
    expect(store.get('grafana.annotations.editorName')).toBe('Jan');
  });

  it('keeps the data an existing annotation already has', async () => {
    get.mockResolvedValue({ id: 42, data: { submittedBy: 'Jan' } });

    await expect(buildAnnotationData(42, 'reviewedBy', 'Piet')).resolves.toEqual({
      submittedBy: 'Jan',
      reviewedBy: 'Piet',
    });
    expect(get).toHaveBeenCalledWith('/api/annotations/42');
  });

  it('sends no data without a name key', async () => {
    await expect(buildAnnotationData(42, undefined, 'Piet')).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });
});
