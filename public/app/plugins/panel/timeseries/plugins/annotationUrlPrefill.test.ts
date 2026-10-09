import { locationService } from '@grafana/runtime';

import {
  applyAnnotationPrefill,
  clearAnnotationUrlPrefill,
  getAnnotationUrlEdit,
  getAnnotationUrlPrefill,
} from './annotationUrlPrefill';

describe('annotationUrlPrefill', () => {
  it('reads a region annotation for the matching panel', () => {
    locationService.push('/d/abc?annotPanelId=6&annotFrom=1000&annotTo=2000&annotText=TP%20from%20email&annotTags=M1,%20TP');

    expect(getAnnotationUrlPrefill(6)).toEqual({
      range: { from: 1000, to: 2000 },
      prefill: { text: 'TP from email', tags: ['M1', 'TP'] },
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
      prefill: { text: undefined, tags: [] },
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
      prefill: { text: 'Reviewed by: ', tags: ['Confirmed'], removeTags: [] },
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
