import type { Entity, EntityKind, QlooCallInfo, ResponseSource } from "../qloo/types";
import type { City, Dialect, LanguageCode } from "./locales";
import type { Phrase } from "./phrases";

export type Level = "beginner" | "intermediate" | "advanced";
export type Slot = "series" | "film" | "music" | "book" | "podcast" | "food";
export type SkipReason = "seen" | "not_for_me" | "too_hard";

export const SLOT_KIND: Record<Slot, EntityKind> = {
  series: "tv_show",
  film: "movie",
  music: "artist",
  book: "book",
  podcast: "podcast",
  food: "place",
};

export interface FavoriteInput {
  name: string;
  id?: string;
  kind?: EntityKind;
}

export interface LikeInput {
  id: string;
  name?: string;
  slot?: Slot;
}

export interface SkipInput {
  id: string;
  name?: string;
  slot?: Slot;
  reason: SkipReason;
  tagIds?: string[];
}

export interface PreviousPick {
  slot: Slot;
  id: string;
  name: string;
}

export interface LearnerInput {
  name?: string;
  language: LanguageCode;
  level: Level;
  targetCity: string;
  homeCity?: string;
  minutesPerDay: number;
  favorites: FavoriteInput[];
  likes?: LikeInput[];
  skips?: SkipInput[];
  previous?: PreviousPick[];
  /** The city the previous week leaned toward, when the learner switched cities. */
  previousCity?: string;
}

export interface ResolvedFavorite {
  input: string;
  id: string;
  name: string;
  kind: EntityKind;
  match: "given" | "exact" | "closest";
  tags: Entity["tags"];
}

export interface Contributor {
  id: string;
  name: string;
  share: number;
}

export interface PickEvidence {
  rank: number;
  of: number;
  affinity?: number;
  popularity?: number;
  contributors: Contributor[];
  sharedTags: string[];
  locality?: string;
  filters: string[];
  source: ResponseSource;
  cached?: boolean;
}

export interface Pick {
  id: string;
  slot: Slot;
  kind: EntityKind;
  name: string;
  localTitle?: string;
  year?: number;
  countries: string[];
  description?: string;
  localDescription?: string;
  image?: string;
  durationMin?: number;
  contentRating?: string;
  address?: string;
  tags: Array<{ id: string; name: string }>;
  dialect: Dialect;
  dialectNote?: string;
  evidence: PickEvidence;
  why: string;
  how: string;
  phrases: Phrase[];
  alternate?: { id: string; name: string };
  pinned?: boolean;
}

export interface Dose {
  pickId: string;
  slot: Slot;
  action: string;
  minutes: number;
  main: boolean;
  /** Listening that fits a commute or a walk; not counted in the day's sit-down minutes. */
  onTheGo?: boolean;
}

export interface Day {
  index: number;
  name: string;
  short: string;
  theme: string;
  doses: Dose[];
  minutes: number;
}

export interface AgentNote {
  kind: "info" | "adjusted" | "missing";
  text: string;
}

export interface Change {
  slot: Slot;
  from?: { id: string; name: string };
  to?: { id: string; name: string };
  reason: string;
}

export interface TraceStep {
  id: string;
  tool: string;
  title: string;
  detail: string;
  status: "ok" | "adjusted" | "skipped" | "failed";
  ms: number;
  calls: QlooCallInfo[];
}

export interface Plan {
  id: string;
  createdAt: string;
  learner: {
    name?: string;
    language: LanguageCode;
    languageName: string;
    nativeName: string;
    level: Level;
    city: City;
    homeCity?: string;
    minutesPerDay: number;
  };
  favorites: ResolvedFavorite[];
  unmatched: string[];
  taste: { tags: Array<{ id: string; name: string; weight: number }>; source: "qloo" | "favorites" };
  influence: Contributor[];
  picks: Pick[];
  days: Day[];
  usualList: string[];
  notes: AgentNote[];
  changes: Change[];
  trace: TraceStep[];
  sources: Record<ResponseSource | "cached", number>;
  mode: "live" | "fixtures";
  writer: "templates" | "workers-ai";
  intro: string;
}

export type AgentEvent =
  | { type: "step"; step: TraceStep }
  | { type: "plan"; plan: Plan }
  | { type: "notes"; writer: "workers-ai"; intro?: string; whys: Record<string, string> }
  | { type: "error"; error: { code: string; message: string; retryable: boolean } }
  | { type: "done" };
