import type { Level, Slot } from "../../src/agent/types";
import type { EntityKind, ResponseSource } from "../../src/qloo/types";

export const LEVELS: Array<{ id: Level; name: string; detail: string }> = [
  { id: "beginner", name: "Beginner", detail: "English subtitles, learner podcasts, short episodes." },
  { id: "intermediate", name: "Intermediate", detail: "Subtitles in the language you're learning." },
  { id: "advanced", name: "Advanced", detail: "No subtitles, full albums, a chapter at a time." },
];

export const SLOT_NAME: Record<Slot, string> = {
  series: "Series",
  film: "Film",
  music: "Music",
  book: "Book",
  podcast: "Podcast",
  food: "Eat out",
};

export const KIND_NAME: Partial<Record<EntityKind, string>> = {
  tv_show: "Series",
  movie: "Film",
  artist: "Artist",
  book: "Book",
  podcast: "Podcast",
  place: "Place",
};

export function sourceLabel(source: ResponseSource, recordedAt?: string, cached?: boolean): string {
  switch (source) {
    case "live":
      return cached ? "Qloo, cached" : "Live from Qloo";
    case "recorded":
      return recordedAt ? `Recorded from Qloo on ${new Date(recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Recorded from Qloo";
    case "simulated":
      return "Offline sample data";
  }
}

export function possessive(name: string | undefined): string {
  if (!name) return "Your";
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
