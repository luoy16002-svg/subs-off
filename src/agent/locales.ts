export type LanguageCode = "es" | "fr" | "ja" | "ko" | "pt" | "it" | "de";

export type Dialect =
  | "es-MX" | "es-ES" | "es-AR" | "es-CO"
  | "fr-FR" | "fr-CA" | "fr-BE"
  | "ja-JP" | "ko-KR"
  | "pt-BR" | "pt-PT"
  | "it-IT"
  | "de-DE" | "de-AT";

export interface City {
  slug: string;
  name: string;
  /** Text sent to Qloo as signal.location.query. */
  query: string;
  country: string;
  dialect: Dialect;
}

export interface LocalePack {
  code: LanguageCode;
  name: string;
  nativeName: string;
  /** Values for Qloo's filter.release_country on films and series. */
  countries: string[];
  /** How the release countries read in plain words. */
  countryLabel: string;
  cities: City[];
  /** Semantic /v2/tags queries that find music, book, podcast and cuisine tags for this language. */
  tagQueries: {
    music: string[];
    book: string[];
    podcast: string[];
    food: string[];
  };
  /** Words that mark a tag as belonging to this language's culture, used to keep tag search on target. */
  tagHints: RegExp;
  dialectByCountry: Record<string, Dialect>;
  dialectNotes: Partial<Record<Dialect, string>>;
  /** True when the offline sample catalog covers this language. */
  offline: boolean;
  /** The titles every beginner list repeats; shown only when our plan avoids them. */
  usualList: string[];
}

