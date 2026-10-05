import { getLocale, type LanguageCode } from "./agent/locales";
import type { FavoriteInput, LearnerInput, Level, LikeInput, PreviousPick, SkipInput, SkipReason, Slot } from "./agent/types";
import type { EntityKind } from "./qloo/types";

const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const SLOTS: Slot[] = ["series", "film", "music", "book", "podcast", "food"];
const REASONS: SkipReason[] = ["seen", "not_for_me", "too_hard"];
const KINDS: EntityKind[] = ["tv_show", "movie", "artist", "book", "podcast", "place", "brand", "person", "videogame", "destination"];
const ID = /^[A-Za-z0-9:_-]{6,80}$/;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function id(value: unknown): string | undefined {
  return typeof value === "string" && ID.test(value) ? value : undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function array(value: unknown, max: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

export function parseLearner(body: unknown, options: { offlineOnly: boolean }): Parsed<LearnerInput> {
  if (!body || typeof body !== "object") return { ok: false, error: "Send the learner profile as JSON." };
  const raw = body as Record<string, unknown>;
  const pack = typeof raw.language === "string" ? getLocale(raw.language) : undefined;
  if (!pack) return { ok: false, error: "Pick a language." };
  if (options.offlineOnly && !pack.offline) {
    return { ok: false, error: `${pack.name} needs the live Qloo API. The offline demo covers Spanish, French, Japanese and Korean.` };
  }
  const level = oneOf(raw.level, LEVELS) ?? "intermediate";
  const cityRaw = text(raw.targetCity, 40);
  const targetCity = pack.cities.some((c) => c.slug === cityRaw) ? cityRaw! : pack.cities[0]!.slug;
  const minutes = Number(raw.minutesPerDay);
  const minutesPerDay = Number.isFinite(minutes) ? Math.round(Math.min(120, Math.max(10, minutes))) : 30;

  const favorites: FavoriteInput[] = [];
  for (const item of array(raw.favorites, 8)) {
    if (typeof item === "string") {
      const name = text(item, 120);
      if (name) favorites.push({ name });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = text(record.name, 120);
    if (!name) continue;
    const favorite: FavoriteInput = { name };
    const favoriteId = id(record.id);
    if (favoriteId) favorite.id = favoriteId;
    const kind = oneOf(record.kind, KINDS);
    if (kind) favorite.kind = kind;
    favorites.push(favorite);
  }
  if (favorites.length === 0) return { ok: false, error: "Add at least one thing you love: a show, an artist, a book or a film." };

  const likes: LikeInput[] = [];
  for (const item of array(raw.likes, 24)) {
    const record = (item ?? {}) as Record<string, unknown>;
    const likeId = id(record.id);
    if (!likeId) continue;
    const like: LikeInput = { id: likeId };
    const name = text(record.name, 120);
    if (name) like.name = name;
    const slot = oneOf(record.slot, SLOTS);
    if (slot) like.slot = slot;
    likes.push(like);
  }

  const skips: SkipInput[] = [];
  for (const item of array(raw.skips, 40)) {
    const record = (item ?? {}) as Record<string, unknown>;
    const skipId = id(record.id);
    if (!skipId) continue;
    const skip: SkipInput = { id: skipId, reason: oneOf(record.reason, REASONS) ?? "not_for_me" };
    const name = text(record.name, 120);
    if (name) skip.name = name;
    const slot = oneOf(record.slot, SLOTS);
    if (slot) skip.slot = slot;
    const tagIds = array(record.tagIds, 12).filter((t): t is string => typeof t === "string" && t.startsWith("urn:tag:") && t.length < 120);
    if (tagIds.length) skip.tagIds = tagIds;
    skips.push(skip);
  }

  const previous: PreviousPick[] = [];
  for (const item of array(raw.previous, 24)) {
    const record = (item ?? {}) as Record<string, unknown>;
    const prevId = id(record.id);
    const slot = oneOf(record.slot, SLOTS);
    const name = text(record.name, 120);
    if (prevId && slot && name) previous.push({ id: prevId, slot, name });
  }

  const learner: LearnerInput = {
    language: pack.code as LanguageCode,
    level,
    targetCity,
    minutesPerDay,
    favorites,
  };
  const name = text(raw.name, 40);
  if (name) learner.name = name;
  const homeCity = text(raw.homeCity, 60);
  if (homeCity) learner.homeCity = homeCity;
  if (likes.length) learner.likes = likes;
  if (skips.length) learner.skips = skips;
  if (previous.length) learner.previous = previous;
  return { ok: true, value: learner };
}
