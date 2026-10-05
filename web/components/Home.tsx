import { IconArrowRight } from "@tabler/icons-preact";
import type { AppConfig } from "../lib/api";
import { LEVELS, possessive } from "../lib/labels";
import { STROKE, SubtitleScreen, toneFor } from "./visual";

type Sample = AppConfig["samples"][number];

function languageName(config: AppConfig, code: string): string {
  return config.languages.find((l) => l.code === code)?.name ?? code;
}

function cityName(config: AppConfig, code: string, slug: string): string {
  return config.languages.find((l) => l.code === code)?.cities.find((c) => c.slug === slug)?.name ?? slug;
}

function LearnerCard({ sample, config, onPick }: { sample: Sample; config: AppConfig; onPick: (sample: Sample) => void }) {
  const { input } = sample;
  const { tone } = toneFor(sample.id);
  const level = LEVELS.find((l) => l.id === input.level)?.name ?? input.level;
  return (
    <button type="button" class="learner" onClick={() => onPick(sample)}>
      <span class="learner__face" style={{ "--tone": tone }} aria-hidden="true">
        {input.name?.charAt(0)}
      </span>
      <span class="learner__body">
        <span class="learner__name">{input.name}</span>
        <span class="learner__lang">
          {languageName(config, input.language)}, {cityName(config, input.language, input.targetCity)}
        </span>
        <span class="learner__meta">
          {level}, {input.minutesPerDay} min a day
        </span>
        <span class="learner__blurb">{sample.blurb}</span>
        <span class="learner__loves">
          <span class="learner__loves-label">Loves</span> {input.favorites.map((f) => f.name).join(", ")}
        </span>
      </span>
      <span class="learner__go">
        See {possessive(input.name)} week <IconArrowRight size={16} stroke={STROKE} aria-hidden="true" />
      </span>
    </button>
  );
}

const STEPS: Array<{ call: string; text: string }> = [
  { call: "GET /search", text: "Finds each of your favorites among Qloo's 250 million entities." },
  { call: "GET /v2/insights  urn:tag", text: "Reads the taste behind them: the moods, themes and genres they share." },
  { call: "GET /v2/tags", text: "Finds the language's own genres in Qloo's tag graph, like Latin Alternative or City Pop." },
  {
    call: "GET /v2/insights  ×6",
    text: "Ranks series, films, artists, books, podcasts and restaurants with your favorites as signals, the city you picked as a location signal, and explainability on.",
  },
];

export function Home({ config, onStart, onPick, hasSaved, onResume }: { config: AppConfig; onStart: () => void; onPick: (sample: Sample) => void; hasSaved: boolean; onResume: () => void }) {
  const maya = config.samples[0];
  return (
    <main id="main">
      <section class="hero">
        <div class="hero__copy">
          <h1>
            <span>Your taste,</span> <span>in another language.</span>
          </h1>
          <p class="hero__sub">Name four things you love. Qloo's taste graph finds matching series, songs, books and food in the language you're learning.</p>
          <div class="hero__ctas">
            <button type="button" class="btn btn--sub" onClick={onStart}>
              Build my week
            </button>
            {hasSaved ? (
              <button type="button" class="btn btn--ghost" onClick={onResume}>
                Open my last week
              </button>
            ) : maya ? (
              <button type="button" class="btn btn--ghost" onClick={() => onPick(maya)}>
                See {possessive(maya.input.name)} week
              </button>
            ) : null}
          </div>
        </div>
        <SubtitleScreen />
      </section>

      <section class="learners" aria-labelledby="learners-title">
        <h2 id="learners-title">Who's learning?</h2>
        <p class="section-lede">Pick a learner to see a full week, built live from their favorites.</p>
        <div class="learners__grid">
          {config.samples.map((sample) => (
            <LearnerCard sample={sample} config={config} onPick={onPick} />
          ))}
        </div>
      </section>

      <section class="how" id="how" aria-labelledby="how-title">
        <div class="how__intro">
          <h2 id="how-title">What the agent does with your four favorites</h2>
          <p>
            Language learners are told to watch and listen to things they enjoy. The hard part is finding them. An LLM on its own tends to hand everyone the same short list. This agent asks Qloo, which knows what fans of your
            favorites like across film, music, books and dining, and what people in the city you picked lean toward.
          </p>
          <p class="how__small">Every pick and its rank come from Qloo. Llama on Cloudflare Workers AI only rewrites the short notes, and plain templates take over when it's unavailable.</p>
        </div>
        <ol class="how__steps">
          {STEPS.map((step) => (
            <li>
              <code>{step.call}</code>
              <span>{step.text}</span>
            </li>
          ))}
          <li>
            <code>likes, skips</code>
            <span>Your likes go back in as signals and your skips as exclusions, and the week re-plans.</span>
          </li>
        </ol>
      </section>
    </main>
  );
}
