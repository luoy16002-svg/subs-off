import type {
  Contribution,
  Entity,
  EntityKind,
  LocalText,
  RawAka,
  RawEntity,
  RawInsightsResponse,
  RawListResponse,
  RawTag,
  RawTagsResponse,
  Tag,
} from "./types";

const KINDS: EntityKind[] = [
  "tv_show",
  "movie",
  "artist",
  "book",
  "podcast",
  "place",
  "brand",
  "person",
  "videogame",
  "destination",
  "locality",
];

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function kindFromUrn(urn: string | undefined): EntityKind {
  if (!urn) return "other";
  const tail = urn.replace(/^urn:entity:/, "");
  if (tail === "video_game") return "videogame";
  return (KINDS as string[]).includes(tail) ? (tail as EntityKind) : "other";
}

export function urnForKind(kind: EntityKind): string {
  return `urn:entity:${kind}`;
}

function entitySubtype(raw: RawEntity): string {
  if (typeof raw.subtype === "string" && raw.subtype.startsWith("urn:entity:")) return raw.subtype;
  if (typeof raw.type === "string" && raw.type.startsWith("urn:entity:") && raw.type !== "urn:entity") return raw.type;
  const fromTypes = Array.isArray(raw.types) ? raw.types.find((t) => typeof t === "string" && t.startsWith("urn:entity:")) : undefined;
  return fromTypes ?? "urn:entity";
}

export function parseTag(raw: RawTag): Tag | undefined {
  const id = str(raw.id) ?? str(raw.tag_id) ?? str(raw.tag_value) ?? str(raw.value);
  if (!id) return undefined;
  const name = str(raw.name) ?? prettifyTagId(id);
  const type = str(raw.type) ?? str(raw.subtype) ?? tagTypeFromId(id);
  const parentTypes = new Set<string>();
  if (Array.isArray(raw.parents)) {
    for (const parent of raw.parents) {
      const t = str(asRecord(parent)?.type);
      if (t) parentTypes.add(t);
    }
  }
  if (Array.isArray(raw.types)) {
    for (const t of raw.types) if (typeof t === "string" && t.startsWith("urn:entity:")) parentTypes.add(t);
  }
  const tag: Tag = { id, name, type, parentTypes: [...parentTypes] };
  const popularity = num(raw.popularity);
  if (popularity !== undefined) tag.popularity = popularity;
  const affinity = num(raw.affinity) ?? num(raw.score) ?? num(asRecord(raw.query)?.affinity);
  if (affinity !== undefined) tag.affinity = affinity;
  return tag;
}

export function tagTypeFromId(id: string): string {
  const parts = id.split(":");
  // urn:tag:<kind>:<domain>:<value...>
  return parts.length >= 4 ? parts.slice(0, 4).join(":") : id;
}

