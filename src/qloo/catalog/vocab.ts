// Tag vocabulary for the offline catalog. IDs follow Qloo's tag URN layout
// (urn:tag:<kind>:<domain>:<value>) so the simulator answers in the same shape
// as the live API. These are sample tags; recorded fixtures bring Qloo's own.

export interface VocabTag {
  id: string;
  name: string;
  type: string;
  parents: string[];
}

const MEDIA = ["urn:entity:movie", "urn:entity:tv_show", "urn:entity:book"];
const SCREEN = ["urn:entity:movie", "urn:entity:tv_show"];
const BOOK = ["urn:entity:book"];
const MUSIC = ["urn:entity:artist"];
const PODCAST = ["urn:entity:podcast"];
const PLACE = ["urn:entity:place"];
const ANY = ["urn:entity:movie", "urn:entity:tv_show", "urn:entity:book", "urn:entity:artist", "urn:entity:podcast", "urn:entity:place"];

const defs: Array<[key: string, kind: string, name: string, parents: string[]]> = [
  // media genres
  ["drama", "genre:media", "Drama", MEDIA],
  ["comedy", "genre:media", "Comedy", MEDIA],
  ["dark_comedy", "genre:media", "Dark Comedy", MEDIA],
  ["thriller", "genre:media", "Thriller", MEDIA],
  ["mystery", "genre:media", "Mystery", MEDIA],
  ["crime", "genre:media", "Crime", MEDIA],
  ["science_fiction", "genre:media", "Science Fiction", MEDIA],
  ["fantasy", "genre:media", "Fantasy", MEDIA],
  ["romance", "genre:media", "Romance", MEDIA],
  ["romantic_comedy", "genre:media", "Romantic Comedy", SCREEN],
  ["documentary", "genre:media", "Documentary", SCREEN],
  ["animation", "genre:media", "Animation", SCREEN],
  ["anime", "genre:media", "Anime", SCREEN],
  ["reality", "genre:media", "Reality TV", ["urn:entity:tv_show"]],
  ["cooking_show", "genre:media", "Cooking Show", ["urn:entity:tv_show"]],
  ["period_drama", "genre:media", "Period Drama", MEDIA],
  ["horror", "genre:media", "Horror", MEDIA],
  ["family", "genre:media", "Family", MEDIA],
  ["coming_of_age", "genre:media", "Coming Of Age", MEDIA],
  ["musical", "genre:media", "Musical", SCREEN],
  ["satire", "genre:media", "Satire", MEDIA],
  ["procedural", "genre:media", "Procedural", ["urn:entity:tv_show"]],
  ["mockumentary", "genre:media", "Mockumentary", SCREEN],
  ["psychological_thriller", "genre:media", "Psychological Thriller", MEDIA],
  ["slice_of_life", "genre:media", "Slice Of Life", MEDIA],
  ["biopic", "genre:media", "Biopic", SCREEN],
  ["anthology", "genre:media", "Anthology", SCREEN],
  ["adventure", "genre:media", "Adventure", MEDIA],
  ["literary_fiction", "genre:media", "Literary Fiction", BOOK],
  ["memoir", "genre:media", "Memoir", BOOK],
  ["classic_literature", "genre:media", "Classic Literature", BOOK],
  ["detective_fiction", "genre:media", "Detective Fiction", BOOK],
  ["short_stories", "genre:media", "Short Stories", BOOK],
  ["magical_realism", "genre:media", "Magical Realism", MEDIA],
  ["young_adult", "genre:media", "Young Adult", MEDIA],
  ["fable", "genre:media", "Fable", BOOK],
  ["latin_american_literature", "genre:media", "Latin American Literature", BOOK],
  ["spanish_literature", "genre:media", "Spanish Literature", BOOK],
  ["japanese_literature", "genre:media", "Japanese Literature", BOOK],
  ["korean_literature", "genre:media", "Korean Literature", BOOK],
  ["french_literature", "genre:media", "French Literature", BOOK],
  // media keywords
  ["workplace", "keyword:media", "Workplace", MEDIA],
  ["dystopia", "keyword:media", "Dystopia", MEDIA],
  ["small_town", "keyword:media", "Small Town", MEDIA],
  ["cooking", "keyword:media", "Cooking", MEDIA],
  ["chef", "keyword:media", "Chef", MEDIA],
  ["food", "keyword:media", "Food", MEDIA],
  ["family_business", "keyword:media", "Family Business", MEDIA],
  ["whodunit", "keyword:media", "Whodunit", MEDIA],
  ["friendship", "keyword:media", "Friendship", MEDIA],
  ["grief", "keyword:media", "Grief", MEDIA],
  ["found_family", "keyword:media", "Found Family", MEDIA],
  ["surreal", "keyword:media", "Surreal", MEDIA],
  ["bureaucracy", "keyword:media", "Bureaucracy", MEDIA],
  ["time_travel", "keyword:media", "Time Travel", MEDIA],
  ["island", "keyword:media", "Island", MEDIA],
  ["power_struggle", "keyword:media", "Power Struggle", MEDIA],
  ["wealth", "keyword:media", "Wealth", MEDIA],
  ["showbiz", "keyword:media", "Show Business", MEDIA],
  ["baking", "keyword:media", "Baking", MEDIA],
  ["competition", "keyword:media", "Competition", MEDIA],
  ["seaside", "keyword:media", "Seaside", MEDIA],
  ["nostalgia", "keyword:media", "Nostalgia", MEDIA],
  ["hospital", "keyword:media", "Hospital", MEDIA],
  ["lawyer", "keyword:media", "Lawyer", MEDIA],
  ["courtroom", "keyword:media", "Courtroom", MEDIA],
  ["bookshop", "keyword:media", "Bookshop", MEDIA],
  ["dreams", "keyword:media", "Dreams", MEDIA],
  ["city_life", "keyword:media", "City Life", MEDIA],
  ["kitchen", "keyword:media", "Kitchen", MEDIA],
  ["coffee", "keyword:media", "Coffee", MEDIA],
  ["cats", "keyword:media", "Cats", MEDIA],
  ["library", "keyword:media", "Library", MEDIA],
  ["convenience_store", "keyword:media", "Convenience Store", MEDIA],
  ["school", "keyword:media", "School", MEDIA],
  ["music_industry", "keyword:media", "Music Industry", MEDIA],
  ["art", "keyword:media", "Art", MEDIA],
  ["fourth_wall", "keyword:media", "Breaking The Fourth Wall", SCREEN],
  ["cult", "keyword:media", "Cult", MEDIA],
  ["heist", "keyword:media", "Heist", MEDIA],
  ["con_artist", "keyword:media", "Con Artist", MEDIA],
  ["survival", "keyword:media", "Survival", MEDIA],
  ["sports", "keyword:media", "Sports", MEDIA],
  ["black_and_white", "keyword:media", "Black And White", SCREEN],
  ["fairy_tale", "keyword:media", "Fairy Tale", MEDIA],
  ["short_read", "keyword:media", "Short Read", BOOK],
  ["true_crime", "keyword:media", "True Crime", ["urn:entity:podcast", "urn:entity:tv_show"]],
  ["music", "keyword:media", "Music", MEDIA],
  // moods and styles
  ["melancholic", "style:qloo", "Melancholic", ANY],
  ["cozy", "style:qloo", "Cozy", ANY],
  ["witty", "style:qloo", "Witty", ANY],
  ["dark", "style:qloo", "Dark", ANY],
  ["upbeat", "style:qloo", "Upbeat", ANY],
  ["introspective", "style:qloo", "Introspective", ANY],
  ["whimsical", "style:qloo", "Whimsical", ANY],
  ["eerie", "style:qloo", "Eerie", ANY],
  ["tense", "style:qloo", "Tense", ANY],
  ["warm", "style:qloo", "Warm", ANY],
  ["quirky", "style:qloo", "Quirky", ANY],
  ["romantic", "style:qloo", "Romantic", ANY],
  ["stylish", "style:qloo", "Stylish", ANY],
  ["gentle", "style:qloo", "Gentle", ANY],
  ["chaotic", "style:qloo", "Chaotic", ANY],
  ["nostalgic", "style:qloo", "Nostalgic", ANY],
  ["dreamy", "style:qloo", "Dreamy", ANY],
  ["slow_burn", "style:qloo", "Slow Burn", MEDIA],
  // music genres
  ["indie_folk", "genre:music", "Indie Folk", MUSIC],
  ["singer_songwriter", "genre:music", "Singer-Songwriter", MUSIC],
  ["indie_rock", "genre:music", "Indie Rock", MUSIC],
  ["indie_pop", "genre:music", "Indie Pop", MUSIC],
  ["alt_rock", "genre:music", "Alternative Rock", MUSIC],
  ["alt_pop", "genre:music", "Alt Pop", MUSIC],
  ["alternative_rnb", "genre:music", "Alternative R&B", MUSIC],
  ["rnb", "genre:music", "R&B", MUSIC],
  ["pop", "genre:music", "Pop", MUSIC],
  ["country_pop", "genre:music", "Country Pop", MUSIC],
  ["electronic", "genre:music", "Electronic", MUSIC],
  ["french_house", "genre:music", "French House", MUSIC],
  ["disco", "genre:music", "Disco", MUSIC],
  ["synth_pop", "genre:music", "Synth-Pop", MUSIC],
  ["dance", "genre:music", "Dance", MUSIC],
  ["ambient", "genre:music", "Ambient", MUSIC],
  ["latin_alternative", "genre:music", "Latin Alternative", MUSIC],
  ["latin_pop", "genre:music", "Latin Pop", MUSIC],
  ["regional_mexican", "genre:music", "Regional Mexican", MUSIC],
  ["rock_en_espanol", "genre:music", "Rock En Español", MUSIC],
  ["flamenco", "genre:music", "Flamenco", MUSIC],
  ["reggaeton", "genre:music", "Reggaeton", MUSIC],
  ["cumbia", "genre:music", "Cumbia", MUSIC],
  ["bolero", "genre:music", "Bolero", MUSIC],
  ["spanish_indie", "genre:music", "Spanish Indie", MUSIC],
  ["j_pop", "genre:music", "J-Pop", MUSIC],
  ["city_pop", "genre:music", "City Pop", MUSIC],
  ["j_rock", "genre:music", "J-Rock", MUSIC],
  ["anime_soundtrack", "genre:music", "Anime Soundtrack", MUSIC],
  ["k_pop", "genre:music", "K-Pop", MUSIC],
  ["k_indie", "genre:music", "Korean Indie", MUSIC],
  ["k_ballad", "genre:music", "Korean Ballad", MUSIC],
  ["k_rock", "genre:music", "Korean Rock", MUSIC],
  ["korean_rnb", "genre:music", "Korean R&B", MUSIC],
  ["french_pop", "genre:music", "French Pop", MUSIC],
  ["chanson", "genre:music", "Chanson", MUSIC],
  // podcasts
  ["language_learning", "genre:podcast", "Language Learning", PODCAST],
  ["storytelling", "genre:podcast", "Storytelling", PODCAST],
  ["podcast_comedy", "genre:podcast", "Comedy", PODCAST],
  ["spanish_language", "keyword:podcast", "Spanish Language", PODCAST],
  ["japanese_language", "keyword:podcast", "Japanese Language", PODCAST],
  ["korean_language", "keyword:podcast", "Korean Language", PODCAST],
  ["french_language", "keyword:podcast", "French Language", PODCAST],
  // restaurants
  ["mexican", "genre:place:restaurant", "Mexican Restaurant", PLACE],
  ["tacos", "genre:place:restaurant", "Taqueria", PLACE],
  ["spanish", "genre:place:restaurant", "Spanish Restaurant", PLACE],
  ["tapas", "genre:place:restaurant", "Tapas", PLACE],
  ["argentinian", "genre:place:restaurant", "Argentinian Restaurant", PLACE],
  ["japanese", "genre:place:restaurant", "Japanese Restaurant", PLACE],
  ["ramen", "genre:place:restaurant", "Ramen", PLACE],
  ["udon", "genre:place:restaurant", "Udon", PLACE],
  ["sushi", "genre:place:restaurant", "Sushi", PLACE],
  ["izakaya", "genre:place:restaurant", "Izakaya", PLACE],
  ["korean", "genre:place:restaurant", "Korean Restaurant", PLACE],
  ["korean_bbq", "genre:place:restaurant", "Korean BBQ", PLACE],
  ["french", "genre:place:restaurant", "French Restaurant", PLACE],
  ["bistro", "genre:place:restaurant", "Bistro", PLACE],
  ["brasserie", "genre:place:restaurant", "Brasserie", PLACE],
];

function urn(kind: string, key: string): string {
  if (kind === "genre:place:restaurant") return `urn:tag:genre:place:restaurant:${key}`;
  if (key === "podcast_comedy") return "urn:tag:genre:podcast:comedy";
  return `urn:tag:${kind}:${key}`;
}

function typeOf(kind: string): string {
  return kind === "genre:place:restaurant" ? "urn:tag:genre:place" : `urn:tag:${kind}`;
}

export const VOCAB: Record<string, VocabTag> = Object.fromEntries(
  defs.map(([key, kind, name, parents]) => [key, { id: urn(kind, key), name, type: typeOf(kind), parents }]),
);

export function vocab(key: string): VocabTag {
  const tag = VOCAB[key];
  if (!tag) throw new Error(`Unknown catalog tag: ${key}`);
  return tag;
}

/** Tags that steer recommendations by mood rather than by format. */
export const TASTE_WEIGHT: Record<string, number> = {
  "style:qloo": 1.35,
  "keyword:media": 1.2,
  "genre:media": 1,
  "genre:music": 1,
  "genre:podcast": 0.6,
  "keyword:podcast": 0.2,
  "genre:place": 0.8,
};
