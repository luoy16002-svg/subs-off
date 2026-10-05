import { describe, expect, it, vi } from "vitest";
import { writerFacts } from "../src/agent/explain";
import { WorkersAiWriter, acceptNote, type AiBinding } from "../src/agent/llm";
import { runAgent } from "../src/agent/planner";
import { sampleById } from "../src/agent/samples";
import { createApp } from "../src/app";
import { resolveConfig } from "../src/config";
import { createServices } from "../src/services";
import { fakeQlooFetch, readNdjson } from "./helpers";

const maya = sampleById("maya")!.input;

async function offlinePlan() {
  const services = createServices({});
  return runAgent(maya, { qloo: services.qloo, mode: "fixtures" });
}

describe("config and fallbacks", () => {
  it("runs offline without a key and switches to live when a key is set", () => {
    expect(resolveConfig({}).mode).toBe("fixtures");
    expect(resolveConfig({ QLOO_API_KEY: "k" }).mode).toBe("live");
    expect(resolveConfig({ QLOO_API_KEY: "k", QLOO_MODE: "fixtures" }).mode).toBe("fixtures");
    const forced = resolveConfig({ QLOO_MODE: "live" });
    expect(forced.mode).toBe("fixtures");
    expect(forced.warnings[0]).toMatch(/QLOO_API_KEY/);
    expect(resolveConfig({ QLOO_API_KEY: "k" }).baseUrl).toBe("https://hackathon.api.qloo.com");
  });

  it("uses template notes when no AI binding exists", () => {
    const services = createServices({});
    expect(services.writer).toBeUndefined();
    expect(createServices({ AI: { run: async () => ({}) }, AI_MODE: "off" }).writer).toBeUndefined();
  });
});

describe("Workers AI writer", () => {
  it("accepts grounded, plain notes and keeps templates for the rest", async () => {
    const plan = await offlinePlan();
    const facts = writerFacts(plan);
    const [first, second] = facts.picks;
    const ai: AiBinding = {
      run: vi.fn(async () => ({
        response: JSON.stringify({
          intro: `A Spanish week built from ${facts.favorites[0]} and friends.`,
          notes: {
            [first!.id]: `${first!.drivers[0]?.name ?? first!.sharedTags[0]} fans tend to rate this one highly, and it keeps the same mood.`,
            [second!.id]: "Get ready to dive into a vibrant tapestry of stories.",
          },
        }),
      })),
    };
    const writer = new WorkersAiWriter(ai, { model: "@cf/test/model" });
    const output = await writer.write(facts);
    expect(output?.intro).toContain(facts.favorites[0]!);
    expect(output?.whys[first!.id]).toBeDefined();
    expect(output?.whys[second!.id]).toBeUndefined();
  });

  it("returns nothing when the model fails or answers with junk", async () => {
    const facts = writerFacts(await offlinePlan());
    const broken = new WorkersAiWriter({ run: async () => Promise.reject(new Error("model missing")) }, { model: "a", fallbackModels: ["b"] });
    expect(await broken.write(facts)).toBeUndefined();
    const junk = new WorkersAiWriter({ run: async () => ({ response: "Sure! Here are some notes." }) }, { model: "a" });
    expect(await junk.write(facts)).toBeUndefined();
  });

  it("tries the fallback model when the first one errors", async () => {
    const facts = writerFacts(await offlinePlan());
    const pick = facts.picks[0]!;
    const run = vi.fn(async (model: string) => {
      if (model === "first") throw new Error("not found");
      return { response: JSON.stringify({ notes: { [pick.id]: `People who love ${pick.drivers[0]?.name ?? pick.sharedTags[0]} keep coming back to this one.` } }) };
    });
    const writer = new WorkersAiWriter({ run }, { model: "first", fallbackModels: ["second"] });
    const output = await writer.write(facts);
    expect(run).toHaveBeenCalledTimes(2);
    expect(output?.whys[pick.id]).toBeDefined();
  });

  it("filters stock phrases, dashes and ungrounded claims", () => {
    expect(acceptNote("A slow, eerie office story that Severance fans rate highly.", ["Severance"])).toBeDefined();
    expect(acceptNote("Embark on a journey you'll love.", ["Severance"])).toBeUndefined();
    expect(acceptNote("It won three Emmys and everyone adores it.", ["Severance"])).toBeUndefined();
    expect(acceptNote("Severance fans rate it highly — a sharp office satire!", ["Severance"])).toBe("Severance fans rate it highly, a sharp office satire.");
  });
});

