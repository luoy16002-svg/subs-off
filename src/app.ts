import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";
import { writerFacts } from "./agent/explain";
import { LOCALES } from "./agent/locales";
import { AgentError, runAgent } from "./agent/planner";
import { SAMPLE_LEARNERS } from "./agent/samples";
import type { AgentEvent, Plan } from "./agent/types";
import type { AppEnv } from "./config";
import { QlooError } from "./qloo/errors";
import type { EntityKind } from "./qloo/types";
import type { Services } from "./services";
import { parseLearner } from "./validate";

export const APP_VERSION = "1.0.0";

type Env = { Bindings: AppEnv };

interface AppOptions {
  services: (env: AppEnv) => Services;
}

export const SEARCH_KINDS: EntityKind[] = ["tv_show", "movie", "artist", "book", "podcast"];

/** A tiny fixed-window limiter per client, per isolate. */
class RateLimiter {
  readonly #hits = new Map<string, { start: number; count: number }>();
  constructor(readonly limit: number, readonly windowMs = 60_000) {}
  allow(key: string, now = Date.now()): boolean {
    const entry = this.#hits.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      this.#hits.set(key, { start: now, count: 1 });
      if (this.#hits.size > 5000) this.#hits.clear();
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }
}

function clientKey(c: Context<Env>): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function errorPayload(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof AgentError) return { code: error.code, message: error.message, retryable: error.retryable };
  if (error instanceof QlooError) {
    const friendly: Record<string, string> = {
      QLOO_AUTH: "The Qloo key on this server was rejected. The owner needs to check it.",
      QLOO_RATE_LIMIT: "Qloo is busy right now. Try again in a minute.",
      QLOO_TIMEOUT: "Qloo took too long to answer. Try again.",
      QLOO_NETWORK: "Couldn't reach Qloo. Try again in a moment.",
      QLOO_UPSTREAM: "Qloo had a hiccup. Try again in a moment.",
    };
    return { code: error.code, message: friendly[error.code] ?? error.message, retryable: error.retryable };
  }
  return { code: "INTERNAL", message: "Something went wrong while building your week.", retryable: true };
}

async function polish(plan: Plan, services: Services): Promise<Extract<AgentEvent, { type: "notes" }> | undefined> {
  if (!services.writer || plan.picks.length === 0) return undefined;
  try {
    const output = await services.writer.write(writerFacts(plan));
    if (!output || Object.keys(output.whys).length === 0) return undefined;
    return { type: "notes", writer: "workers-ai", whys: output.whys, ...(output.intro ? { intro: output.intro } : {}) };
  } catch {
    return undefined;
  }
}

export function createApp(options: AppOptions) {
  const app = new Hono<Env>();
  const planLimiter = new RateLimiter(20);
  const searchLimiter = new RateLimiter(120);

  app.use("/api/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  app.get("/api/health", (c) => {
    const services = options.services(c.env ?? {});
    return c.json({
      ok: true,
      version: APP_VERSION,
      mode: services.config.mode,
      recordedResponses: services.recorded.size,
      writer: services.writer ? { kind: "workers-ai", model: services.config.ai.model } : { kind: "templates" },
      warnings: services.config.warnings,
    });
  });

  app.get("/api/config", (c) => {
    const services = options.services(c.env ?? {});
    const offline = services.config.mode === "fixtures";
    return c.json({
      mode: services.config.mode,
      writer: services.writer ? "workers-ai" : "templates",
      languages: Object.values(LOCALES)
        .filter((pack) => !offline || pack.offline)
        .map((pack) => ({ code: pack.code, name: pack.name, nativeName: pack.nativeName, cities: pack.cities.map((city) => ({ slug: city.slug, name: city.name })) })),
      samples: SAMPLE_LEARNERS.map((sample) => ({ id: sample.id, blurb: sample.blurb, input: sample.input })),
    });
  });

  app.get("/api/search", async (c) => {
    if (!searchLimiter.allow(clientKey(c))) return c.json({ error: "Too many searches. Slow down a little." }, 429);
    const q = (c.req.query("q") ?? "").trim().slice(0, 80);
    const kindParam = c.req.query("kind");
    const kinds = SEARCH_KINDS.filter((k) => k === kindParam);
    if (q.length < 2) return c.json({ results: [] });
    const services = options.services(c.env ?? {});
    try {
      const result = await services.qloo.search(q, { kinds: kinds.length ? kinds : SEARCH_KINDS, take: 7 });
      return c.json({
        results: result.data.slice(0, 7).map((e) => ({
          id: e.id,
          name: e.name,
          kind: e.kind,
          ...(e.year ? { year: e.year } : {}),
          ...(e.disambiguation ? { detail: e.disambiguation } : {}),
          ...(e.image ? { image: e.image } : {}),
        })),
        source: result.call.source,
      });
    } catch (error) {
      const payload = errorPayload(error);
      return c.json({ results: [], error: payload.message }, payload.code === "QLOO_RATE_LIMIT" ? 429 : 502);
    }
  });

  app.post("/api/plan", async (c) => {
    if (!planLimiter.allow(clientKey(c))) {
      return c.json({ error: { code: "RATE_LIMIT", message: "That's a lot of weeks in a minute. Give it a moment.", retryable: true } }, 429);
    }
    const services = options.services(c.env ?? {});
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: "BAD_INPUT", message: "Send the learner profile as JSON.", retryable: false } }, 400);
    }
    const parsed = parseLearner(body, { offlineOnly: services.config.mode === "fixtures" });
    if (!parsed.ok) return c.json({ error: { code: "BAD_INPUT", message: parsed.error, retryable: false } }, 400);
    const deps = { qloo: services.qloo, mode: services.config.mode };

    if (c.req.query("format") === "json") {
      try {
        const plan = await runAgent(parsed.value, deps);
        const notes = await polish(plan, services);
        return c.json({ plan, ...(notes ? { notes } : {}) });
      } catch (error) {
        const payload = errorPayload(error);
        return c.json({ error: payload }, payload.code === "NO_FAVORITES" || payload.code === "NO_RESULTS" ? 422 : 502);
      }
    }

    c.header("Content-Type", "application/x-ndjson; charset=utf-8");
    c.header("X-Accel-Buffering", "no");
    return stream(c, async (out) => {
      let chain: Promise<unknown> = Promise.resolve();
      const send = (event: AgentEvent) => {
        chain = chain.then(() => out.write(`${JSON.stringify(event)}\n`)).catch(() => undefined);
        return chain;
      };
      try {
        const plan = await runAgent(parsed.value, deps, (event) => void send(event));
        await send({ type: "plan", plan });
        const notes = await polish(plan, services);
        if (notes) await send(notes);
      } catch (error) {
        await send({ type: "error", error: errorPayload(error) });
      } finally {
        await send({ type: "done" });
      }
    });
  });

  app.all("/api/*", (c) => c.json({ error: { code: "NOT_FOUND", message: "No such endpoint.", retryable: false } }, 404));

  return app;
}
