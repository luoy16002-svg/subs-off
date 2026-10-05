// Recorded responses are bundled into the Worker, so they are trimmed before
// saving. The structure and key names stay exactly as Qloo returned them;
// only fields this app never reads are dropped, and long multilingual lists
// keep the languages the app supports.

const LANGUAGES = new Set(["en", "es", "fr", "ja", "ko", "pt", "it", "de"]);

const ENTITY_KEYS = new Set(["name", "entity_id", "id", "type", "subtype", "types", "popularity", "disambiguation", "tags", "query", "properties", "affinity"]);

const PROPERTY_KEYS = new Set([
  "release_year",
  "release_date",
  "finale_year",
  "publication_year",
  "publication_date",
  "description",
  "short_description",
  "content_rating",
  "duration",
  "image",
  "release_country",
  "akas",
  "short_descriptions",
  "geocode",
  "address",
  "price_level",
  "business_rating",
]);

const GEOCODE_KEYS = new Set(["name", "city", "metro", "admin1_region", "admin2_region", "country_code"]);
const TAG_KEYS = new Set(["id", "tag_id", "name", "type", "subtype", "types", "tag_value", "value", "parents", "popularity", "score", "affinity", "query"]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function pick(source: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) if (keys.has(key)) out[key] = value;
  return out;
}

function localTexts(value: unknown, max: number): unknown {
  if (!Array.isArray(value)) return value;
  return value
    .filter((item) => {
      const languages = record(item)?.languages;
      return Array.isArray(languages) && languages.some((l) => typeof l === "string" && LANGUAGES.has(l.split("-")[0]!));
    })
    .slice(0, max);
}

function pruneTag(value: unknown): unknown {
  const tag = record(value);
  if (!tag) return value;
  const out = pick(tag, TAG_KEYS);
  if (Array.isArray(out.parents)) out.parents = out.parents.slice(0, 12).map((p) => (record(p) ? pick(record(p)!, new Set(["type", "id", "name"])) : p));
  return out;
}

export function pruneEntity(value: unknown): unknown {
  const entity = record(value);
  if (!entity) return value;
  const out = pick(entity, ENTITY_KEYS);
  const props = record(out.properties);
  if (props) {
    const kept = pick(props, PROPERTY_KEYS);
    if ("akas" in kept) kept.akas = localTexts(kept.akas, 8);
    if ("short_descriptions" in kept) kept.short_descriptions = localTexts(kept.short_descriptions, 6);
    const geocode = record(kept.geocode);
    if (geocode) kept.geocode = pick(geocode, GEOCODE_KEYS);
    if (typeof kept.description === "string" && kept.description.length > 600) kept.description = `${kept.description.slice(0, 597)}...`;
    out.properties = kept;
  }
  if (Array.isArray(out.tags)) out.tags = out.tags.slice(0, 30).map(pruneTag);
  return out;
}

/** Trims one Qloo response body while keeping its layout. */
export function pruneBody(body: unknown): unknown {
  const root = record(body);
  if (!root) return body;
  const out: Record<string, unknown> = {};
  for (const key of ["success", "duration", "query"]) if (key in root) out[key] = root[key];
  const results = root.results;
  if (Array.isArray(results)) {
    out.results = results.map(pruneEntity);
  } else if (record(results)) {
    const r = record(results)!;
    const kept: Record<string, unknown> = {};
    if (Array.isArray(r.entities)) kept.entities = r.entities.map(pruneEntity);
    if (Array.isArray(r.tags)) kept.tags = r.tags.map(pruneTag);
    for (const [key, value] of Object.entries(r)) if (!(key in kept) && key !== "entities" && key !== "tags") kept[key] = value;
    out.results = kept;
  } else if (results !== undefined) {
    out.results = results;
  }
  return out;
}
