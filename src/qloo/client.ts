import { insightsEntities, insightsTags, listEntities, listTags, matchedLocality, urnForKind } from "./parse";
import { canonicalParams } from "./query";
import type { GetOptions, QlooTransport, TransportResult } from "./transport";
import type { Entity, EntityKind, QlooCallInfo, QlooPath, QlooQuery, Tag } from "./types";

export interface Called<T> {
  data: T;
  call: QlooCallInfo;
}

export interface InsightsResult {
  entities: Entity[];
  tags: Tag[];
  locality?: string;
}

/**
 * Typed access to the four Qloo endpoints this app uses. Every method returns
 * the parsed data plus a call record (path, parameters, source, timing) that
 * the agent shows in its trace. The API key never appears in a call record.
 */
export class QlooClient {
  readonly transport: QlooTransport;

  constructor(transport: QlooTransport) {
    this.transport = transport;
  }

  async #get(path: QlooPath, query: QlooQuery, options?: GetOptions): Promise<{ result: TransportResult; params: Record<string, string> }> {
    const params = canonicalParams(query);
    const result = await this.transport.get({ path, query }, options);
    return { result, params };
  }

  #call(path: QlooPath, params: Record<string, string>, result: TransportResult, count: number): QlooCallInfo {
    const call: QlooCallInfo = { path, params, source: result.source, ms: result.ms, results: count };
    if (result.recordedAt) call.recordedAt = result.recordedAt;
    return call;
  }

  async search(query: string, options: { kinds?: EntityKind[]; take?: number } = {}, getOptions?: GetOptions): Promise<Called<Entity[]>> {
    const q: QlooQuery = { query, take: options.take ?? 6 };
    if (options.kinds && options.kinds.length > 0) q.types = options.kinds.map(urnForKind);
    const { result, params } = await this.#get("/search", q, getOptions);
    const data = listEntities(result.body);
    return { data, call: this.#call("/search", params, result, data.length) };
  }

  async entities(ids: string[], getOptions?: GetOptions): Promise<Called<Entity[]>> {
    const { result, params } = await this.#get("/entities", { entity_ids: ids }, getOptions);
    const data = listEntities(result.body);
    return { data, call: this.#call("/entities", params, result, data.length) };
  }

  async insights(query: QlooQuery, getOptions?: GetOptions): Promise<Called<InsightsResult>> {
    const { result, params } = await this.#get("/v2/insights", query, getOptions);
    const entities = insightsEntities(result.body);
    const tags = insightsTags(result.body);
    const data: InsightsResult = { entities, tags };
    const locality = matchedLocality(result.body);
    if (locality) data.locality = locality;
    return { data, call: this.#call("/v2/insights", params, result, entities.length + tags.length) };
  }

  /**
   * Semantic tag search. Like the kit's own resolver, this sends only the
   * query and scopes candidates locally by their `parents` metadata, because
   * `filter.parents.types` means audience categories on Qloo's lookup routes.
   */
  async tags(query: string, options: { forKind?: EntityKind; take?: number } = {}, getOptions?: GetOptions): Promise<Called<Tag[]>> {
    const q: QlooQuery = { "filter.query": query, "feature.semantic_search": true, take: options.take ?? 15 };
    const { result, params } = await this.#get("/v2/tags", q, getOptions);
    let data = listTags(result.body);
    if (options.forKind) {
      const urn = urnForKind(options.forKind);
      const withParents = data.filter((tag) => tag.parentTypes.length > 0);
      if (withParents.length > 0) data = withParents.filter((tag) => tag.parentTypes.includes(urn));
    }
    return { data, call: this.#call("/v2/tags", params, result, data.length) };
  }
}
