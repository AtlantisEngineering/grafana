import { locationService } from '@grafana/runtime';
import { type TimeRange2 } from '@grafana/ui/internal';

export interface NewAnnotationPrefill {
  text?: string;
  tags?: string[];
}

const URL_PARAMS = ['annotPanelId', 'annotFrom', 'annotTo', 'annotText', 'annotTags', 'annotEditId'];

function readPrefill(params: URLSearchParams): NewAnnotationPrefill {
  const tags = (params.get('annotTags') ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return { text: params.get('annotText') ?? undefined, tags };
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
 * annotText is appended to its text and annotTags are added to its tags.
 */
export function getAnnotationUrlEdit(panelId: number): { id: number; prefill: NewAnnotationPrefill } | null {
  const params = locationService.getSearch();
  const editIdRaw = params.get('annotEditId');
  const editId = Number(editIdRaw);

  if (Number(params.get('annotPanelId')) !== panelId || !editIdRaw || !Number.isFinite(editId)) {
    return null;
  }
  return { id: editId, prefill: readPrefill(params) };
}

/** Editor defaults of an existing annotation with the prefill appended, skipping what is already there */
export function applyAnnotationPrefill(text: string | undefined, tags: string[], prefill?: NewAnnotationPrefill) {
  const description = text ?? '';
  const extraText = prefill?.text;
  const extraTags = (prefill?.tags ?? []).filter((tag) => !tags.includes(tag));

  return {
    description:
      extraText && !description.includes(extraText) ? [description, extraText].filter(Boolean).join('\n') : description,
    tags: [...tags, ...extraTags],
  };
}

export function clearAnnotationUrlPrefill() {
  locationService.partial(Object.fromEntries(URL_PARAMS.map((param) => [param, null])), true);
}
