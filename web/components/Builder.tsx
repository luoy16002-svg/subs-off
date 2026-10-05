import { IconArrowLeft, IconPlus, IconSearch, IconX } from "@tabler/icons-preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { FavoriteInput, LearnerInput, Level } from "../../src/agent/types";
import type { EntityKind } from "../../src/qloo/types";
import { searchFavorites, type AppConfig, type SearchResult } from "../lib/api";
import { KIND_NAME, LEVELS } from "../lib/labels";
import { STROKE } from "./visual";

const QUICK_PICKS: Array<{ name: string; kind: EntityKind }> = [
  { name: "The Bear", kind: "tv_show" },
  { name: "Taylor Swift", kind: "artist" },
  { name: "Severance", kind: "tv_show" },
  { name: "Harry Potter and the Philosopher's Stone", kind: "book" },
  { name: "Frank Ocean", kind: "artist" },
  { name: "Gilmore Girls", kind: "tv_show" },
  { name: "Knives Out", kind: "movie" },
  { name: "Billie Eilish", kind: "artist" },
];

export function Builder({ config, initial, onBack, onSubmit }: { config: AppConfig; initial?: LearnerInput | undefined; onBack: () => void; onSubmit: (input: LearnerInput) => void }) {
  const firstLanguage = config.languages[0]!;
  const [language, setLanguage] = useState(initial?.language ?? firstLanguage.code);
  const pack = config.languages.find((l) => l.code === language) ?? firstLanguage;
  const [targetCity, setTargetCity] = useState(initial?.targetCity ?? pack.cities[0]!.slug);
  const [level, setLevel] = useState<Level>(initial?.level ?? "intermediate");
  const [minutes, setMinutes] = useState(initial?.minutesPerDay ?? 30);
  const [homeCity, setHomeCity] = useState(initial?.homeCity ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [favorites, setFavorites] = useState<FavoriteInput[]>(initial?.favorites ?? []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pack.cities.some((c) => c.slug === targetCity)) setTargetCity(pack.cities[0]!.slug);
  }, [language]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(undefined);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchFavorites(q, controller.signal);
        setResults(found.filter((r) => !favorites.some((f) => f.id === r.id)));
        setSearchError(undefined);
        setActive(0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSearchError((error as Error).message);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const add = (favorite: FavoriteInput) => {
    if (favorites.length >= 6) return;
    if (favorites.some((f) => (f.id && f.id === favorite.id) || f.name.toLowerCase() === favorite.name.toLowerCase())) return;
    setFavorites([...favorites, favorite]);
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[active];
      if (chosen) add({ name: chosen.name, id: chosen.id, kind: chosen.kind });
      else if (query.trim().length > 1) add({ name: query.trim() });
    } else if (event.key === "Escape") {
      setResults([]);
    }
  };

  const enough = favorites.length >= 2;
  const submit = (event: Event) => {
    event.preventDefault();
    setTouched(true);
    if (!enough) {
      inputRef.current?.focus();
      return;
    }
    const input: LearnerInput = { language: language as LearnerInput["language"], level, targetCity, minutesPerDay: minutes, favorites };
    if (homeCity.trim()) input.homeCity = homeCity.trim();
    if (name.trim()) input.name = name.trim();
    onSubmit(input);
  };

  const quick = useMemo(() => QUICK_PICKS.filter((q) => !favorites.some((f) => f.name === q.name)).slice(0, 6), [favorites]);
  const listId = "favorite-results";

  return (
    <main id="main" class="builder">
      <button type="button" class="back" onClick={onBack}>
        <IconArrowLeft size={16} stroke={STROKE} aria-hidden="true" /> All learners
      </button>
      <h1>Build your week</h1>
      <p class="section-lede">Four favorites are enough. The agent does the rest.</p>

      <form class="form" onSubmit={submit} noValidate>
        <fieldset class="field field--favorites">
          <legend>Things you love</legend>
          <p class="help" id="fav-help">
            Shows, films, artists or books, in any language. Add 2 to 6.
          </p>
          {favorites.length > 0 ? (
            <ul class="chips" aria-label="Your favorites">
              {favorites.map((favorite) => (
                <li class="chip chip--fav">
                  <span>
                    {favorite.name}
                    {favorite.kind ? <small>{KIND_NAME[favorite.kind] ?? ""}</small> : null}
                  </span>
                  <button type="button" aria-label={`Remove ${favorite.name}`} onClick={() => setFavorites(favorites.filter((f) => f !== favorite))}>
                    <IconX size={14} stroke={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div class="combo">
            <label class="sr-only" for="fav-input">
              Search for a favorite
            </label>
            <IconSearch class="combo__icon" size={18} stroke={STROKE} aria-hidden="true" />
            <input
              id="fav-input"
              ref={inputRef}
              type="text"
              autocomplete="off"
              placeholder={favorites.length >= 6 ? "That's plenty" : "Search, e.g. Severance"}
              disabled={favorites.length >= 6}
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-describedby="fav-help"
              aria-activedescendant={results[active] ? `opt-${results[active]!.id}` : undefined}
            />
            {searching ? <span class="combo__busy" aria-hidden="true" /> : null}
            {results.length > 0 ? (
              <ul class="combo__list" id={listId} role="listbox">
                {results.map((result, i) => (
                  <li
                    id={`opt-${result.id}`}
                    role="option"
                    aria-selected={i === active}
                    class={i === active ? "is-active" : ""}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add({ name: result.name, id: result.id, kind: result.kind });
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span class="combo__name">{result.name}</span>
                    <span class="combo__detail">
                      {KIND_NAME[result.kind] ?? "Other"}
                      {result.detail ? `, ${result.detail}` : result.year ? `, ${result.year}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          {searchError ? <p class="error-text">{searchError}</p> : null}
          {query.trim().length >= 2 && !searching && results.length === 0 && !searchError ? (
            <p class="help">No match yet. Press Enter to add "{query.trim()}" as typed, and the agent will look it up.</p>
          ) : null}
          {touched && !enough ? <p class="error-text">Add at least two favorites so Qloo has something to work with.</p> : null}
          {favorites.length < 6 && quick.length > 0 ? (
            <div class="quick">
              <span class="quick__label">Or start with</span>
              {quick.map((q) => (
                <button type="button" class="chip chip--quick" onClick={() => add({ name: q.name, kind: q.kind })}>
                  <IconPlus size={14} stroke={2} aria-hidden="true" />
                  {q.name.length > 22 ? `${q.name.slice(0, 20)}…` : q.name}
                </button>
              ))}
            </div>
          ) : null}
        </fieldset>

        <fieldset class="field">
          <legend>Language</legend>
          <div class="segmented" role="radiogroup" aria-label="Language">
            {config.languages.map((lang) => (
              <button type="button" role="radio" aria-checked={lang.code === language} class={lang.code === language ? "is-on" : ""} onClick={() => setLanguage(lang.code)}>
                {lang.name}
                <small lang={lang.code}>{lang.nativeName}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend>Whose taste to lean toward</legend>
          <p class="help">Qloo weights picks toward what people in this city like.</p>
          <div class="segmented segmented--tight" role="radiogroup" aria-label="City">
            {pack.cities.map((city) => (
              <button type="button" role="radio" aria-checked={city.slug === targetCity} class={city.slug === targetCity ? "is-on" : ""} onClick={() => setTargetCity(city.slug)}>
                {city.name}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset class="field">
          <legend>Your level</legend>
          <div class="levels" role="radiogroup" aria-label="Level">
            {LEVELS.map((item) => (
              <button type="button" role="radio" aria-checked={item.id === level} class={`level ${item.id === level ? "is-on" : ""}`} onClick={() => setLevel(item.id)}>
                <span class="level__name">{item.name}</span>
                <span class="level__detail">{item.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div class="field-row">
          <div class="field">
            <label class="label" for="minutes">
              Time a day <output for="minutes">{minutes} min</output>
            </label>
            <input id="minutes" type="range" min={10} max={90} step={5} value={minutes} onInput={(e) => setMinutes(Number((e.target as HTMLInputElement).value))} />
            <p class="help">Music and podcasts fit a commute and don't count.</p>
          </div>
          <div class="field">
            <label class="label" for="home">
              Where you live <span class="optional">optional</span>
            </label>
            <input id="home" class="input" type="text" autocomplete="address-level2" placeholder="e.g. Chicago" value={homeCity} onInput={(e) => setHomeCity((e.target as HTMLInputElement).value)} />
            <p class="help">For one restaurant where you can practice ordering.</p>
          </div>
        </div>

        <div class="field field--name">
          <label class="label" for="name">
            Your first name <span class="optional">optional</span>
          </label>
          <input id="name" class="input" type="text" autocomplete="given-name" maxLength={40} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          <p class="help">Stays in this page. Qloo only ever sees titles and cities.</p>
        </div>

        <div class="form__actions">
          <button type="submit" class="btn btn--sub btn--lg">
            Build my week
          </button>
          <span class="form__count" aria-live="polite">
            {favorites.length === 0 ? "No favorites yet" : favorites.length === 1 ? "1 favorite, add one more" : `${favorites.length} favorites`}
          </span>
        </div>
      </form>
    </main>
  );
}
