import { store } from '@grafana/data';
import { getBackendSrv, locationService } from '@grafana/runtime';
import { type TimeRange2 } from '@grafana/ui/internal';
import { contextSrv } from 'app/core/services/context_srv';

export interface NewAnnotationPrefill {
  text?: string;
  tags?: string[];
  // Only for existing annotations
  removeTags?: string[];
  // Key of the annotation's data field that takes the name of the person saving it, e.g. submittedBy
  nameKey?: string;
  // Default the name to the logged in user instead of the last name typed in this browser
  nameAuto?: boolean;
}

const URL_PARAMS = ['annotPanelId', 'annotFrom', 'annotTo', 'annotText', 'annotTags', 'annotRemoveTags', 'annotEditId', 'annotNameKey', 'annotNameAuto'];

function readTags(params: URLSearchParams, name: string): string[] {
  return (params.get(name) ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function readPrefill(params: URLSearchParams): NewAnnotationPrefill {
  return {
    text: params.get('annotText') ?? undefined,
    tags: readTags(params, 'annotTags'),
    nameKey: params.get('annotNameKey') || undefined,
    nameAuto: params.get('annotNameAuto') === '1',
  };
}

/**
 * Reads a new annotation for the given panel from the URL:
 * annotPanelId, annotFrom, annotTo (epoch ms), annotText, annotTags (comma separated), annotNameKey, annotNameAuto
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

const NAME_STORAGE_KEY = 'grafana.annotations.editorName';

/** Label of the name input, e.g. submittedBy -> Submitted by */
export function getAnnotationNameLabel(nameKey: string): string {
  const words = nameKey.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function getDefaultAnnotationName(prefill?: NewAnnotationPrefill): string {
  if (prefill?.nameAuto) {
    return contextSrv.user.name || contextSrv.user.login || '';
  }
  return store.get(NAME_STORAGE_KEY) ?? '';
}

/**
 * Data to save with an annotation so that it records the name under nameKey.
 * Data already stored on the annotation is kept, since an update replaces the whole field.
 */
export async function buildAnnotationData(
  id: number | string | null | undefined,
  nameKey: string | undefined,
  name: string | undefined
): Promise<Record<string, unknown> | undefined> {
  if (!nameKey || !name) {
    return undefined;
  }
  store.set(NAME_STORAGE_KEY, name);

  const existing = id != null ? (await getBackendSrv().get(`/api/annotations/${id}`))?.data : undefined;
  return { ...(existing ?? {}), [nameKey]: name };
}
