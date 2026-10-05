import { fnv1a } from "../qloo/query";
import type { Dialect, LanguageCode } from "./locales";

export type PhraseContext = "watch" | "listen" | "read" | "eat" | "podcast";

export interface Phrase {
  text: string;
  /** Romanization for scripts a beginner can't read yet. */
  roman?: string;
  gloss: string;
}

type Bank = Partial<Record<PhraseContext, Phrase[]>>;

const p = (text: string, gloss: string, roman?: string): Phrase => (roman ? { text, roman, gloss } : { text, gloss });

// Written by hand. Dialect lists come first; the base language fills the rest.
const BANKS: Partial<Record<LanguageCode | Dialect, Bank>> = {
  es: {
    watch: [
      p("¿Qué está pasando aquí?", "What's going on here?"),
      p("No tengo ni idea.", "I have no idea."),
      p("¿Y ahora qué hacemos?", "So what do we do now?"),
      p("Te lo juro.", "I swear."),
      p("Ya no aguanto más.", "I can't take it anymore."),
      p("¿En serio?", "Seriously?"),
    ],
    listen: [
      p("para siempre", "forever"),
      p("sin ti", "without you"),
      p("quédate conmigo", "stay with me"),
      p("mi corazón", "my heart"),
      p("no me olvides", "don't forget me"),
      p("la noche", "the night"),
    ],
    read: [
      p("de repente", "suddenly"),
      p("sin embargo", "however"),
      p("se dio cuenta de que", "realized that"),
      p("apenas", "barely, as soon as"),
      p("a lo lejos", "in the distance"),
    ],
    eat: [
      p("¿Qué me recomienda?", "What do you recommend?"),
      p("Para mí, …, por favor.", "For me, …, please."),
      p("La cuenta, por favor.", "The check, please."),
      p("¿Pica mucho?", "Is it very spicy?"),
      p("Está buenísimo.", "It's delicious."),
      p("Sin cebolla, por favor.", "No onion, please."),
    ],
    podcast: [
      p("o sea", "I mean, so"),
      p("a ver", "let's see"),
      p("la verdad es que", "honestly"),
      p("por cierto", "by the way"),
      p("es decir", "that is"),
      p("bueno", "well, OK"),
    ],
  },
  "es-MX": {
    watch: [
      p("¿Qué onda?", "What's up?"),
      p("¡Qué padre!", "How cool!"),
      p("No manches.", "No way!"),
      p("¿Neta?", "For real?"),
      p("ahorita", "in a bit (or right now)"),
      p("Órale.", "OK, wow, come on (it depends on the tone)"),
    ],
    listen: [p("te extraño", "I miss you"), p("mi vida", "my love (lit. my life)"), p("ojalá", "I hope, if only")],
    eat: [
      p("¿Me da unos tacos al pastor, por favor?", "Can I get some al pastor tacos, please?"),
      p("¿Con todo?", "With everything? (onion and cilantro)"),
      p("Para llevar.", "To go."),
      p("¿Pica?", "Is it spicy?"),
      p("Está riquísimo.", "It's delicious."),
    ],
  },
  "es-ES": {
    watch: [
      p("¡Qué fuerte!", "Wow, that's intense!"),
      p("Vale.", "OK."),
      p("¡Qué guay!", "How cool!"),
      p("Me mola.", "I like it."),
      p("tío, tía", "mate, dude (lit. uncle, aunt)"),
    ],
    listen: [p("te echo de menos", "I miss you"), p("mi vida", "my love (lit. my life)")],
    eat: [
      p("¿Me pones una caña, por favor?", "Can I get a small beer, please?"),
      p("Una ración de patatas bravas.", "A plate of patatas bravas."),
      p("¿Qué tapas tenéis?", "What tapas do you have?"),
      p("¿Nos cobras?", "Can we pay? (lit. will you charge us?)"),
      p("para picar", "to share, to nibble"),
    ],
  },
  "es-AR": {
    watch: [
      p("Che", "hey, mate"),
      p("Dale.", "OK, go ahead."),
      p("¿Viste?", "You know? See?"),
      p("Re lindo.", "Really nice."),
      p("¡Qué bárbaro!", "Amazing!"),
      p("¿Vos qué pensás?", "What do you think? (with 'vos')"),
    ],
    listen: [p("te extraño", "I miss you")],
    eat: [
      p("¿Me traés la carta?", "Can you bring me the menu?"),
      p("Un bife de chorizo, jugoso.", "A sirloin steak, medium-rare."),
      p("¿Qué me recomendás?", "What do you recommend?"),
    ],
  },
  "es-CO": {
    watch: [
      p("¡Qué chévere!", "How cool!"),
      p("¿Qué más?", "How's it going?"),
      p("Listo.", "OK, done."),
      p("Bacano.", "Great."),
      p("¡Qué pena!", "Sorry! (often 'excuse me' in Colombia)"),
    ],
    listen: [p("te extraño", "I miss you")],
    eat: [p("Regáleme un tinto, por favor.", "Can I have a black coffee, please?")],
  },
  fr: {
    watch: [
      p("C'est pas vrai !", "No way!"),
      p("Laisse tomber.", "Forget it."),
      p("Je sais pas.", "I dunno."),
      p("Ça marche.", "OK, sounds good."),
      p("T'inquiète.", "Don't worry."),
      p("On y va ?", "Shall we go?"),
    ],
    listen: [
      p("tu me manques", "I miss you (lit. you are missing to me)"),
      p("pour toujours", "forever"),
      p("mon cœur", "my heart, sweetheart"),
      p("la nuit", "the night"),
      p("encore", "again, still"),
      p("je t'aime", "I love you"),
    ],
    read: [
      p("soudain", "suddenly"),
      p("pourtant", "yet, however"),
      p("tandis que", "while, whereas"),
      p("il fut, elle dit", "he was, she said (the past tense novels use)"),
      p("à peine", "barely"),
    ],
    eat: [
      p("Je voudrais …, s'il vous plaît.", "I'd like …, please."),
      p("Qu'est-ce que vous me conseillez ?", "What do you recommend?"),
      p("L'addition, s'il vous plaît.", "The check, please."),
      p("Une carafe d'eau, s'il vous plaît.", "A jug of tap water, please."),
      p("C'était délicieux.", "It was delicious."),
      p("saignant, à point", "rare, medium"),
    ],
    podcast: [
      p("du coup", "so, as a result"),
      p("en fait", "actually"),
      p("bref", "anyway"),
      p("genre", "like"),
      p("c'est-à-dire", "that is"),
      p("quoi", "(at the end of a sentence) you know"),
    ],
  },
  "fr-CA": {
    watch: [p("C'est correct.", "It's fine."), p("Tiguidou !", "All good!"), p("Pantoute.", "Not at all."), p("J'ai hâte.", "I can't wait.")],
    eat: [p("Je vais prendre …", "I'll have …"), p("La facture, s'il vous plaît.", "The bill, please."), p("Bienvenue !", "You're welcome! (in Quebec)")],
  },
  "fr-BE": {
    watch: [p("septante, nonante", "seventy, ninety"), p("le dîner", "lunch (in Belgium)"), p("le souper", "dinner (in Belgium)")],
    listen: [p("septante, nonante", "seventy, ninety (Belgian numbers)")],
  },
  ja: {
    watch: [
      p("本当に？", "Really?", "hontō ni?"),
      p("大丈夫？", "Are you OK?", "daijōbu?"),
      p("ちょっと待って", "Wait a second.", "chotto matte"),
      p("どうしよう", "What do I do?", "dō shiyō"),
      p("すごい！", "Amazing!", "sugoi!"),
      p("なるほど", "I see.", "naruhodo"),
    ],
    listen: [
      p("会いたい", "I want to see you", "aitai"),
      p("君", "you (common in lyrics)", "kimi"),
      p("夢", "dream", "yume"),
      p("ずっと", "always, all along", "zutto"),
      p("涙", "tears", "namida"),
      p("さよなら", "goodbye (for a long time)", "sayonara"),
    ],
    read: [
      p("しかし", "however", "shikashi"),
      p("ふと", "suddenly, without thinking", "futo"),
      p("〜ような気がする", "I have a feeling that …", "yō na ki ga suru"),
      p("やがて", "before long", "yagate"),
    ],
    eat: [
      p("すみません！", "Excuse me! (to call staff)", "sumimasen!"),
      p("これをください", "This one, please.", "kore o kudasai"),
      p("おすすめは何ですか？", "What do you recommend?", "osusume wa nan desu ka?"),
      p("お会計お願いします", "The check, please.", "okaikei onegaishimasu"),
      p("いただきます", "(said before eating)", "itadakimasu"),
      p("ごちそうさまでした", "Thank you for the meal.", "gochisōsama deshita"),
    ],
    podcast: [
      p("えっと", "um", "etto"),
      p("やっぱり", "as expected, after all", "yappari"),
      p("そうですね", "right, let me think", "sō desu ne"),
      p("なんか", "like, kind of", "nanka"),
      p("つまり", "in other words", "tsumari"),
    ],
  },
  ko: {
    watch: [
      p("진짜?", "Really?", "jinjja?"),
      p("괜찮아?", "Are you OK?", "gwaenchana?"),
      p("잠깐만", "Wait a moment.", "jamkkanman"),
      p("대박!", "Awesome! No way!", "daebak!"),
      p("어떡해", "What do I do?", "eotteokae"),
      p("아이고", "Oh dear.", "aigo"),
    ],
    listen: [
      p("사랑해", "I love you", "saranghae"),
      p("보고 싶어", "I miss you", "bogo sipeo"),
      p("너", "you", "neo"),
      p("우리", "we, us", "uri"),
      p("영원히", "forever", "yeongwonhi"),
      p("눈물", "tears", "nunmul"),
    ],
    read: [
      p("그런데", "but, by the way", "geureonde"),
      p("갑자기", "suddenly", "gapjagi"),
      p("마치", "as if", "machi"),
      p("결국", "in the end", "gyeolguk"),
    ],
    eat: [
      p("여기요!", "Excuse me! (to call staff)", "yeogiyo!"),
      p("이거 주세요", "This one, please.", "igeo juseyo"),
      p("덜 맵게 해 주세요", "Less spicy, please.", "deol maepge hae juseyo"),
      p("계산해 주세요", "The check, please.", "gyesanhae juseyo"),
      p("잘 먹겠습니다", "(said before eating)", "jal meokgetseumnida"),
      p("맛있어요", "It's delicious.", "masisseoyo"),
    ],
    podcast: [
      p("그러니까", "so, I mean", "geureonikka"),
      p("약간", "a bit, kind of", "yakgan"),
      p("아무튼", "anyway", "amuteun"),
      p("사실", "actually", "sasil"),
      p("그래서", "so, therefore", "geuraeseo"),
    ],
  },
  pt: {
    watch: [p("Nossa!", "Wow!"), p("Beleza?", "All good?"), p("Fala sério!", "Come on! Seriously?"), p("Tô nem aí.", "I don't care."), p("Que legal!", "How cool!")],
    listen: [p("saudade", "longing for someone or something"), p("meu bem", "my dear"), p("coração", "heart"), p("pra sempre", "forever")],
    read: [p("de repente", "suddenly"), p("no entanto", "however"), p("mal", "barely, as soon as")],
    eat: [p("Me vê um …, por favor.", "Can I get a …, please?"), p("A conta, por favor.", "The check, please."), p("Tá uma delícia.", "It's delicious."), p("O que você recomenda?", "What do you recommend?")],
    podcast: [p("tipo", "like"), p("né?", "right?"), p("então", "so"), p("aliás", "by the way")],
  },
  "pt-PT": {
    watch: [p("Fixe!", "Cool!"), p("Pois.", "Right. Yeah."), p("Bora!", "Let's go!"), p("Está bem.", "OK.")],
    eat: [p("Queria um …, se faz favor.", "I'd like a …, please."), p("A conta, se faz favor.", "The check, please."), p("um café", "an espresso")],
  },
  it: {
    watch: [p("Dai!", "Come on!"), p("Boh.", "Dunno."), p("Magari!", "I wish!"), p("Allora …", "So …"), p("Ma dai!", "No way!")],
    listen: [p("ti amo", "I love you"), p("per sempre", "forever"), p("il cuore", "the heart"), p("mi manchi", "I miss you")],
    read: [p("all'improvviso", "suddenly"), p("tuttavia", "however"), p("appena", "just, as soon as")],
    eat: [p("Vorrei …, per favore.", "I'd like …, please."), p("Il conto, per favore.", "The check, please."), p("Cosa mi consiglia?", "What do you recommend?"), p("Buonissimo!", "Delicious!")],
    podcast: [p("cioè", "I mean"), p("insomma", "in short, well"), p("praticamente", "basically"), p("comunque", "anyway")],
  },
  de: {
    watch: [p("Echt?", "Really?"), p("Keine Ahnung.", "No idea."), p("Alles klar.", "Got it."), p("Na ja …", "Well …"), p("Krass!", "Wow!")],
    listen: [p("Ich vermisse dich", "I miss you"), p("für immer", "forever"), p("das Herz", "the heart"), p("die Nacht", "the night")],
    read: [p("plötzlich", "suddenly"), p("jedoch", "however"), p("kaum", "barely")],
    eat: [p("Ich hätte gern …", "I'd like …"), p("Die Rechnung, bitte.", "The check, please."), p("Was empfehlen Sie?", "What do you recommend?"), p("Lecker!", "Tasty!")],
    podcast: [p("also", "so, well"), p("halt", "just, simply (filler)"), p("eigentlich", "actually"), p("genau", "exactly")],
  },
  "de-AT": {
    watch: [p("Servus!", "Hi! Bye!"), p("Passt.", "That works."), p("Grüß Gott!", "Hello! (formal)")],
    eat: [p("Zahlen, bitte!", "The check, please!"), p("ein Verlängerter", "a long coffee (espresso topped up with hot water)")],
  },
};

export function phrasesFor(language: LanguageCode, dialect: Dialect, context: PhraseContext, seed: string, count = 2): Phrase[] {
  const local = BANKS[dialect]?.[context] ?? [];
  const base = BANKS[language]?.[context] ?? [];
  const pool: Phrase[] = [];
  const seen = new Set<string>();
  for (const phrase of [...local, ...base]) {
    if (seen.has(phrase.text)) continue;
    seen.add(phrase.text);
    pool.push(phrase);
  }
  if (pool.length <= count) return pool;
  // Prefer dialect phrases for the first slot, then rotate by a stable seed.
  const start = fnv1a(seed) % pool.length;
  const picked: Phrase[] = [];
  if (local.length > 0) picked.push(local[fnv1a(`${seed}:local`) % local.length]!);
  for (let i = 0; picked.length < count && i < pool.length; i += 1) {
    const phrase = pool[(start + i) % pool.length]!;
    if (!picked.some((existing) => existing.text === phrase.text)) picked.push(phrase);
  }
  return picked;
}