export const LOCALES: Record<LanguageCode, LocalePack> = {
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    countries: ["Spain", "Mexico", "Argentina", "Colombia", "Chile", "Peru", "Uruguay"],
    countryLabel: "Spain and Latin America",
    cities: [
      { slug: "mexico-city", name: "Mexico City", query: "Mexico City", country: "Mexico", dialect: "es-MX" },
      { slug: "madrid", name: "Madrid", query: "Madrid", country: "Spain", dialect: "es-ES" },
      { slug: "buenos-aires", name: "Buenos Aires", query: "Buenos Aires", country: "Argentina", dialect: "es-AR" },
      { slug: "bogota", name: "Bogotá", query: "Bogotá", country: "Colombia", dialect: "es-CO" },
    ],
    tagQueries: {
      music: ["latin alternative", "latin pop", "rock en español", "spanish indie", "regional mexican"],
      book: ["latin american literature", "spanish literature"],
      podcast: ["spanish language", "learn spanish"],
      food: ["mexican restaurant", "spanish restaurant", "tapas", "argentinian restaurant"],
    },
    tagHints: /latin|spanish|espa|mexic|argentin|colombia|flamenco|reggaeton|cumbia|bolero|tapas|taquer|salsa|bachata/i,
    dialectByCountry: { Spain: "es-ES", Mexico: "es-MX", Argentina: "es-AR", Uruguay: "es-AR", Colombia: "es-CO", Chile: "es-CO", Peru: "es-CO" },
    dialectNotes: {
      "es-ES": "Spain Spanish: you'll hear 'vosotros' and a 'th' sound in words like 'gracias'.",
      "es-MX": "Mexican Spanish: clear vowels and an easy pace, a good model to copy.",
      "es-AR": "Argentine Spanish: 'vos' instead of 'tú', and 'll' sounds like 'sh'.",
      "es-CO": "Colombian Spanish: very clear, with polite 'usted' even among friends.",
    },
    offline: true,
    usualList: ["La casa de papel", "Narcos", "Élite", "Shakira", "Don Quijote"],
  },
  fr: {
    code: "fr",
    name: "French",
    nativeName: "Français",
    countries: ["France", "Belgium", "Switzerland"],
    countryLabel: "France, Belgium and Switzerland",
    cities: [
      { slug: "paris", name: "Paris", query: "Paris", country: "France", dialect: "fr-FR" },
      { slug: "montreal", name: "Montréal", query: "Montreal", country: "Canada", dialect: "fr-CA" },
    ],
    tagQueries: {
      music: ["french pop", "chanson", "french electronic"],
      book: ["french literature"],
      podcast: ["french language", "learn french"],
      food: ["french restaurant", "bistro", "brasserie"],
    },
    tagHints: /french|fran|chanson|bistro|brasserie|belg|quebec|qu[ée]b/i,
    dialectByCountry: { France: "fr-FR", Belgium: "fr-BE", Switzerland: "fr-FR", Canada: "fr-CA" },
    dialectNotes: {
      "fr-FR": "Spoken French drops the 'ne': 'je sais pas' is normal on screen.",
      "fr-BE": "Belgian French says 'septante' and 'nonante' for 70 and 90.",
      "fr-CA": "Quebec French has its own vowels and words; give your ear a few episodes.",
    },
    offline: true,
    usualList: ["Amélie", "Lupin", "The Intouchables", "Édith Piaf", "Le Petit Prince"],
  },
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    countries: ["Japan"],
    countryLabel: "Japan",
    cities: [
      { slug: "tokyo", name: "Tokyo", query: "Tokyo", country: "Japan", dialect: "ja-JP" },
      { slug: "osaka", name: "Osaka", query: "Osaka", country: "Japan", dialect: "ja-JP" },
    ],
    tagQueries: {
      music: ["j-pop", "city pop", "j-rock"],
      book: ["japanese literature"],
      podcast: ["japanese language", "learn japanese"],
      food: ["japanese restaurant", "ramen", "udon", "izakaya"],
    },
    tagHints: /j-?pop|j-?rock|japan|city pop|anime|ramen|udon|sushi|izakaya|shibuya/i,
    dialectByCountry: { Japan: "ja-JP" },
    dialectNotes: {
      "ja-JP": "Listen for polite -masu forms with strangers and short casual forms between friends.",
    },
    offline: true,
    usualList: ["Spirited Away", "Your Name.", "Naruto", "Norwegian Wood"],
  },
  ko: {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    countries: ["South Korea", "Korea, Republic of"],
    countryLabel: "South Korea",
    cities: [
      { slug: "seoul", name: "Seoul", query: "Seoul", country: "South Korea", dialect: "ko-KR" },
      { slug: "busan", name: "Busan", query: "Busan", country: "South Korea", dialect: "ko-KR" },
    ],
    tagQueries: {
      music: ["k-pop", "korean indie", "korean ballad", "korean r&b"],
      book: ["korean literature"],
      podcast: ["korean language", "learn korean"],
      food: ["korean restaurant", "korean bbq"],
    },
    tagHints: /k-?pop|korean|k-?indie|korea|hangul|bbq/i,
    dialectByCountry: { "South Korea": "ko-KR", "Korea, Republic of": "ko-KR" },
    dialectNotes: {
      "ko-KR": "Listen for the polite '-요' ending; friends drop it and speak in short forms.",
    },
    offline: true,
    usualList: ["Squid Game", "Parasite", "BTS", "Train to Busan"],
  },
  pt: {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    countries: ["Brazil", "Portugal"],
    countryLabel: "Brazil and Portugal",
    cities: [
      { slug: "sao-paulo", name: "São Paulo", query: "São Paulo", country: "Brazil", dialect: "pt-BR" },
      { slug: "rio-de-janeiro", name: "Rio de Janeiro", query: "Rio de Janeiro", country: "Brazil", dialect: "pt-BR" },
      { slug: "lisbon", name: "Lisbon", query: "Lisbon", country: "Portugal", dialect: "pt-PT" },
    ],
    tagQueries: {
      music: ["mpb", "bossa nova", "brazilian pop", "fado"],
      book: ["brazilian literature", "portuguese literature"],
      podcast: ["portuguese language", "learn portuguese"],
      food: ["brazilian restaurant", "portuguese restaurant"],
    },
    tagHints: /brazil|brasil|portug|bossa|mpb|samba|fado|sertanejo|forr/i,
    dialectByCountry: { Brazil: "pt-BR", Portugal: "pt-PT" },
    dialectNotes: {
      "pt-BR": "Brazilian Portuguese: open vowels, and 'te' and 'de' often sound like 'tchi' and 'dji'.",
      "pt-PT": "European Portuguese swallows unstressed vowels; slow the audio down if you need to.",
    },
    offline: false,
    usualList: ["City of God", "3%", "Anitta", "The Alchemist"],
  },
  it: {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    countries: ["Italy"],
    countryLabel: "Italy",
    cities: [
      { slug: "rome", name: "Rome", query: "Rome", country: "Italy", dialect: "it-IT" },
      { slug: "milan", name: "Milan", query: "Milan", country: "Italy", dialect: "it-IT" },
    ],
    tagQueries: {
      music: ["italian pop", "cantautori", "italian indie"],
      book: ["italian literature"],
      podcast: ["italian language", "learn italian"],
      food: ["italian restaurant", "trattoria"],
    },
    tagHints: /italia|cantautor|trattoria|pizz|neapolitan/i,
    dialectByCountry: { Italy: "it-IT" },
    dialectNotes: {
      "it-IT": "Listen for regional accents: Roman, Milanese and Neapolitan Italian sound very different.",
    },
    offline: false,
    usualList: ["Life Is Beautiful", "My Brilliant Friend", "Andrea Bocelli", "Cinema Paradiso"],
  },
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    countries: ["Germany", "Austria"],
    countryLabel: "Germany and Austria",
    cities: [
      { slug: "berlin", name: "Berlin", query: "Berlin", country: "Germany", dialect: "de-DE" },
      { slug: "munich", name: "Munich", query: "Munich", country: "Germany", dialect: "de-DE" },
      { slug: "vienna", name: "Vienna", query: "Vienna", country: "Austria", dialect: "de-AT" },
    ],
    tagQueries: {
      music: ["german pop", "deutschrap", "german indie"],
      book: ["german literature"],
      podcast: ["german language", "learn german"],
      food: ["german restaurant", "austrian restaurant"],
    },
    tagHints: /german|deutsch|austria|krautrock|schlager|biergarten/i,
    dialectByCountry: { Germany: "de-DE", Austria: "de-AT" },
    dialectNotes: {
      "de-DE": "Spoken German shortens a lot: 'ich hab' for 'ich habe', 'is' for 'ist'.",
      "de-AT": "Austrian German has its own words, like 'Servus' for hello and goodbye.",
    },
    offline: false,
    usualList: ["Dark", "Run Lola Run", "Rammstein", "The Metamorphosis"],
  },
};

export function getLocale(code: string): LocalePack | undefined {
  return (LOCALES as Record<string, LocalePack>)[code];
}

export function getCity(pack: LocalePack, slug: string | undefined): City {
  return pack.cities.find((city) => city.slug === slug) ?? pack.cities[0]!;
}

export function dialectFor(pack: LocalePack, countries: string[], city: City): Dialect {
  for (const country of countries) {
    const dialect = pack.dialectByCountry[country];
    if (dialect) return dialect;
  }
  return city.dialect;
}
