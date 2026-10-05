// Raw shapes follow the Qloo API reference (docs.qloo.com): /search, /entities,
// /v2/insights and /v2/tags. Only the fields this app reads are typed; every
// object stays open because the API returns many more fields than we use.

export type QueryPrimitive = string | number | boolean;
export type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | null | undefined;
export type QlooQuery = Record<string, QueryValue>;

export type QlooPath = "/search" | "/entities" | "/v2/insights" | "/v2/tags";

export interface QlooRequest {
  path: QlooPath;
  query: QlooQuery;
}

export interface RawAka {
  value: string;
  languages?: string[];
}

export interface RawTag {
  id?: string;
  tag_id?: string;
  name?: string;
  type?: string;
  subtype?: string;
  types?: string[];
  tag_value?: string;
  value?: string;
  parents?: Array<{ type?: string; [key: string]: unknown }>;
  popularity?: number;
  score?: number;
  affinity?: number;
  query?: { affinity?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface RawGeocode {
  name?: string;
  city?: string;
  metro?: string;
  admin1_region?: string;
  admin2_region?: string;
  country_code?: string;
  [key: string]: unknown;
}

export interface RawEntityProperties {
  release_year?: number | string;
  release_date?: string;
  finale_year?: number;
  publication_year?: number | string;
  publication_date?: string;
  description?: string;
  short_description?: string;
  content_rating?: string;
  duration?: number;
  image?: { url?: string };
  akas?: RawAka[];
  short_descriptions?: RawAka[];
  release_country?: string[];
  geocode?: RawGeocode;
  address?: string;
  price_level?: number;
  business_rating?: number;
  [key: string]: unknown;
}

export interface RawEntity {
  name?: string;
  entity_id?: string;
  id?: string;
  type?: string;
  subtype?: string;
  types?: string[];
  properties?: RawEntityProperties;
  popularity?: number;
  tags?: RawTag[];
  query?: {
    affinity?: number;
    explainability?: unknown;
    [key: string]: unknown;
  };
  disambiguation?: string;
  external?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RawInsightsResponse {
  success?: boolean;
  results?: {
    entities?: RawEntity[];
    tags?: RawTag[];
    [key: string]: unknown;
  };
  query?: Record<string, unknown>;
  duration?: number;
  [key: string]: unknown;
}

export interface RawListResponse {
  success?: boolean;
  duration?: number;
  results?: RawEntity[] | { entities?: RawEntity[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface RawTagsResponse {
  success?: boolean;
  duration?: number;
  results?: RawTag[] | { tags?: RawTag[]; [key: string]: unknown };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Normalized shapes used by the agent and the UI.

export type EntityKind =
  | "tv_show"
  | "movie"
  | "artist"
  | "book"
  | "podcast"
  | "place"
  | "brand"
  | "person"
  | "videogame"
  | "destination"
  | "locality"
  | "other";

export interface Tag {
  id: string;
  name: string;
  type: string;
  parentTypes: string[];
  popularity?: number;
  affinity?: number;
}

export interface Contribution {
  entityId: string;
  score: number;
}

export interface LocalText {
  value: string;
  languages: string[];
}

export interface Entity {
  id: string;
  name: string;
  kind: EntityKind;
  subtype: string;
  year?: number;
  description?: string;
  image?: string;
  countries: string[];
  contentRating?: string;
  durationMin?: number;
  localTitles: LocalText[];
  localDescriptions: LocalText[];
  popularity?: number;
  affinity?: number;
  tags: Tag[];
  contributions: Contribution[];
  disambiguation?: string;
  address?: string;
  city?: string;
  priceLevel?: number;
}

export type ResponseSource = "live" | "recorded" | "simulated" | "cache";

export interface QlooCallInfo {
  path: QlooPath;
  params: Record<string, string>;
  source: ResponseSource;
  ms: number;
  results: number;
  recordedAt?: string;
}
