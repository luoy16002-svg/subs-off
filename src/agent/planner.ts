import type { QlooClient } from "../qloo/client";
import { QlooError } from "../qloo/errors";
import { urnForKind } from "../qloo/parse";
import { shortHash } from "../qloo/query";
import { normalizeText } from "../qloo/simulator";
import type { Entity, EntityKind, QlooCallInfo, QlooQuery, ResponseSource, Tag } from "../qloo/types";
import { isSafe, pickDiverse, scoreCandidates, skipSets, type CurateContext } from "./curate";
import { howTo, templateIntro, templateWhy } from "./explain";
import { dialectFor, getCity, getLocale, type City, type LocalePack } from "./locales";
import { phrasesFor, type PhraseContext } from "./phrases";
import { buildWeek } from "./schedule";
import {
  SLOT_KIND,
  type AgentEvent,
  type AgentNote,
  type Change,
  type Contributor,
  type LearnerInput,
  type Pick,
  type Plan,
  type ResolvedFavorite,
  type Slot,
  type TraceStep,
} from "./types";

export class AgentError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.retryable = retryable;
  }
}

export interface AgentDeps {
  qloo: QlooClient;
  mode: "live" | "fixtures";
  now?: () => Date;
}

const SLOTS: Slot[] = ["series", "film", "music", "book", "podcast", "food"];
const PICKS_PER_SLOT: Record<Slot, number> = { series: 1, film: 1, music: 3, book: 1, podcast: 1, food: 1 };
const PHRASE_CONTEXT: Record<Slot, PhraseContext> = {
  series: "watch",
  film: "watch",
  music: "listen",
  book: "read",
  podcast: "podcast",
  food: "eat",
};
const SLOT_NOUN: Record<Slot, string> = {
  series: "series",
  film: "films",
  music: "artists",
  book: "books",
  podcast: "podcasts",
  food: "restaurants",
};
const NOISY_TAG_TYPES = /streaming|audience|award|platform|rating|availability|external|language|country|location|demographic/i;
const TYPE_PRIORITY = (type: string): number => (type.includes(":style:") ? 0 : type.includes(":keyword:") ? 1 : type.includes(":genre:") ? 2 : 3);

class StepRecorder {
  calls: QlooCallInfo[] = [];
  detail = "";
  status: TraceStep["status"] = "ok";
  call(info: QlooCallInfo) {
    this.calls.push(info);
  }
}

function slotForKind(kind: EntityKind): Slot | undefined {
  return (Object.entries(SLOT_KIND) as Array<[Slot, EntityKind]>).find(([, k]) => k === kind)?.[0];
}

