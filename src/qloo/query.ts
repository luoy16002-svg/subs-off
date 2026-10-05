import type { QlooPath, QlooQuery, QlooRequest } from "./types";

// Parameters whose comma-separated values form a set. Sorting them gives one
// canonical request per question, so caches and recorded fixtures line up.
const SET_PARAMS = new Set([
  "signal.interests.entities",
  "signal.interests.tags",
  "filter.exclude.entities",
  "filter.exclude.tags",
  "filter.tags",
  "filter.release_country",
  "filter.results.entities",
  "filter.parents.types",
  "filter.tag.types",
  "entity_ids",
  "types",
]);

function serializeValue(key: string, value: QlooQuery[string]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item).trim())
      .filter((item) => item.length > 0);
    if (items.length === 0) return undefined;
    const unique = [...new Set(items)];
    if (SET_PARAMS.has(key)) unique.sort();
    return unique.join(",");
  }
  const text = String(value).trim();
  if (text === "") return undefined;
  if (SET_PARAMS.has(key) && text.includes(",")) {
    return [...new Set(text.split(",").map((item) => item.trim()).filter(Boolean))].sort().join(",");
  }
  return text;
}

/** Flattens a query into sorted string pairs, dropping empty values. */
export function canonicalParams(query: QlooQuery): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(query).sort()) {
    const serialized = serializeValue(key, query[key]);
    if (serialized !== undefined) out[key] = serialized;
  }
  return out;
}

/** A stable key for one GET request: path plus sorted, canonical parameters. */
export function requestKey(request: QlooRequest): string {
  const params = new URLSearchParams(canonicalParams(request.query));
  const text = params.toString();
  return text ? `${request.path}?${text}` : request.path;
}

export function buildUrl(baseUrl: string, path: QlooPath, query: QlooQuery): URL {
  const base = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(canonicalParams(query))) {
    url.searchParams.set(key, value);
  }
  return url;
}

/** Small, dependency-free FNV-1a hash used for cache keys and stable ids. */
export function fnv1a(text: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function shortHash(text: string): string {
  const a = fnv1a(text).toString(16).padStart(8, "0");
  const b = fnv1a(text, 0x01000193).toString(16).padStart(8, "0");
  return `${a}${b}`;
}
