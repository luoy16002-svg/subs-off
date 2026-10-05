import { defaultCatalog, stableUuid, type Catalog, type CatalogRecord } from "./catalog";
import { TASTE_WEIGHT, type VocabTag } from "./catalog/vocab";
import { QlooError } from "./errors";
import { canonicalParams, fnv1a } from "./query";
import type { QlooRequest, RawEntity, RawTag } from "./types";

/**
 * An offline stand-in for the Qloo API. It answers /search, /entities,
 * /v2/tags and /v2/insights from a small hand-written catalog, in the same
 * response shapes as the live API, so the whole app runs without a key.
 * Its scores are a rough tag-overlap model, not Qloo's taste graph.
 */

interface Locality {
  slug: string;
  name: string;
  aliases?: string[];
}

const LOCALITIES: Locality[] = [
  { slug: "mexico-city", name: "Mexico City", aliases: ["cdmx", "ciudad de mexico", "mexico df"] },
  { slug: "madrid", name: "Madrid" },
  { slug: "buenos-aires", name: "Buenos Aires" },
  { slug: "bogota", name: "Bogotá" },
  { slug: "tokyo", name: "Tokyo" },
  { slug: "osaka", name: "Osaka" },
  { slug: "seoul", name: "Seoul" },
  { slug: "busan", name: "Busan" },
  { slug: "paris", name: "Paris" },
  { slug: "montreal", name: "Montréal" },
  { slug: "sao-paulo", name: "São Paulo" },
  { slug: "rio-de-janeiro", name: "Rio de Janeiro" },
  { slug: "lisbon", name: "Lisbon" },
  { slug: "rome", name: "Rome" },
  { slug: "milan", name: "Milan" },
  { slug: "berlin", name: "Berlin" },
  { slug: "vienna", name: "Vienna" },
  { slug: "munich", name: "Munich" },
  { slug: "chicago", name: "Chicago" },
  { slug: "new-york", name: "New York", aliases: ["new york city", "nyc", "manhattan"] },
  { slug: "london", name: "London" },
  { slug: "toronto", name: "Toronto" },
  { slug: "los-angeles", name: "Los Angeles", aliases: ["la"] },
  { slug: "san-francisco", name: "San Francisco", aliases: ["sf"] },
  { slug: "seattle", name: "Seattle" },
  { slug: "austin", name: "Austin" },
  { slug: "boston", name: "Boston" },
  { slug: "sydney", name: "Sydney" },
  { slug: "melbourne", name: "Melbourne" },
  { slug: "dublin", name: "Dublin" },
];

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9぀-ヿ一-鿿가-힯]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

export function findLocality(query: string): Locality | undefined {
  const q = normalizeText(query);
  if (!q) return undefined;
  return LOCALITIES.find((loc) => normalizeText(loc.name) === q || loc.slug.replace(/-/g, " ") === q || (loc.aliases ?? []).includes(q))
    ?? LOCALITIES.find((loc) => q.startsWith(normalizeText(loc.name)) || q.includes(normalizeText(loc.name)));
}

