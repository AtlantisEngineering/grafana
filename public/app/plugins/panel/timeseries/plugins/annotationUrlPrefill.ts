import { locationService } from '@grafana/runtime';
import { type TimeRange2 } from '@grafana/ui/internal';

export interface NewAnnotationPrefill {
  text?: string;
  tags?: string[];
  // Only for existing annotations
  removeTags?: string[];
}

const URL_PARAMS = ['annotPanelId', 'annotFrom', 'annotTo', 'annotText', 'annotTags', 'annotRemoveTags', 'annotEditId'];

function readTags(params: URLSearchParams, name: string): string[] {
  return (params.get(name) ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function readPrefill(params: URLSearchParams): NewAnnotationPrefill {
  return { text: params.get('annotText') ?? undefined, tags: readTags(params, 'annotTags') };
}

/**
 * Reads a new annotation for the given panel from the URL:
 * annotPanelId, annotFrom, annotTo (epoch ms), annotText, annotTags (comma separated)
 */
export function getAnnotationUrlPrefill(panelId: number): { range: TimeRange2; prefill: NewAnnotationPrefill } | null {
  const params = locationService.getSearch();
  const fromRaw = params.get('annotFrom');
  const from = Number(fromRaw);

  if (Number(params.get('annotPanelId')) !== panelId || !fromRaw || !Number.isFinite(from)) {
    return null;
  }

  const to = Number(params.get('annotTo'));

  return {
    range: { from, to: Number.isFinite(to) && to > from ? to : from },
    prefill: readPrefill(params),
  };
}

/**
 * Reads an existing annotation to open in edit mode on the given panel (annotPanelId, annotEditId).
 * annotText is appended to its text, annotRemoveTags are removed from its tags and annotTags are added to them.
 */
export function getAnnotationUrlEdit(panelId: number): { id: number; prefill: NewAnnotationPrefill } | null {
  const params = locationService.getSearch();
  const editIdRaw = params.get('annotEditId');
  const editId = Number(editIdRaw);

  if (Number(params.get('annotPanelId')) !== panelId || !editIdRaw || !Number.isFinite(editId)) {
    return null;
  }
  return { id: editId, prefill: { ...readPrefill(params), removeTags: readTags(params, 'annotRemoveTags') } };
}

/** Editor defaults of an existing annotation with the prefill appended, skipping what is already there */
export function applyAnnotationPrefill(text: string | undefined, tags: string[], prefill?: NewAnnotationPrefill) {
  const description = text ?? '';
  const extraText = prefill?.text;
  const keptTags = tags.filter((tag) => !prefill?.removeTags?.includes(tag));
  const extraTags = (prefill?.tags ?? []).filter((tag) => !keptTags.includes(tag));

  return {
    description:
      extraText && !description.includes(extraText) ? [description, extraText].filter(Boolean).join('\n') : description,
    tags: [...keptTags, ...extraTags],
  };
}

export function clearAnnotationUrlPrefill() {
  locationService.partial(Object.fromEntries(URL_PARAMS.map((param) => [param, null])), true);
}
