import type { Day, Dose, Level, Pick, Slot } from "./types";

const DAYS: Array<[name: string, short: string]> = [
  ["Monday", "Mon"],
  ["Tuesday", "Tue"],
  ["Wednesday", "Wed"],
  ["Thursday", "Thu"],
  ["Friday", "Fri"],
  ["Saturday", "Sat"],
  ["Sunday", "Sun"],
];

interface Intent {
  slot: Slot;
  index?: number;
}

const s = (slot: Slot): Intent => ({ slot });
const m = (index: number): Intent => ({ slot: "music", index });

// The ideal week, with fallbacks for when a slot has no pick.
const WEEK: Array<{ main: Intent[]; side: Intent[] }> = [
  { main: [s("series"), s("film"), s("podcast"), s("book"), m(0)], side: [m(0), s("podcast")] },
  { main: [s("book"), s("podcast"), m(1), s("series")], side: [s("podcast"), m(1), m(0)] },
  { main: [s("series"), s("film"), s("podcast"), s("book")], side: [m(1), m(0), s("podcast")] },
  { main: [s("podcast"), m(2), m(1), s("book"), s("series")], side: [m(2), m(0), s("book")] },
  { main: [s("series"), s("book"), s("podcast"), m(0)], side: [s("book"), m(0), s("podcast")] },
  { main: [s("food"), s("film"), s("series"), s("podcast")], side: [m(0), m(1)] },
  { main: [s("film"), s("series"), s("podcast"), s("book")], side: [] },
];

function ordinal(n: number): string {
  return ["one", "two", "three", "four", "five", "six"][n - 1] ?? String(n);
}

export function buildWeek(picksBySlot: Partial<Record<Slot, Pick[]>>, level: Level, minutesPerDay: number): Day[] {
  const uses = new Map<string, number>();
  const resolve = (intent: Intent): Pick | undefined => {
    const list = picksBySlot[intent.slot] ?? [];
    if (intent.slot === "music") {
      const index = intent.index ?? 0;
      return list[index] ?? list[index % Math.max(1, list.length)];
    }
    return list[0];
  };

  const doseFor = (pick: Pick, main: boolean): Dose => {
    const n = (uses.get(pick.id) ?? 0) + 1;
    uses.set(pick.id, n);
    const base = { pickId: pick.id, slot: pick.slot, main };
    switch (pick.slot) {
      case "series": {
        const length = pick.durationMin ?? 45;
        if (length > minutesPerDay + 10) return { ...base, action: `Episode ${n}, in two sittings`, minutes: minutesPerDay };
        return { ...base, action: `Episode ${n}`, minutes: length };
      }
      case "film": {
        const length = pick.durationMin ?? 110;
        if (length > minutesPerDay * 2 + 30) return { ...base, action: "First half tonight", minutes: Math.round(length / 2) };
        return { ...base, action: "Movie night", minutes: length };
      }
      case "music": {
        if (n > 1) return { ...base, action: "Sing along to your favorite", minutes: 10, onTheGo: true };
        const action = level === "beginner" ? "Three songs, twice" : level === "intermediate" ? "Learn one chorus" : "The album, on a walk";
        return { ...base, action, minutes: level === "advanced" ? 35 : 10, onTheGo: true };
      }
      case "book": {
        const minutes = level === "beginner" ? 10 : 15;
        if (n > 1) return { ...base, action: `${minutes} more minutes`, minutes };
        return { ...base, action: level === "beginner" ? "First pages, out loud" : `Read ${minutes} minutes`, minutes };
      }
      case "podcast":
        return { ...base, action: n > 1 ? "Another episode" : "One episode", minutes: level === "beginner" ? 10 : 20, onTheGo: !main };
      case "food":
        return { ...base, action: "Dinner out", minutes: 0 };
    }
  };

  const themeFor = (dose: Dose): string => {
    const n = uses.get(dose.pickId) ?? 1;
    switch (dose.slot) {
      case "series":
        return n === 1 ? "Start the series" : `Episode ${ordinal(n)}`;
      case "film":
        return "Movie night";
      case "book":
        return n === 1 ? "A few pages" : "Back to the book";
      case "podcast":
        return "Ear day";
      case "music":
        return "Sing-along day";
      case "food":
        return "Order out loud";
    }
  };

  return WEEK.map((spec, index) => {
    const [name, short] = DAYS[index]!;
    const doses: Dose[] = [];
    let theme = "Review day";
    const mainPick = spec.main.map(resolve).find((pick): pick is Pick => Boolean(pick));
    if (mainPick) {
      const dose = doseFor(mainPick, true);
      doses.push(dose);
      theme = themeFor(dose);
    }
    const sidePick = spec.side.map(resolve).find((pick): pick is Pick => Boolean(pick) && pick!.id !== mainPick?.id);
    if (sidePick) {
      const main = doses[0];
      const sideDose = doseFor(sidePick, false);
      const fits = sideDose.onTheGo || !main || main.slot === "food" || main.minutes + sideDose.minutes <= minutesPerDay + 10;
      if (fits) doses.push(sideDose);
      else uses.set(sidePick.id, (uses.get(sidePick.id) ?? 1) - 1);
    }
    const minutes = doses.filter((dose) => !dose.onTheGo).reduce((sum, dose) => sum + dose.minutes, 0);
    return { index, name, short, theme, doses, minutes };
  });
}