describe("HTTP API", () => {
  const offline = createServices({});
  const app = createApp({ services: () => offline });

  it("reports health and offline config", async () => {
    const health = await (await app.request("/api/health")).json();
    expect(health).toMatchObject({ ok: true, mode: "fixtures", writer: { kind: "templates" } });
    const config = await (await app.request("/api/config")).json();
    expect(config.languages.map((l: { code: string }) => l.code)).toEqual(["es", "fr", "ja", "ko"]);
    expect(config.samples).toHaveLength(4);
  });

  it("searches favorites", async () => {
    const body = await (await app.request("/api/search?q=phoebe")).json();
    expect(body.results[0]).toMatchObject({ name: "Phoebe Bridgers", kind: "artist" });
    const empty = await (await app.request("/api/search?q=a")).json();
    expect(empty.results).toEqual([]);
  });

  it("builds a plan as JSON", async () => {
    const response = await app.request("/api/plan?format=json", { method: "POST", body: JSON.stringify(maya), headers: { "content-type": "application/json" } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.days).toHaveLength(7);
    expect(body.notes).toBeUndefined();
  });

  it("streams agent steps, then the plan, then done", async () => {
    const response = await app.request("/api/plan", { method: "POST", body: JSON.stringify(maya), headers: { "content-type": "application/json" } });
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readNdjson(response);
    const types = events.map((e) => e.type);
    expect(types.filter((t) => t === "step").length).toBeGreaterThan(5);
    expect(types.indexOf("plan")).toBeGreaterThan(types.lastIndexOf("step"));
    expect(types[types.length - 1]).toBe("done");
  });

  it("rejects bad input and live-only languages offline", async () => {
    const bad = await app.request("/api/plan?format=json", { method: "POST", body: "{", headers: { "content-type": "application/json" } });
    expect(bad.status).toBe(400);
    const empty = await app.request("/api/plan?format=json", { method: "POST", body: JSON.stringify({ ...maya, favorites: [] }) });
    expect((await empty.json()).error.message).toMatch(/at least one/);
    const portuguese = await app.request("/api/plan?format=json", { method: "POST", body: JSON.stringify({ ...maya, language: "pt", targetCity: "lisbon" }) });
    expect(portuguese.status).toBe(400);
    expect((await portuguese.json()).error.message).toMatch(/live Qloo API/);
  });

  it("streams a friendly error when nothing matches", async () => {
    const response = await app.request("/api/plan", { method: "POST", body: JSON.stringify({ ...maya, favorites: [{ name: "qqqq zzzz" }] }) });
    const events = await readNdjson(response);
    const error = events.find((e) => e.type === "error") as { error: { code: string; message: string } } | undefined;
    expect(error?.error.code).toBe("NO_FAVORITES");
    expect(events[events.length - 1]!.type).toBe("done");
  });

  it("runs end to end in live mode against a Qloo-shaped server and never leaks the key", async () => {
    const fake = fakeQlooFetch({ key: "live-secret-key" });
    const live = createServices({ QLOO_API_KEY: "live-secret-key", QLOO_MODE: "live" }, { fetchImpl: fake.fetchImpl, recorded: { version: 1, entries: [] } });
    const liveApp = createApp({ services: () => live });
    const response = await liveApp.request("/api/plan?format=json", { method: "POST", body: JSON.stringify(maya) });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("live-secret-key");
    const body = JSON.parse(text);
    expect(body.plan.mode).toBe("live");
    expect(body.plan.sources.live).toBeGreaterThan(5);
    expect(body.plan.sources.simulated).toBe(0);
    expect(fake.requests.every((r) => r.url.origin === "https://hackathon.api.qloo.com")).toBe(true);
    expect(fake.requests.some((r) => r.url.pathname === "/v2/insights")).toBe(true);
  });

  it("explains a rejected key to the visitor without details", async () => {
    const fake = fakeQlooFetch({ key: "the-real-key" });
    const wrong = createServices({ QLOO_API_KEY: "a-wrong-key" }, { fetchImpl: fake.fetchImpl, recorded: { version: 1, entries: [] } });
    const wrongApp = createApp({ services: () => wrong });
    const response = await wrongApp.request("/api/plan?format=json", { method: "POST", body: JSON.stringify(maya) });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("QLOO_AUTH");
    expect(JSON.stringify(body)).not.toContain("a-wrong-key");
  });
});
