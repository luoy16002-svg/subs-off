import type { Entity, Tag } from "../qloo/types";
import type { Level, SkipInput, Slot } from "./types";

// Light re-ranking on top of Qloo's order. Qloo's rank carries most of the
// weight; level fit and the learner's skips only reorder near neighbours.

const EASY = /animation|anime|comedy|sitcom|reality|cooking|baking|family|kids|slice of life|romantic comedy|cozy|gentle|warm|language learning|fable|short read|pop\b|k-pop|j-pop|upbeat/i;
const HARD = /period|courtroom|procedural|legal|literary fiction|classic literature|philosoph|experimental|magical realism|slow burn|anthology|detective fiction/i;
const UNSAFE = /politic|election|propaganda|erotic|porn|adult content|xxx/i;

export function isSafe(entity: Entity): boolean {
  if (UNSAFE.test(entity.name)) return false;
  return !entity.tags.some((tag) => UNSAFE.test(tag.name));
}

export function levelFit(entity: Entity, slot: Slot, level: Level, tooHard: boolean): number {
  const names = entity.tags.map((tag) => tag.name);
  const easy = names.filter((name) => EASY.test(name)).length;
  const hard = names.filter((name) => HARD.test(name)).length;
  const learnerPodcast = names.some((name) => /language learning|learn /i.test(name));
  let fit = 0;
  const wantsEasy = level === "beginner" || tooHard;
  if (wantsEasy) {
    fit += Math.min(easy, 3) * 0.06 - Math.min(hard, 3) * 0.08;
    if (slot === "series" && entity.durationMin !== undefined && entity.durationMin <= 30) fit += 0.08;
    if (slot === "series" && entity.durationMin !== undefined && entity.durationMin >= 70) fit -= 0.06;
    if (slot === "film" && entity.durationMin !== undefined && entity.durationMin > 140) fit -= 0.06;
    if (slot === "podcast" && learnerPodcast) fit += 0.3;
    if (slot === "book" && names.some((name) => /short read|fable/i.test(name))) fit += 0.12;
  } else if (level === "intermediate") {
    if (slot === "podcast" && learnerPodcast) fit += 0.08;
    if (slot === "book" && names.some((name) => /short read/i.test(name))) fit += 0.05;
  } else {
    if (slot === "podcast" && learnerPodcast) fit -= 0.2;
    fit += Math.min(hard, 2) * 0.02;
  }
  return Math.max(-0.3, Math.min(0.35, fit));
}

/** Tags that set a skipped item apart from the learner's favourites. */
export function distinctiveTags(skipped: Tag[] | string[], keep: Set<string>): string[] {
  const ids = skipped.map((tag) => (typeof tag === "string" ? tag : tag.id));
  return ids.filter((id) => !keep.has(id));
}

export interface ScoredCandidate {
  entity: Entity;
  rank: number;
  of: number;
  score: number;
}

export interface CurateContext {
  slot: Slot;
  level: Level;
  tooHardSlots: Set<Slot>;
  avoidTagIds: Set<string>;
  likedTagIds: Set<string>;
}

export function scoreCandidates(candidates: Entity[], ctx: CurateContext): ScoredCandidate[] {
  const of = candidates.length;
  return candidates
    .map((entity, index) => {
      const rankScore = of > 1 ? 1 - index / (of - 1) : 1;
      const qloo = 0.75 * rankScore + 0.25 * (entity.affinity ?? 0.5);
      const fit = levelFit(entity, ctx.slot, ctx.level, ctx.tooHardSlots.has(ctx.slot));
      const avoid = entity.tags.filter((tag) => ctx.avoidTagIds.has(tag.id)).length;
      const liked = entity.tags.filter((tag) => ctx.likedTagIds.has(tag.id)).length;
      const feedback = -0.12 * Math.min(avoid, 3) + 0.04 * Math.min(liked, 3);
      return { entity, rank: index + 1, of, score: qloo + fit + feedback };
    })
    .sort((a, b) => b.score - a.score || a.rank - b.rank);
}

function jaccard(a: Entity, b: Entity): number {
  const left = new Set(a.tags.map((tag) => tag.id));
  const right = new Set(b.tags.map((tag) => tag.id));
  if (left.size === 0 && right.size === 0) return 0;
  let shared = 0;
  for (const id of left) if (right.has(id)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Picks `count` items, trading a little score for variety (maximal marginal relevance). */
export function pickDiverse(scored: ScoredCandidate[], count: number, already: Entity[] = [], lambda = 0.72): ScoredCandidate[] {
  const chosen: ScoredCandidate[] = [];
  const pool = [...scored];
  while (chosen.length < count && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    pool.forEach((candidate, index) => {
      const against = [...already, ...chosen.map((c) => c.entity)];
      const overlap = against.length > 0 ? Math.max(...against.map((other) => jaccard(candidate.entity, other))) : 0;
      const value = lambda * candidate.score - (1 - lambda) * overlap;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = index;
      }
    });
    chosen.push(pool.splice(bestIndex, 1)[0]!);
  }
  return chosen;
}

export function skipSets(skips: SkipInput[]): { tooHardSlots: Set<Slot>; notForMeTagIds: string[] } {
  const tooHardSlots = new Set<Slot>();
  const notForMeTagIds: string[] = [];
  for (const skip of skips) {
    if (skip.reason === "too_hard" && skip.slot) tooHardSlots.add(skip.slot);
    if (skip.reason === "not_for_me") notForMeTagIds.push(...(skip.tagIds ?? []));
  }
  return { tooHardSlots, notForMeTagIds };
}
