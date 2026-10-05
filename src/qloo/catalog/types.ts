export type CatalogKind = "tv_show" | "movie" | "artist" | "book" | "podcast" | "place";

/** Compact authoring format; index.ts expands it into Qloo-shaped entities. */
export interface CatalogItem {
  key: string;
  name: string;
  kind: CatalogKind;
  year?: number;
  finale?: number;
  /** Release countries for films and series (Qloo's properties.release_country). */
  countries?: string[];
  /** Original-language title: [title, language code]. */
  original?: [string, string];
  desc: string;
  /** One-line description in the original language: [text, language code]. */
  local?: [string, string];
  rating?: string;
  minutes?: number;
  tags: string[];
  pop: number;
  /** Simulator only: how strongly each target city's audience leans toward it. */
  cities?: Record<string, number>;
  /** Simulator only: seeds whose fans over-index on this item. */
  fans?: string[];
  by?: string;
  address?: string;
  city?: string;
}