function list(params: Record<string, string>, key: string): string[] {
  const value = params[key];
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function int(params: Record<string, string>, key: string, fallback: number, min: number, max: number): number {
  const parsed = Number(params[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function tagWeight(tag: VocabTag | undefined): number {
  if (!tag) return 1;
  const kind = tag.type.replace(/^urn:tag:/, "");
  return TASTE_WEIGHT[kind] ?? 1;
}

function duration(seed: string): number {
  return 12 + (fnv1a(seed) % 40);
}

export class QlooSimulator {
  readonly catalog: Catalog;

  constructor(catalog: Catalog = defaultCatalog()) {
    this.catalog = catalog;
  }

  answer(request: QlooRequest): unknown {
    const params = canonicalParams(request.query);
    switch (request.path) {
      case "/search":
        return this.#search(params);
      case "/entities":
        return this.#entities(params);
      case "/v2/tags":
        return this.#tags(params);
      case "/v2/insights":
        return this.#insights(params);
      default:
        throw new QlooError("QLOO_NOT_FOUND", `The offline catalog does not answer ${request.path}.`, { status: 404 });
    }
  }

  #search(params: Record<string, string>) {
    const query = params.query ?? "";
    const q = normalizeText(query);
    const types = list(params, "types");
    const take = int(params, "take", 10, 1, 50);
    const qTokens = tokens(query);
    const scored: Array<{ record: CatalogRecord; score: number }> = [];
    if (q) {
      for (const record of this.catalog.records) {
        if (types.length > 0 && !types.includes(record.raw.subtype ?? "")) continue;
        const names = [record.item.name, record.item.original?.[0]].filter((n): n is string => Boolean(n)).map(normalizeText);
        let score = 0;
        for (const name of names) {
          if (name === q) score = Math.max(score, 3);
          else if (name.startsWith(q)) score = Math.max(score, 2.2);
          else if (qTokens.every((t) => name.split(" ").some((w) => w.startsWith(t)))) score = Math.max(score, 1.6);
          else if (name.includes(q)) score = Math.max(score, 1.2);
        }
        if (record.item.by && normalizeText(record.item.by).includes(q)) score = Math.max(score, 0.9);
        if (score > 0) scored.push({ record, score: score * (0.7 + 0.3 * record.item.pop) });
      }
    }
    scored.sort((a, b) => b.score - a.score || a.record.item.key.localeCompare(b.record.item.key));
    return {
      success: true,
      duration: duration(`search:${q}`),
      results: scored.slice(0, take).map(({ record }) => structuredClone(record.raw)),
    };
  }

  #entities(params: Record<string, string>) {
    const ids = list(params, "entity_ids");
    const entities = ids.map((id) => this.catalog.byId.get(id)?.raw).filter((raw): raw is RawEntity => Boolean(raw)).map((raw) => structuredClone(raw));
    return { success: true, duration: duration(`entities:${ids.join(",")}`), results: { entities } };
  }

  #tags(params: Record<string, string>) {
    const query = params["filter.query"] ?? "";
    const qTokens = tokens(query);
    const parentTypes = list(params, "filter.parents.types");
    const tagTypes = list(params, "filter.tag.types");
    const take = int(params, "take", 20, 1, 50);
    const scored: Array<{ tag: VocabTag; score: number }> = [];
    for (const tag of this.catalog.tags) {
      if (parentTypes.length > 0 && !tag.parents.some((p) => parentTypes.includes(p))) continue;
      if (tagTypes.length > 0 && !tagTypes.some((t) => tag.type.startsWith(t))) continue;
      const nameTokens = tokens(tag.name);
      if (qTokens.length === 0) {
        scored.push({ tag, score: 0.1 });
        continue;
      }
      const hits = qTokens.filter((t) => nameTokens.some((n) => n === t || (t.length > 3 && n.startsWith(t)) || (n.length > 3 && t.startsWith(n)))).length;
      if (hits === 0) continue;
      const covered = nameTokens.filter((n) => qTokens.some((t) => n === t || n.startsWith(t) || t.startsWith(n))).length / nameTokens.length;
      const exact = normalizeText(tag.name) === normalizeText(query) ? 1 : 0;
      scored.push({ tag, score: hits / qTokens.length + 0.5 * covered + exact });
    }
    scored.sort((a, b) => b.score - a.score || a.tag.name.localeCompare(b.tag.name));
    return {
      success: true,
      duration: duration(`tags:${query}`),
      results: {
        tags: scored.slice(0, take).map(({ tag }) => ({
          tag_id: tag.id,
          name: tag.name,
          type: tag.type,
          parents: tag.parents.map((type) => ({ type })),
          popularity: Math.round((0.4 + (fnv1a(tag.id) % 600) / 1000) * 1000) / 1000,
        })),
      },
    };
  }

  #insights(params: Record<string, string>) {
    const filterType = params["filter.type"];
    if (!filterType) throw new QlooError("QLOO_BAD_REQUEST", "filter.type is required", { status: 400 });

    const signalIds = list(params, "signal.interests.entities");
    const signalTags = list(params, "signal.interests.tags");
    const signals = signalIds.map((id) => this.catalog.byId.get(id)).filter((r): r is CatalogRecord => Boolean(r));

    let signalLocality: Locality | undefined;
    if (params["signal.location.query"]) {
      signalLocality = findLocality(params["signal.location.query"]);
      if (!signalLocality) throw new QlooError("QLOO_BAD_REQUEST", `No locality matched "${params["signal.location.query"]}".`, { status: 400 });
    }
    let filterLocality: Locality | undefined;
    if (params["filter.location.query"]) {
      filterLocality = findLocality(params["filter.location.query"]);
      if (!filterLocality) throw new QlooError("QLOO_BAD_REQUEST", `No locality matched "${params["filter.location.query"]}".`, { status: 400 });
    }

    const hasSignal = signalIds.length > 0 || signalTags.length > 0 || Boolean(signalLocality);
    const hasFilter = Object.keys(params).some((key) => key.startsWith("filter.") && key !== "filter.type");
    if (!hasSignal && !hasFilter) {
      throw new QlooError("QLOO_BAD_REQUEST", "at least one valid signal or filter is required", { status: 400 });
    }

    const queryMeta: Record<string, unknown> = {};
    if (signalLocality) queryMeta.locality = { signal: this.#localityEntity(signalLocality) };
    else if (filterLocality) queryMeta.locality = { filter: this.#localityEntity(filterLocality) };

    if (filterType === "urn:tag") {
      return { success: true, duration: duration(`tag:${signalIds.join(",")}`), results: { tags: this.#tasteTags(signals, params) }, query: queryMeta };
    }
    if (!filterType.startsWith("urn:entity:")) {
      return { success: true, duration: 9, results: { entities: [] }, query: queryMeta };
    }

    const pool = this.#candidatePool(filterType, params, filterLocality);
    const take = int(params, "take", 20, 1, 50);
    const page = int(params, "page", 1, 1, 100);
    const offset = params.offset !== undefined ? int(params, "offset", 0, 0, 1000) : (page - 1) * take;
    const explain = params["feature.explainability"] === "true";

    const scored = pool.map((record) => {
      const perSignal = signals.map((signal) => ({ signal, score: this.#similarity(signal, record) }));
      const known = perSignal.length;
      const mean = known > 0 ? perSignal.reduce((sum, s) => sum + s.score, 0) / known : 0;
      const tagHit = signalTags.length > 0 ? signalTags.filter((t) => record.tagIds.includes(t)).length / signalTags.length : 0;
      const local = signalLocality ? record.item.cities?.[signalLocality.slug] ?? 0 : 0;
      const raw = mean + 0.3 * tagHit + 0.22 * local + 0.08 * record.item.pop;
      const affinity = Math.round(Math.min(0.999, 0.32 + 0.66 * Math.tanh(raw * 1.5)) * 10000) / 10000;
      return { record, affinity, perSignal };
    });
    scored.sort((a, b) => b.affinity - a.affinity || b.record.item.pop - a.record.item.pop || a.record.item.key.localeCompare(b.record.item.key));

    const window = scored.slice(offset, offset + take);
    const entities = window.map(({ record, affinity, perSignal }) => {
      const entity = structuredClone(record.raw);
      const query: Record<string, unknown> = { affinity };
      if (explain && perSignal.length > 0) {
        const total = perSignal.reduce((sum, s) => sum + s.score, 0);
        const contributions = perSignal
          .map(({ signal, score }) => ({ entity_id: signal.id, score: total > 0 ? Math.round((score / total) * 1000) / 1000 : 0 }))
          .filter((c) => c.score >= 0.05)
          .sort((a, b) => b.score - a.score);
        query.explainability = { "signal.interests.entities": contributions };
      }
      entity.query = query;
      return entity;
    });

    if (explain && signals.length > 0) {
      queryMeta.explainability = {
        "signal.interests.entities": signals.map((signal) => {
          const shareAt = (n: number) => {
            const slice = scored.slice(0, n);
            if (slice.length === 0) return 0;
            const shares = slice.map(({ perSignal }) => {
              const total = perSignal.reduce((sum, s) => sum + s.score, 0);
              const mine = perSignal.find((s) => s.signal.id === signal.id)?.score ?? 0;
              return total > 0 ? mine / total : 0;
            });
            return Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 1000) / 1000;
          };
          return { entity_id: signal.id, average_score: { top_3: shareAt(3), top_5: shareAt(5), top_10: shareAt(10), all: shareAt(scored.length) } };
        }),
      };
    }

    return { success: true, duration: duration(`insights:${JSON.stringify(params)}`), results: { entities }, query: queryMeta };
  }

  #localityEntity(locality: Locality) {
    return { entity_id: stableUuid(`locality/${locality.slug}`), name: locality.name, subtype: "urn:entity:locality" };
  }

  #candidatePool(filterType: string, params: Record<string, string>, filterLocality: Locality | undefined): CatalogRecord[] {
    const countries = list(params, "filter.release_country");
    const countryOp = params["operator.filter.release_country"] === "intersection" ? "intersection" : "union";
    const tags = list(params, "filter.tags");
    const tagOp = params["operator.filter.tags"] === "intersection" ? "intersection" : "union";
    const excludeTags = list(params, "filter.exclude.tags");
    const excludeIds = new Set(list(params, "filter.exclude.entities"));
    const onlyIds = list(params, "filter.results.entities");
    const ratings = list(params, "filter.content_rating");
    const popMin = params["filter.popularity.min"] !== undefined ? Number(params["filter.popularity.min"]) : undefined;
    const popMax = params["filter.popularity.max"] !== undefined ? Number(params["filter.popularity.max"]) : undefined;
    const yearMin = params["filter.release_year.min"] !== undefined ? Number(params["filter.release_year.min"]) : undefined;
    const yearMax = params["filter.release_year.max"] !== undefined ? Number(params["filter.release_year.max"]) : undefined;

    return this.catalog.records.filter((record) => {
      const { item } = record;
      if (record.raw.subtype !== filterType) return false;
      if (excludeIds.has(record.id)) return false;
      if (onlyIds.length > 0 && !onlyIds.includes(record.id)) return false;
      if (countries.length > 0) {
        const own = item.countries ?? [];
        const ok = countryOp === "union" ? countries.some((c) => own.includes(c)) : countries.every((c) => own.includes(c));
        if (!ok) return false;
      }
      if (tags.length > 0) {
        const ok = tagOp === "union" ? tags.some((t) => record.tagIds.includes(t)) : tags.every((t) => record.tagIds.includes(t));
        if (!ok) return false;
      }
      if (excludeTags.length > 0 && excludeTags.some((t) => record.tagIds.includes(t))) return false;
      if (ratings.length > 0 && !(item.rating && ratings.includes(item.rating))) return false;
      if (popMin !== undefined && item.pop < popMin) return false;
      if (popMax !== undefined && item.pop > popMax) return false;
      if (yearMin !== undefined && (item.year ?? 0) < yearMin) return false;
      if (yearMax !== undefined && (item.year ?? 9999) > yearMax) return false;
      if (filterLocality) {
        if (item.kind !== "place") return true;
        if (!item.city || normalizeText(item.city) !== normalizeText(filterLocality.name)) return false;
      }
      return true;
    });
  }

  #similarity(signal: CatalogRecord, candidate: CatalogRecord): number {
    const signalTags = new Set(signal.tagIds);
    let shared = 0;
    let signalNorm = 0;
    let candidateNorm = 0;
    for (const id of signal.tagIds) signalNorm += tagWeight(this.catalog.tagById.get(id)) ** 2;
    for (const id of candidate.tagIds) {
      const w = tagWeight(this.catalog.tagById.get(id));
      candidateNorm += w ** 2;
      if (signalTags.has(id)) shared += w ** 2;
    }
    const cosine = signalNorm > 0 && candidateNorm > 0 ? shared / Math.sqrt(signalNorm * candidateNorm) : 0;
    const fan = candidate.fanIds.includes(signal.id) ? 0.45 : 0;
    return cosine + fan;
  }

  #tasteTags(signals: CatalogRecord[], params: Record<string, string>): RawTag[] {
    const take = int(params, "take", 20, 1, 50);
    const parentTypes = list(params, "filter.parents.types");
    const tagTypes = list(params, "filter.tag.types");
    const scores = new Map<string, number>();
    for (const signal of signals) {
      for (const id of signal.tagIds) {
        const tag = this.catalog.tagById.get(id);
        scores.set(id, (scores.get(id) ?? 0) + tagWeight(tag) / Math.max(1, signals.length));
      }
    }
    const ranked = [...scores.entries()]
      .map(([id, score]) => ({ tag: this.catalog.tagById.get(id)!, score }))
      .filter(({ tag }) => tag && (parentTypes.length === 0 || tag.parents.some((p) => parentTypes.includes(p))))
      .filter(({ tag }) => tagTypes.length === 0 || tagTypes.some((t) => tag.type.startsWith(t)))
      .sort((a, b) => b.score - a.score || a.tag.name.localeCompare(b.tag.name));
    const top = ranked[0]?.score ?? 1;
    return ranked.slice(0, take).map(({ tag, score }) => ({
      tag_id: tag.id,
      name: tag.name,
      types: [...tag.parents],
      subtype: tag.type,
      tag_value: tag.id,
      query: { affinity: Math.round((score / top) * 1000) / 1000 },
    }));
  }
}