export function prettifyTagId(id: string): string {
  const last = id.split(":").pop() ?? id;
  return last
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function localTexts(value: unknown): LocalText[] {
  if (!Array.isArray(value)) return [];
  const out: LocalText[] = [];
  for (const item of value as RawAka[]) {
    const text = str(item?.value);
    if (!text) continue;
    const languages = Array.isArray(item.languages) ? item.languages.filter((l): l is string => typeof l === "string") : [];
    out.push({ value: text, languages });
  }
  return out;
}

/**
 * Pulls per-signal contributions out of `query.explainability`.
 * The reference documents the meaning (which input entities contributed, scored
 * 0-1) but not one fixed layout, so this walks the object and accepts the
 * layouts we have seen: arrays of {entity_id, score} objects, nested under a
 * signal key or not, and plain {entity_id: score} maps.
 */
export function parseContributions(explainability: unknown): Contribution[] {
  const found = new Map<string, number>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 5 || node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    const id = str(record.entity_id) ?? str(record.id) ?? str(record.entity) ?? str(record.qloo_id);
    const score = num(record.score) ?? num(record.value) ?? num(record.contribution) ?? num(record.impact) ?? num(record.weight);
    if (id && score !== undefined) {
      found.set(id, Math.max(found.get(id) ?? 0, score));
      return;
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === "warning") continue;
      const direct = num(value);
      if (direct !== undefined && UUID_LIKE.test(key)) {
        found.set(key, Math.max(found.get(key) ?? 0, direct));
        continue;
      }
      visit(value, depth + 1);
    }
  };
  visit(explainability, 0);
  return [...found.entries()]
    .map(([entityId, score]) => ({ entityId, score }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function parseEntity(raw: RawEntity): Entity | undefined {
  const id = str(raw.entity_id) ?? str(raw.id);
  const name = str(raw.name);
  if (!id || !name) return undefined;
  const props = asRecord(raw.properties) ?? {};
  const subtype = entitySubtype(raw);
  const geocode = asRecord(props.geocode);
  const image = str(asRecord(props.image)?.url);
  const year =
    num(props.release_year) ??
    num(props.publication_year) ??
    yearFrom(str(props.release_date)) ??
    yearFrom(str(props.publication_date));
  const tags: Tag[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw.tags)) {
    for (const rawTag of raw.tags) {
      const tag = parseTag(rawTag);
      if (tag && !seen.has(tag.id)) {
        seen.add(tag.id);
        tags.push(tag);
      }
    }
  }
  const query = asRecord(raw.query);
  const entity: Entity = {
    id,
    name,
    kind: kindFromUrn(subtype),
    subtype,
    countries: Array.isArray(props.release_country) ? props.release_country.filter((c): c is string => typeof c === "string") : [],
    localTitles: localTexts(props.akas),
    localDescriptions: localTexts(props.short_descriptions),
    tags,
    contributions: parseContributions(query?.explainability),
  };
  if (year !== undefined) entity.year = year;
  const description = str(props.description) ?? str(props.short_description);
  if (description) entity.description = description;
  if (image) entity.image = image;
  const rating = str(props.content_rating);
  if (rating) entity.contentRating = rating;
  const duration = num(props.duration);
  if (duration !== undefined) entity.durationMin = duration;
  const popularity = num(raw.popularity);
  if (popularity !== undefined) entity.popularity = popularity;
  const affinity = num(query?.affinity) ?? num(raw.affinity);
  if (affinity !== undefined) entity.affinity = affinity;
  const disambiguation = str(raw.disambiguation);
  if (disambiguation) entity.disambiguation = disambiguation;
  const address = str(props.address);
  if (address) entity.address = address;
  const city = str(geocode?.city) ?? str(geocode?.name);
  if (city) entity.city = city;
  const price = num(props.price_level);
  if (price !== undefined) entity.priceLevel = price;
  return entity;
}

function yearFrom(date: string | undefined): number | undefined {
  const match = date ? /^(\d{4})/.exec(date) : null;
  return match ? Number(match[1]) : undefined;
}

/** /search and /entities return either `results: [...]` or `results: {entities: [...]}`. */
export function listEntities(body: unknown): Entity[] {
  const response = asRecord(body) as RawListResponse | undefined;
  const results = response?.results;
  const raw = Array.isArray(results) ? results : Array.isArray(asRecord(results)?.entities) ? (asRecord(results)!.entities as RawEntity[]) : [];
  return raw.map(parseEntity).filter((e): e is Entity => e !== undefined);
}

export function insightsEntities(body: unknown): Entity[] {
  const response = asRecord(body) as RawInsightsResponse | undefined;
  const raw = response?.results?.entities;
  return Array.isArray(raw) ? raw.map(parseEntity).filter((e): e is Entity => e !== undefined) : [];
}

export function insightsTags(body: unknown): Tag[] {
  const response = asRecord(body) as RawInsightsResponse | undefined;
  const raw = response?.results?.tags;
  return Array.isArray(raw) ? raw.map(parseTag).filter((t): t is Tag => t !== undefined) : [];
}

export function listTags(body: unknown): Tag[] {
  const response = asRecord(body) as RawTagsResponse | undefined;
  const results = response?.results;
  const raw = Array.isArray(results) ? results : Array.isArray(asRecord(results)?.tags) ? (asRecord(results)!.tags as RawTag[]) : [];
  return raw.map(parseTag).filter((t): t is Tag => t !== undefined);
}

/** The locality Qloo matched for a location query, when it reports one. */
export function matchedLocality(body: unknown): string | undefined {
  const query = asRecord(asRecord(body)?.query);
  const locality = asRecord(query?.locality);
  const signal = asRecord(locality?.signal) ?? asRecord(locality?.filter) ?? locality;
  return str(signal?.name);
}
