import { fnv1a } from "../query";
import type { RawEntity, RawTag } from "../types";
import { FRENCH } from "./fr";
import { JAPANESE } from "./ja";
import { KOREAN } from "./ko";
import { SEEDS } from "./seeds";
import { SPANISH } from "./es";
import type { CatalogItem } from "./types";
import { VOCAB, vocab, type VocabTag } from "./vocab";

export type { CatalogItem } from "./types";

export const ALL_ITEMS: CatalogItem[] = [...SEEDS, ...SPANISH, ...JAPANESE, ...KOREAN, ...FRENCH];

/** Deterministic, well-formed uppercase UUID derived from a catalog key. */
export function stableUuid(key: string): string {
  const parts = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((seed) => fnv1a(key, seed).toString(16).padStart(8, "0"));
  const hex = parts.join("");
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

const CITY_GEO: Record<string, { country_code: string; admin1_region?: string }> = {
  Chicago: { country_code: "US", admin1_region: "IL" },
  "New York": { country_code: "US", admin1_region: "NY" },
  London: { country_code: "GB" },
  Toronto: { country_code: "CA", admin1_region: "ON" },
};

export interface CatalogRecord {
  item: CatalogItem;
  id: string;
  raw: RawEntity;
  tagIds: string[];
  fanIds: string[];
}

export interface Catalog {
  records: CatalogRecord[];
  byId: Map<string, CatalogRecord>;
  byKey: Map<string, CatalogRecord>;
  tags: VocabTag[];
  tagById: Map<string, VocabTag>;
}

function rawTag(tag: VocabTag): RawTag {
  return { id: tag.id, name: tag.name, type: tag.type };
}

function rawEntity(item: CatalogItem, id: string): RawEntity {
  const properties: NonNullable<RawEntity["properties"]> = { description: item.desc };
  if (item.year !== undefined) {
    if (item.kind === "book") properties.publication_year = item.year;
    else properties.release_year = item.year;
  }
  if (item.finale !== undefined) properties.finale_year = item.finale;
  if (item.rating) properties.content_rating = item.rating;
  if (item.minutes) properties.duration = item.minutes;
  if (item.countries && (item.kind === "tv_show" || item.kind === "movie")) properties.release_country = [...item.countries];
  if (item.original) properties.akas = [{ value: item.original[0], languages: [item.original[1]] }];
  if (item.local) properties.short_descriptions = [{ value: item.local[0], languages: [item.local[1]] }];
  if (item.kind === "place" && item.city) {
    properties.address = item.address ?? item.city;
    properties.geocode = { name: item.city, city: item.city, ...(CITY_GEO[item.city] ?? {}) };
  }
  const entity: RawEntity = {
    name: item.name,
    entity_id: id,
    type: "urn:entity",
    subtype: `urn:entity:${item.kind}`,
    properties,
    popularity: item.pop,
    tags: item.tags.map((key) => rawTag(vocab(key))),
  };
  const disambiguation = [item.year ? String(item.year) : undefined, item.by].filter(Boolean).join(", ");
  if (disambiguation) entity.disambiguation = disambiguation;
  return entity;
}

export function buildCatalog(items: CatalogItem[] = ALL_ITEMS): Catalog {
  const byKey = new Map<string, CatalogRecord>();
  const records: CatalogRecord[] = [];
  for (const item of items) {
    if (byKey.has(item.key)) throw new Error(`Duplicate catalog key: ${item.key}`);
    const id = stableUuid(item.key);
    const record: CatalogRecord = { item, id, raw: rawEntity(item, id), tagIds: item.tags.map((key) => vocab(key).id), fanIds: [] };
    byKey.set(item.key, record);
    records.push(record);
  }
  for (const record of records) {
    record.fanIds = (record.item.fans ?? []).map((key) => {
      const target = byKey.get(key);
      if (!target) throw new Error(`Unknown fan link ${key} on ${record.item.key}`);
      return target.id;
    });
  }
  const tags = Object.values(VOCAB);
  return {
    records,
    byId: new Map(records.map((record) => [record.id, record])),
    byKey,
    tags,
    tagById: new Map(tags.map((tag) => [tag.id, tag])),
  };
}

let shared: Catalog | undefined;

/** The default catalog, built once per process or Worker isolate. */
export function defaultCatalog(): Catalog {
  shared ??= buildCatalog();
  return shared;
}
