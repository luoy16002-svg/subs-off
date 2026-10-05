import { LruCache } from "../qloo/cache";
import { shortHash } from "../qloo/query";
import type { WriterFacts } from "./explain";

/** The subset of the Workers AI binding this app uses. */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
}

export interface WriterOutput {
  intro?: string;
  whys: Record<string, string>;
}

export interface Writer {
  readonly name: "workers-ai";
  write(facts: WriterFacts, signal?: AbortSignal): Promise<WriterOutput | undefined>;
}

// Phrases that make copy read as machine-written. Anything containing them
// falls back to the plain template sentence.
const BANNED = /\b(delve|dive into|tapestry|vibrant|embark|journey|unlock|elevate|immerse yourself|seamless|testament|captivating|nestled|bustling|game[- ]changer|must[- ]watch|perfect blend|melting pot|whether you're|look no further|treasure trove|rollercoaster|gem|masterpiece|you'll love|you will love)\b/i;

const SYSTEM = [
  "You write short notes for a language-learning app.",
  "Each note says why one recommendation fits the learner, using only the facts given: the favorites that drove the match (drivers, with their share of the match) and the shared tags.",
  "Rules: one or two short sentences per note, under 30 words. Plain, warm, specific. Name at least one driver or shared tag.",
  "Never invent plot details, awards, ratings, people or places. Never claim the learner will like it. No exclamation marks, no emoji, no dashes.",
  "Also write an intro: one sentence about the week as a whole, under 25 words.",
  'Reply with JSON only: {"intro": "...", "notes": {"<id>": "..."}}',
].join(" ");

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function responseText(result: unknown): string | undefined {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.response === "string") return record.response;
    if (record.response && typeof record.response === "object") return JSON.stringify(record.response);
    const choices = record.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
  }
  return undefined;
}

function clean(sentence: string): string {
  return sentence
    .replace(/\s+[—–]\s+/g, ", ")
    .replace(/[—–]/g, ", ")
    .replace(/!+/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

/** Accepts a note only if it is short, plain and grounded in a given fact. */
export function acceptNote(note: unknown, grounding: string[]): string | undefined {
  if (typeof note !== "string") return undefined;
  const text = clean(note);
  if (text.length < 20 || text.length > 220) return undefined;
  if (BANNED.test(text)) return undefined;
  const lower = text.toLowerCase();
  if (grounding.length > 0 && !grounding.some((fact) => lower.includes(fact.toLowerCase()))) return undefined;
  return text;
}

export interface WorkersAiWriterOptions {
  model: string;
  fallbackModels?: string[];
  timeoutMs?: number;
  maxCallsPerMinute?: number;
  /** Per-isolate ceiling that keeps usage inside the free Workers AI allocation. */
  maxCallsPerDay?: number;
}

/** Workers AI writes the notes; Qloo already chose and ranked every pick. */
export class WorkersAiWriter implements Writer {
  readonly name = "workers-ai" as const;
  readonly #ai: AiBinding;
  readonly #models: string[];
  readonly #timeoutMs: number;
  readonly #maxPerMinute: number;
  readonly #maxPerDay: number;
  readonly #cache = new LruCache<WriterOutput>(200);
  #window: number[] = [];
  #day = { start: 0, count: 0 };

  constructor(ai: AiBinding, options: WorkersAiWriterOptions) {
    this.#ai = ai;
    this.#models = [options.model, ...(options.fallbackModels ?? [])].filter((m, i, all) => m && all.indexOf(m) === i);
    this.#timeoutMs = options.timeoutMs ?? 7000;
    this.#maxPerMinute = options.maxCallsPerMinute ?? 20;
    this.#maxPerDay = options.maxCallsPerDay ?? 300;
  }

  #allowCall(now = Date.now()): boolean {
    if (now - this.#day.start >= 86_400_000) this.#day = { start: now, count: 0 };
    if (this.#day.count >= this.#maxPerDay) return false;
    this.#window = this.#window.filter((t) => now - t < 60_000);
    if (this.#window.length >= this.#maxPerMinute) return false;
    this.#window.push(now);
    this.#day.count += 1;
    return true;
  }

  async write(facts: WriterFacts): Promise<WriterOutput | undefined> {
    const key = shortHash(JSON.stringify(facts));
    const cached = this.#cache.get(key);
    if (cached) return cached;
    if (!this.#allowCall()) return undefined;

    const user = JSON.stringify({
      learner: facts.learner,
      favorites: facts.favorites,
      picks: facts.picks.map(({ draft, ...pick }) => ({ ...pick, example: draft })),
    });

    for (const model of this.#models) {
      try {
        const result = await withTimeout(
          this.#ai.run(model, {
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: user },
            ],
            max_tokens: 900,
            temperature: 0.4,
          }),
          this.#timeoutMs,
        );
        const text = responseText(result);
        const parsed = text ? (extractJson(text) as { intro?: unknown; notes?: Record<string, unknown> } | undefined) : undefined;
        if (!parsed || typeof parsed !== "object") continue;
        const whys: Record<string, string> = {};
        for (const pick of facts.picks) {
          const grounding = [...pick.drivers.map((d) => d.name), ...pick.sharedTags, facts.learner.city, ...(facts.learner.homeCity ? [facts.learner.homeCity] : [])];
          const accepted = acceptNote(parsed.notes?.[pick.id], grounding);
          if (accepted) whys[pick.id] = accepted;
        }
        const intro = acceptNote(parsed.intro, [facts.learner.language, facts.learner.city, ...facts.favorites]);
        if (Object.keys(whys).length === 0 && !intro) continue;
        const output: WriterOutput = { whys, ...(intro ? { intro } : {}) };
        this.#cache.set(key, output, 6 * 60 * 60 * 1000);
        return output;
      } catch {
        // Try the next model; templates stay in place if all fail.
      }
    }
    return undefined;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