function listNames(names: string[], max = 3): string {
  if (names.length <= max) {
    if (names.length <= 1) return names[0] ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

function kindLabel(kind: EntityKind): string {
  const labels: Partial<Record<EntityKind, string>> = {
    tv_show: "series",
    movie: "film",
    artist: "artist",
    book: "book",
    podcast: "podcast",
    place: "place",
  };
  return labels[kind] ?? kind.replace("_", " ");
}

function localText(entity: Entity, language: string, field: "localTitles" | "localDescriptions"): string | undefined {
  const match = entity[field].find((item) => item.languages.some((l) => l === language || l.startsWith(`${language}-`)));
  if (!match) return undefined;
  if (field === "localTitles" && normalizeText(match.value) === normalizeText(entity.name)) return undefined;
  return match.value;
}

export async function runAgent(input: LearnerInput, deps: AgentDeps, emit: (event: AgentEvent) => void = () => undefined): Promise<Plan> {
  const pack = getLocale(input.language);
  if (!pack) throw new AgentError("BAD_INPUT", `Unsupported language: ${input.language}`);
  const city = getCity(pack, input.targetCity);
  const now = deps.now ?? (() => new Date());
  const qloo = deps.qloo;
  const likes = input.likes ?? [];
  const skips = input.skips ?? [];
  const homeCity = input.homeCity?.trim() || undefined;
  const trace: TraceStep[] = [];
  const notes: AgentNote[] = [];
  const sources: Record<ResponseSource, number> = { live: 0, recorded: 0, simulated: 0, cache: 0 };

  async function step<T>(tool: string, title: string, run: (rec: StepRecorder) => Promise<T>): Promise<T> {
    const rec = new StepRecorder();
    const started = Date.now();
    try {
      return await run(rec);
    } catch (error) {
      rec.status = "failed";
      if (!rec.detail) rec.detail = error instanceof Error ? error.message : "Something went wrong.";
      throw error;
    } finally {
      for (const call of rec.calls) sources[call.source] += 1;
      const traceStep: TraceStep = {
        id: `s${trace.length + 1}`,
        tool,
        title,
        detail: rec.detail,
        status: rec.status,
        ms: Date.now() - started,
        calls: rec.calls,
      };
      trace.push(traceStep);
      emit({ type: "step", step: traceStep });
    }
  }

  // 1. Resolve favourites to Qloo entities -------------------------------------------------
  const { favorites, unmatched } = await step("qloo.search", "Match your favorites in Qloo", async (rec) => {
    const resolved: Array<ResolvedFavorite | undefined> = new Array(input.favorites.length).fill(undefined);
    const misses: string[] = [];
    let lastError: unknown;

    const given = input.favorites.map((f, i) => ({ f, i })).filter(({ f }) => f.id);
    if (given.length > 0) {
      try {
        const result = await qloo.entities(given.map(({ f }) => f.id!));
        rec.call(result.call);
        for (const { f, i } of given) {
          const entity = result.data.find((e) => e.id === f.id);
          resolved[i] = {
            input: f.name,
            id: f.id!,
            name: entity?.name ?? f.name,
            kind: entity?.kind ?? f.kind ?? "other",
            match: "given",
            tags: entity?.tags ?? [],
          };
        }
      } catch (error) {
        lastError = error;
        for (const { f, i } of given) {
          resolved[i] = { input: f.name, id: f.id!, name: f.name, kind: f.kind ?? "other", match: "given", tags: [] };
        }
      }
    }

    await Promise.all(
      input.favorites.map(async (f, i) => {
        if (f.id) return;
        try {
          let result = await qloo.search(f.name, { ...(f.kind ? { kinds: [f.kind] } : {}), take: 5 });
          rec.call(result.call);
          if (result.data.length === 0 && f.kind) {
            result = await qloo.search(f.name, { take: 5 });
            rec.call(result.call);
          }
          const target = normalizeText(f.name);
          const exact = result.data.find((e) => normalizeText(e.name) === target);
          const chosen = exact ?? result.data[0];
          if (!chosen) {
            misses.push(f.name);
            return;
          }
          resolved[i] = { input: f.name, id: chosen.id, name: chosen.name, kind: chosen.kind, match: exact ? "exact" : "closest", tags: chosen.tags };
        } catch (error) {
          lastError = error;
          misses.push(f.name);
        }
      }),
    );

    const unique: ResolvedFavorite[] = [];
    for (const fav of resolved) if (fav && !unique.some((u) => u.id === fav.id)) unique.push(fav);

    if (unique.length === 0) {
      if (lastError instanceof QlooError) throw lastError;
      throw new AgentError("NO_FAVORITES", "Qloo couldn't match any of those favorites. Try the full title, or pick one from the suggestions.");
    }
    const closest = unique.filter((f) => f.match === "closest");
    rec.detail = `Matched ${unique.length} of ${input.favorites.length}: ${unique.map((f) => `${f.name} (${kindLabel(f.kind)})`).join(", ")}.`;
    if (closest.length > 0) rec.detail += ` Closest match used for ${closest.map((f) => `"${f.input}"`).join(", ")}.`;
    if (misses.length > 0) {
      rec.status = "adjusted";
      rec.detail += ` No match for ${misses.map((m) => `"${m}"`).join(", ")}.`;
    }
    return { favorites: unique, unmatched: misses };
  });

  const likedIds = likes.map((l) => l.id);
  const skipIds = skips.map((s) => s.id);
  const signalIds = [...new Set([...likedIds, ...favorites.map((f) => f.id)])].slice(0, 12);
  const excludeIds = [...new Set([...favorites.map((f) => f.id), ...skipIds])];
  const nameById = new Map<string, string>();
  for (const f of favorites) nameById.set(f.id, f.name);
  for (const l of likes) if (l.name) nameById.set(l.id, l.name);

  // 2. Read the learner's taste as Qloo tags ------------------------------------------------
  const taste = await step("qloo.insights", "Read your taste across domains", async (rec) => {
    let tags: Tag[] = [];
    let source: "qloo" | "favorites" = "qloo";
    try {
      const result = await qloo.insights({ "filter.type": "urn:tag", "signal.interests.entities": signalIds, take: 25 });
      rec.call(result.call);
      tags = result.data.tags.filter((tag) => !NOISY_TAG_TYPES.test(tag.type));
    } catch (error) {
      if (error instanceof QlooError && !["QLOO_BAD_REQUEST", "QLOO_FORBIDDEN_TYPE", "QLOO_NOT_FOUND"].includes(error.code)) throw error;
    }
    if (tags.length < 3) {
      source = "favorites";
      const counts = new Map<string, { tag: Tag; count: number }>();
      for (const fav of favorites) {
        for (const tag of fav.tags) {
          if (NOISY_TAG_TYPES.test(tag.type)) continue;
          const entry = counts.get(tag.id) ?? { tag, count: 0 };
          entry.count += 1;
          counts.set(tag.id, entry);
        }
      }
      tags = [...counts.values()]
        .sort((a, b) => b.count - a.count || TYPE_PRIORITY(a.tag.type) - TYPE_PRIORITY(b.tag.type))
        .map(({ tag, count }) => ({ ...tag, affinity: count / Math.max(1, favorites.length) }));
      rec.status = "adjusted";
    }
    const top = tags.slice(0, 10).map((tag, index) => ({ id: tag.id, name: tag.name, weight: Math.round((tag.affinity ?? 1 - index / 12) * 100) / 100 }));
    rec.detail = top.length > 0
      ? `${source === "qloo" ? "Qloo's taste analysis" : "Your favorites' own Qloo tags"} point to ${listNames(top.slice(0, 5).map((t) => t.name.toLowerCase()), 5)}.`
      : "No taste tags came back; the picks rely on your favorites directly.";
    return { tags: top, source };
  });

  // 3. Find this language's genres in Qloo's tag graph ---------------------------------------
  const genreTags = await step("qloo.tags", `Find ${pack.name}-language genres in Qloo's tags`, async (rec) => {
    const find = async (queries: string[], kind: EntityKind, max: number): Promise<Tag[]> => {
      const results = await Promise.all(
        queries.map((query) =>
          qloo.tags(query, { forKind: kind, take: 15 }).then(
            (result) => {
              rec.call(result.call);
              return result.data;
            },
            (error: unknown) => {
              if (error instanceof QlooError && (error.code === "QLOO_AUTH" || error.code === "QLOO_RATE_LIMIT")) throw error;
              return [] as Tag[];
            },
          ),
        ),
      );
      const picked: Tag[] = [];
      for (const list of results) {
        for (const tag of list) {
          if (picked.length >= max) break;
          if (pack.tagHints.test(tag.name) && !picked.some((p) => p.id === tag.id)) picked.push(tag);
        }
      }
      return picked;
    };
    const [music, book, podcast, food] = await Promise.all([
      find(pack.tagQueries.music, "artist", 6),
      find(pack.tagQueries.book, "book", 4),
      find(pack.tagQueries.podcast, "podcast", 3),
      homeCity ? find(pack.tagQueries.food, "place", 4) : Promise.resolve([] as Tag[]),
    ]);
    const parts = [
      music.length ? `music: ${listNames(music.map((t) => t.name), 4)}` : "no music genre tags",
      book.length ? `books: ${listNames(book.map((t) => t.name), 3)}` : "no book tags",
      podcast.length ? `podcasts: ${listNames(podcast.map((t) => t.name), 2)}` : "no podcast tags",
    ];
    if (homeCity) parts.push(food.length ? `food: ${listNames(food.map((t) => t.name), 3)}` : "no cuisine tags");
    rec.detail = `Found ${parts.join("; ")}.`;
    if (!music.length || !book.length || !podcast.length || (homeCity && !food.length)) rec.status = "adjusted";
    return { music, book, podcast, food };
  });

  // 4. Scout each slot with Qloo Insights, relaxing filters when results run thin -----------
  interface Scouted {
    slot: Slot;
    entities: Entity[];
    usedLocation: boolean;
    locality?: string;
    filters: string[];
    source: ResponseSource;
  }

  const scoutSlot = (slot: Slot): Promise<Scouted | undefined> => {
    const kind = SLOT_KIND[slot];
    const need = PICKS_PER_SLOT[slot] + 1;
    const filters: string[] = [];
    const query: QlooQuery = {
      "filter.type": urnForKind(kind),
      "signal.interests.entities": signalIds,
      "feature.explainability": true,
      "filter.exclude.entities": excludeIds,
      take: slot === "food" ? 15 : 20,
    };
    let title = `Scout ${pack.name} ${SLOT_NOUN[slot]}`;
    let postFilter: ((entity: Entity) => boolean) | undefined;

    if (slot === "series" || slot === "film") {
      query["filter.release_country"] = pack.countries;
      query["signal.location.query"] = city.query;
      filters.push(`Released in ${pack.countryLabel}`);
      title = `Scout ${slot === "series" ? "series" : "films"} from ${pack.countryLabel}`;
    } else if (slot === "music" || slot === "book" || slot === "podcast") {
      const tags = slot === "music" ? genreTags.music : slot === "book" ? genreTags.book : genreTags.podcast;
      if (tags.length > 0) {
        query["filter.tags"] = tags.map((t) => t.id);
        filters.push(`Tagged ${listNames(tags.map((t) => t.name), 3)}`);
      } else if (slot === "music") {
        postFilter = (entity) => entity.tags.some((tag) => pack.tagHints.test(tag.name));
        filters.push(`Tags that mark ${pack.name}-language music`);
      } else {
        return Promise.resolve(undefined);
      }
      query["signal.location.query"] = city.query;
    } else if (slot === "food") {
      if (!homeCity || genreTags.food.length === 0) return Promise.resolve(undefined);
      query["filter.location.query"] = homeCity;
      query["filter.tags"] = genreTags.food.map((t) => t.id);
      filters.push(`In ${homeCity}`, `Tagged ${listNames(genreTags.food.map((t) => t.name), 3)}`);
      title = `Scout places to eat in ${homeCity}`;
    }

    return step("qloo.insights", title, async (rec) => {
      let usedLocation = Boolean(query["signal.location.query"]);
      let source: ResponseSource = "live";
      let locality: string | undefined;
      const run = async (q: QlooQuery): Promise<Entity[]> => {
        const result = await qloo.insights(q);
        rec.call(result.call);
        source = result.call.source;
        locality = result.data.locality;
        return result.data.entities.filter((e) => isSafe(e) && !excludeIds.includes(e.id) && (!postFilter || postFilter(e)));
      };

      let entities: Entity[] = [];
      try {
        entities = await run(query);
      } catch (error) {
        if (error instanceof QlooError && error.code === "QLOO_BAD_REQUEST" && usedLocation) {
          const { ["signal.location.query"]: _drop, ...rest } = query;
          usedLocation = false;
          entities = await run(rest);
          rec.status = "adjusted";
        } else if (error instanceof QlooError && (error.code === "QLOO_FORBIDDEN_TYPE" || error.code === "QLOO_NOT_FOUND")) {
          rec.status = "skipped";
          rec.detail = `Qloo didn't return ${SLOT_NOUN[slot]} for this request.`;
          return undefined;
        } else if (slot === "food" && error instanceof QlooError && error.code === "QLOO_BAD_REQUEST") {
          rec.status = "skipped";
          rec.detail = `Qloo couldn't place "${homeCity}" on the map, so there's no restaurant this week.`;
          return undefined;
        } else {
          throw error;
        }
      }

      if (entities.length < need && usedLocation) {
        const { ["signal.location.query"]: _drop, ...rest } = query;
        const wider = await run(rest);
        if (wider.length > entities.length) {
          entities = wider;
          usedLocation = false;
          rec.status = "adjusted";
          notes.push({ kind: "adjusted", text: `Few ${SLOT_NOUN[slot]} matched with ${city.name} weighting, so the agent widened the search beyond ${city.name}.` });
        }
      }

      if (usedLocation) filters.push(`Weighted toward ${city.name}`);
      const top = entities.slice(0, 3).map((e) => e.name);
      rec.detail = entities.length > 0
        ? `${entities.length} candidates. Top: ${listNames(top, 3)}.${rec.status === "adjusted" ? ` Widened beyond ${city.name} to find enough.` : ""}`
        : `No ${SLOT_NOUN[slot]} matched these filters.`;
      if (entities.length === 0) rec.status = "skipped";
      const scouted: Scouted = { slot, entities, usedLocation, filters, source };
      if (usedLocation) scouted.locality = locality ?? city.name;
      return scouted;
    });
  };

  const scoutedList = await Promise.all(
    SLOTS.map((slot) =>
      scoutSlot(slot).catch((error: unknown) => {
        if (error instanceof QlooError && ["QLOO_AUTH", "QLOO_RATE_LIMIT", "QLOO_CONFIG"].includes(error.code)) throw error;
        notes.push({ kind: "missing", text: `Couldn't load ${SLOT_NOUN[slot]} this time.` });
        return undefined;
      }),
    ),
  );
  const scouted = new Map<Slot, Scouted>();
  for (const item of scoutedList) if (item && item.entities.length > 0) scouted.set(item.slot, item);

  if (scouted.size === 0) {
    throw new AgentError("NO_RESULTS", `Qloo found nothing in ${pack.name} for this mix of favorites. Try adding one or two more.`, true);
  }
  if (!homeCity) notes.push({ kind: "info", text: "Add your city to get a restaurant where you can practice ordering." });
  for (const slot of SLOTS) {
    if (!scouted.has(slot) && slot !== "food") notes.push({ kind: "missing", text: `No ${pack.name}-language ${SLOT_NOUN[slot]} matched this week.` });
  }

  // 5. Curate: Qloo's order first, then level fit, feedback and variety ---------------------
  const article = input.level === "beginner" ? "a" : "an";
  const curated = await step("agent.curate", `Choose picks for ${article} ${input.level} learner`, async (rec) => {
    const { tooHardSlots, notForMeTagIds } = skipSets(skips);
    const favoriteTagIds = new Set(favorites.flatMap((f) => f.tags.map((t) => t.id)));
    const avoidTagIds = new Set(notForMeTagIds.filter((id) => !favoriteTagIds.has(id)));

    // Liked picks stay pinned; hydrate any that this round's results no longer contain.
    const pinned = new Map<Slot, Entity[]>();
    const missingLikes: string[] = [];
    for (const like of likes) {
      let found: Entity | undefined;
      let foundSlot: Slot | undefined;
      for (const [slot, s] of scouted) {
        const hit = s.entities.find((e) => e.id === like.id);
        if (hit) {
          found = hit;
          foundSlot = slot;
          break;
        }
      }
      if (found && foundSlot) pinned.set(foundSlot, [...(pinned.get(foundSlot) ?? []), found]);
      else missingLikes.push(like.id);
    }
    if (missingLikes.length > 0) {
      try {
        const result = await qloo.entities(missingLikes);
        rec.call(result.call);
        for (const entity of result.data) {
          const like = likes.find((l) => l.id === entity.id);
          const slot = like?.slot ?? slotForKind(entity.kind);
          if (slot) pinned.set(slot, [...(pinned.get(slot) ?? []), entity]);
        }
      } catch {
        notes.push({ kind: "info", text: "Some liked picks couldn't be reloaded, so they were left out this round." });
      }
    }
    const likedTagIds = new Set([...pinned.values()].flat().flatMap((e) => e.tags.map((t) => t.id)));

    const chosen = new Map<Slot, Array<{ entity: Entity; rank: number; of: number; pinned: boolean }>>();
    const alternates = new Map<Slot, Entity>();
    for (const slot of SLOTS) {
      const s = scouted.get(slot);
      const pins = (pinned.get(slot) ?? []).slice(0, PICKS_PER_SLOT[slot]);
      if (!s && pins.length === 0) continue;
      const entities = s?.entities ?? [];
      const ctx: CurateContext = { slot, level: input.level, tooHardSlots, avoidTagIds, likedTagIds };
      const scored = scoreCandidates(entities.filter((e) => !pins.some((p) => p.id === e.id)), ctx);
      const list: Array<{ entity: Entity; rank: number; of: number; pinned: boolean }> = pins.map((entity) => {
        const index = entities.findIndex((e) => e.id === entity.id);
        return { entity, rank: index >= 0 ? index + 1 : 0, of: entities.length, pinned: true };
      });
      // Keep earlier picks that still rank well, so a re-plan changes only what it should.
      const previous = (input.previous ?? []).filter((p) => p.slot === slot && !skipIds.includes(p.id));
      for (const prev of previous) {
        if (list.length >= PICKS_PER_SLOT[slot]) break;
        const position = scored.findIndex((c) => c.entity.id === prev.id);
        if (position >= 0 && position < 4 && !list.some((l) => l.entity.id === prev.id)) {
          const [kept] = scored.splice(position, 1);
          list.push({ entity: kept!.entity, rank: kept!.rank, of: kept!.of, pinned: false });
        }
      }
      const room = PICKS_PER_SLOT[slot] - list.length;
      if (room > 0) {
        const fresh = pickDiverse(scored, room, list.map((l) => l.entity));
        for (const f of fresh) list.push({ entity: f.entity, rank: f.rank, of: f.of, pinned: false });
      }
      const alternate = scored.find((c) => !list.some((l) => l.entity.id === c.entity.id));
      if (alternate) alternates.set(slot, alternate.entity);
      if (list.length > 0) chosen.set(slot, list);
    }
    const count = [...chosen.values()].reduce((n, l) => n + l.length, 0);
    const bits = [`${count} picks`];
    if (likes.length) bits.push(`${likes.length} kept from your likes`);
    if (skips.length) bits.push(`${skips.length} skipped item${skips.length > 1 ? "s" : ""} left out`);
    if (tooHardSlots.size) bits.push(`easier ${[...tooHardSlots].join(" and ")} after "too hard"`);
    rec.detail = `${bits.join(", ")}. Qloo's ranking leads; level fit and variety break close calls.`;
    return { chosen, alternates, likedTagIds };
  });

  // Liked picks are signals too; make sure their names are known for the evidence.
  for (const list of curated.chosen.values()) {
    for (const item of list) if (item.pinned && !nameById.has(item.entity.id)) nameById.set(item.entity.id, item.entity.name);
  }

  // Build pick cards with Qloo evidence ------------------------------------------------------
  const profileTagIds = new Set([...taste.tags.map((t) => t.id), ...favorites.flatMap((f) => f.tags.map((t) => t.id))]);
  const picks: Pick[] = [];
  for (const slot of SLOTS) {
    const list = curated.chosen.get(slot);
    if (!list) continue;
    const s = scouted.get(slot);
    for (const { entity, rank, of, pinned } of list) {
      const known = entity.contributions.filter((c) => nameById.has(c.entityId));
      const total = known.reduce((sum, c) => sum + c.score, 0);
      const contributors: Contributor[] = known.slice(0, 3).map((c) => ({ id: c.entityId, name: nameById.get(c.entityId)!, share: total > 0 ? c.score / total : 0 }));
      const sharedTags = entity.tags
        .filter((t) => profileTagIds.has(t.id) && !NOISY_TAG_TYPES.test(t.type))
        .sort((a, b) => TYPE_PRIORITY(a.type) - TYPE_PRIORITY(b.type))
        .map((t) => t.name)
        .slice(0, 3);
      const dialect = dialectFor(pack, entity.countries, city);
      const pick: Pick = {
        id: entity.id,
        slot,
        kind: entity.kind,
        name: entity.name,
        countries: entity.countries,
        tags: entity.tags.filter((t) => !NOISY_TAG_TYPES.test(t.type)).slice(0, 6).map((t) => ({ id: t.id, name: t.name })),
        dialect,
        evidence: {
          rank,
          of,
          contributors,
          sharedTags,
          filters: s?.filters ?? [],
          source: s?.source ?? "live",
          ...(entity.affinity !== undefined ? { affinity: entity.affinity } : {}),
          ...(entity.popularity !== undefined ? { popularity: entity.popularity } : {}),
          ...(s?.locality ? { locality: s.locality } : {}),
        },
        why: "",
        how: howTo(slot, input.level, pack),
        phrases: phrasesFor(pack.code, dialect, PHRASE_CONTEXT[slot], entity.id, 2),
      };
      const localTitle = localText(entity, pack.code, "localTitles");
      if (localTitle) pick.localTitle = localTitle;
      const localDescription = localText(entity, pack.code, "localDescriptions");
      if (localDescription) pick.localDescription = localDescription;
      if (entity.year !== undefined) pick.year = entity.year;
      if (entity.description) pick.description = entity.description;
      if (entity.image) pick.image = entity.image;
      if (entity.durationMin !== undefined) pick.durationMin = entity.durationMin;
      if (entity.contentRating) pick.contentRating = entity.contentRating;
      if (entity.address) pick.address = entity.address;
      if ((slot === "series" || slot === "film") && pack.dialectNotes[dialect]) pick.dialectNote = pack.dialectNotes[dialect]!;
      const alternate = curated.alternates.get(slot);
      if (alternate && list.length === 1) pick.alternate = { id: alternate.id, name: alternate.name };
      if (pinned) pick.pinned = true;
      pick.why = templateWhy(pick, city.name, homeCity);
      picks.push(pick);
    }
  }

  // 6. Schedule the week ---------------------------------------------------------------------
  const days = await step("agent.schedule", "Lay out seven days", async (rec) => {
    const bySlot: Partial<Record<Slot, Pick[]>> = {};
    for (const pick of picks) (bySlot[pick.slot] ??= []).push(pick);
    const week = buildWeek(bySlot, input.level, input.minutesPerDay);
    const average = Math.round(week.reduce((sum, d) => sum + d.minutes, 0) / week.length);
    rec.detail = `About ${average} minutes a day at your desk or on the couch, plus listening on the go. Same series all week, so the voices get familiar.`;
    return week;
  });

  // Aggregate how much each favourite shaped the week.
  const influenceTotals = new Map<string, number>();
  for (const pick of picks) for (const c of pick.evidence.contributors) influenceTotals.set(c.id, (influenceTotals.get(c.id) ?? 0) + c.share);
  const influenceSum = [...influenceTotals.values()].reduce((a, b) => a + b, 0);
  const influence: Contributor[] = [...influenceTotals.entries()]
    .map(([id, value]) => ({ id, name: nameById.get(id) ?? id, share: influenceSum > 0 ? value / influenceSum : 0 }))
    .sort((a, b) => b.share - a.share);

  const pickNames = [...picks.flatMap((p) => [p.name, p.localTitle ?? ""]), ...favorites.map((f) => f.name)].map(normalizeText);
  const usualList = pack.usualList.filter((title) => !pickNames.some((n) => n && (n.includes(normalizeText(title)) || normalizeText(title).includes(n))));

  const changes = diffPicks(input, picks, likes.map((l) => l.id), input.previousCity ? city.name : undefined);

  const plan: Plan = {
    id: shortHash(`${JSON.stringify(input)}:${now().toISOString()}`),
    createdAt: now().toISOString(),
    learner: {
      ...(input.name ? { name: input.name } : {}),
      language: pack.code,
      languageName: pack.name,
      nativeName: pack.nativeName,
      level: input.level,
      city,
      ...(homeCity ? { homeCity } : {}),
      minutesPerDay: input.minutesPerDay,
    },
    favorites,
    unmatched,
    taste,
    influence,
    picks,
    days,
    usualList,
    notes,
    changes,
    trace,
    sources,
    mode: deps.mode,
    writer: "templates",
    intro: templateIntro(picks, favorites.map((f) => f.name), city.name, pack.name),
  };
  return plan;
}

function diffPicks(input: LearnerInput, picks: Pick[], likedIds: string[], newCity?: string): Change[] {
  const previous = input.previous ?? [];
  if (previous.length === 0) return [];
  const skips = new Map((input.skips ?? []).map((s) => [s.id, s]));
  const changes: Change[] = [];
  for (const slot of SLOTS) {
    const before = previous.filter((p) => p.slot === slot);
    const after = picks.filter((p) => p.slot === slot);
    const removed = before.filter((b) => !after.some((a) => a.id === b.id));
    const added = after.filter((a) => !before.some((b) => b.id === a.id));
    const pairs = Math.max(removed.length, added.length);
    for (let i = 0; i < pairs; i += 1) {
      const from = removed[i];
      const to = added[i];
      let reason = newCity ? `Ranks higher with ${newCity} audiences.` : "Moved up after your feedback.";
      const skip = from ? skips.get(from.id) : undefined;
      if (skip?.reason === "seen") reason = `You've already seen ${from!.name}.`;
      else if (skip?.reason === "too_hard") reason = `${from!.name} felt too hard, so this one is gentler.`;
      else if (skip?.reason === "not_for_me") reason = `You passed on ${from!.name}.`;
      const liked = to?.evidence.contributors.find((c) => likedIds.includes(c.id));
      if (liked) reason += ` It leans on your like of ${liked.name}.`;
      const change: Change = { slot, reason: reason.trim() };
      if (from) change.from = { id: from.id, name: from.name };
      if (to) change.to = { id: to.id, name: to.name };
      changes.push(change);
    }
  }
  return changes;
}

export function cityFor(language: string, slug: string): City | undefined {
  const pack: LocalePack | undefined = getLocale(language);
  return pack ? getCity(pack, slug) : undefined;
}
