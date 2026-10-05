import { fnv1a } from "../qloo/query";
import type { LocalePack } from "./locales";
import type { Level, Pick, Plan, Slot } from "./types";

export const SLOT_LABEL: Record<Slot, string> = {
  series: "Series",
  film: "Film",
  music: "Music",
  book: "Book",
  podcast: "Podcast",
  food: "Food",
};

export const SLOT_VERB: Record<Slot, string> = {
  series: "Watch",
  film: "Watch",
  music: "Listen",
  book: "Read",
  podcast: "Listen",
  food: "Eat out",
};

export function subtitleMode(level: Level, language: string): string {
  if (level === "beginner") return `${language} audio, English subtitles`;
  if (level === "intermediate") return `${language} audio, ${language} subtitles`;
  return `${language} audio, no subtitles`;
}

export function howTo(slot: Slot, level: Level, pack: LocalePack): string {
  const lang = pack.name;
  switch (slot) {
    case "series":
      if (level === "beginner") return `${lang} audio with English subtitles. After each episode, rewatch one short scene with ${lang} subtitles.`;
      if (level === "intermediate") return `${lang} audio with ${lang} subtitles. Pause on one line per episode and say it out loud.`;
      return "Subtitles off. If a line slips past, rewind once, then keep going.";
    case "film":
      if (level === "beginner") return `${lang} audio with English subtitles. Pick your favorite scene and watch it again with ${lang} subtitles.`;
      if (level === "intermediate") return `${lang} audio with ${lang} subtitles. Note three lines you would actually say.`;
      return "Subtitles off. Afterwards, tell yourself the plot in two minutes, out loud.";
    case "music":
      if (level === "beginner") return "Play three songs twice. The second time, follow the lyrics as you listen.";
      if (level === "intermediate") return "Learn one chorus well enough to sing it without the lyrics.";
      return "Play a whole album and write down one line worth quoting.";
    case "book":
      if (level === "beginner") return `Read the first pages in English, then the same pages in ${lang}, out loud.`;
      if (level === "intermediate") return "Read for 15 minutes. Underline lines you would say yourself.";
      return `Read a chapter, then sum it up in two sentences in ${lang}.`;
    case "podcast":
      if (level === "beginner") return "One short episode. Replay a minute you half understood.";
      if (level === "intermediate") return "One episode at normal speed. Note three phrases you could use today.";
      return `Listen at 1.25× and retell one story to yourself in ${lang}.`;
    case "food":
      if (level === "beginner") return `Say the phrases below out loud before you go. If the staff speak ${lang}, order one dish in ${lang}.`;
      return `If the staff speak ${lang}, order in ${lang} and ask one question about the menu. If not, read the dish names out loud.`;
  }
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function lower(tag: string): string {
  return /^[A-Z]{2,}|^[A-Z]-|[&]/.test(tag) ? tag : tag.toLowerCase();
}

/** One or two plain sentences built only from Qloo evidence. */
export function templateWhy(pick: Pick, cityName: string, homeCity?: string): string {
  const [first, second] = pick.evidence.contributors;
  const tags = pick.evidence.sharedTags.slice(0, 2).map(lower);
  const variant = fnv1a(pick.id) % 3;
  let sentence: string;

  if (pick.slot === "food") {
    const where = homeCity ?? "your city";
    sentence = first
      ? `Qloo ranks it high in ${where} for people with your taste, led by your love of ${first.name}.`
      : `Qloo ranks it high in ${where} for people with your taste.`;
    return sentence;
  }

  if (first && first.share >= 0.55) {
    sentence = second && second.share >= 0.15
      ? `Most of this match comes from ${first.name}, with a pull from ${second.name}.`
      : `Most of this match comes from ${first.name}.`;
  } else if (first && second) {
    sentence = variant === 0
      ? `Fans of ${first.name} and ${second.name} rate it highly.`
      : `People who love ${first.name} tend to rate this highly, and ${second.name} adds to the match.`;
  } else if (first) {
    sentence = `People who love ${first.name} tend to rate this highly.`;
  } else if (tags.length > 0) {
    sentence = `It has the ${list(tags)} streak your favorites share.`;
  } else if (pick.slot === "podcast" && pick.tags.some((t) => /language learning|learn/i.test(t.name))) {
    sentence = "Made for learners, and it ranks high for your mix of favorites.";
  } else {
    sentence = `One of Qloo's strongest ${SLOT_LABEL[pick.slot].toLowerCase()} matches for your favorites.`;
  }

  if (tags.length > 0 && first && variant !== 2) {
    sentence += ` It shares the ${list(tags)} streak in your favorites.`;
  } else if (pick.evidence.locality && pick.slot !== "podcast") {
    sentence += ` Weighted toward what ${cityName} audiences like.`;
  }
  return sentence;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

export function templateIntro(plan: Pick[], favorites: string[], cityName: string, language: string): string {
  const count = NUMBER_WORDS[plan.length] ?? String(plan.length);
  const from = favorites.length <= 4 ? list(favorites) : `${list(favorites.slice(0, 3))} and ${favorites.length - 3} more`;
  return `${count.charAt(0).toUpperCase()}${count.slice(1)} picks in ${language}, found through ${from} and weighted toward what people in ${cityName} like.`;
}

export interface WriterFacts {
  learner: { name?: string; language: string; level: Level; city: string; homeCity?: string };
  favorites: string[];
  picks: Array<{
    id: string;
    title: string;
    originalTitle?: string;
    type: string;
    from?: string;
    year?: number;
    drivers: Array<{ name: string; share: number }>;
    sharedTags: string[];
    draft: string;
  }>;
}

export function writerFacts(plan: Plan): WriterFacts {
  return {
    learner: {
      ...(plan.learner.name ? { name: plan.learner.name } : {}),
      language: plan.learner.languageName,
      level: plan.learner.level,
      city: plan.learner.city.name,
      ...(plan.learner.homeCity ? { homeCity: plan.learner.homeCity } : {}),
    },
    favorites: plan.favorites.map((f) => f.name),
    picks: plan.picks.map((pick) => ({
      id: pick.id,
      title: pick.name,
      ...(pick.localTitle ? { originalTitle: pick.localTitle } : {}),
      type: SLOT_LABEL[pick.slot].toLowerCase(),
      ...(pick.countries[0] ? { from: pick.countries[0] } : {}),
      ...(pick.year ? { year: pick.year } : {}),
      drivers: pick.evidence.contributors.slice(0, 2).map((c) => ({ name: c.name, share: Math.round(c.share * 100) / 100 })),
      sharedTags: pick.evidence.sharedTags.slice(0, 3),
      draft: pick.why,
    })),
  };
}
