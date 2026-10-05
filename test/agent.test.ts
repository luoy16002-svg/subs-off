import { describe, expect, it } from "vitest";
import { LOCALES } from "../src/agent/locales";
import { AgentError, runAgent } from "../src/agent/planner";
import { SAMPLE_LEARNERS, sampleById } from "../src/agent/samples";
import type { AgentEvent, LearnerInput, Plan } from "../src/agent/types";
import { QlooClient } from "../src/qloo/client";
import { QlooError } from "../src/qloo/errors";
import { FixtureTransport, RecordedStore } from "../src/qloo/fixtures";
import { canonicalParams } from "../src/qloo/query";
import { QlooSimulator } from "../src/qloo/simulator";
import type { QlooTransport } from "../src/qloo/transport";
import type { QlooRequest } from "../src/qloo/types";

function offlineClient(wrap?: (inner: QlooTransport) => QlooTransport) {
  const inner = new FixtureTransport({ store: new RecordedStore(), simulator: new QlooSimulator() });
  return new QlooClient(wrap ? wrap(inner) : inner);
}

/** Records every request the agent makes. */
function spying(inner: QlooTransport, seen: QlooRequest[]): QlooTransport {
  return { kind: "spy", get: (request, options) => (seen.push(request), inner.get(request, options)) };
}

async function plan(input: LearnerInput, wrap?: (inner: QlooTransport) => QlooTransport, events?: AgentEvent[]): Promise<Plan> {
  return runAgent(input, { qloo: offlineClient(wrap), mode: "fixtures", now: () => new Date("2026-10-05T12:00:00Z") }, (e) => events?.push(e));
}

describe("agent loop", () => {
  it.each(SAMPLE_LEARNERS.map((s) => [s.id, s] as const))("builds a full week for %s", async (_id, sample) => {
    const events: AgentEvent[] = [];
    const result = await plan(sample.input, undefined, events);
    const pack = LOCALES[sample.input.language];

    expect(result.days).toHaveLength(7);
    expect(result.days.every((day) => day.doses.length >= 1)).toBe(true);
    expect(new Set(result.picks.map((p) => p.slot))).toEqual(new Set(["series", "film", "music", "book", "podcast", "food"]));
    expect(result.picks.filter((p) => p.slot === "music")).toHaveLength(3);
    expect(result.writer).toBe("templates");
    expect(result.mode).toBe("fixtures");

    for (const pick of result.picks) {
      // Every pick came out of a Qloo Insights response and carries its evidence.
      expect(pick.evidence.rank).toBeGreaterThan(0);
      expect(pick.why.length).toBeGreaterThan(20);
      expect(pick.how.length).toBeGreaterThan(10);
      expect(pick.phrases.length).toBeGreaterThan(0);
      if (pick.slot === "series" || pick.slot === "film") {
        expect(pick.countries.some((c) => pack.countries.includes(c))).toBe(true);
      }
      expect(result.favorites.some((f) => f.id === pick.id)).toBe(false);
    }

    const tools = result.trace.map((s) => s.tool);
    expect(tools.slice(0, 3)).toEqual(["qloo.search", "qloo.insights", "qloo.tags"]);
    expect(tools).toContain("agent.curate");
    expect(tools[tools.length - 1]).toBe("agent.schedule");
    expect(events.filter((e) => e.type === "step")).toHaveLength(result.trace.length);
    expect(result.sources.simulated).toBeGreaterThan(0);
    expect(result.influence.reduce((sum, i) => sum + i.share, 0)).toBeCloseTo(1, 5);
  });

  it("explains picks with the favorites Qloo credits for them", async () => {
    const result = await plan(sampleById("maya")!.input);
    const favoriteNames = result.favorites.map((f) => f.name);
    const explained = result.picks.filter((p) => p.evidence.contributors.length > 0);
    expect(explained.length).toBeGreaterThan(4);
    for (const pick of explained) {
      expect(favoriteNames).toContain(pick.evidence.contributors[0]!.name);
      expect(pick.why).toContain(pick.evidence.contributors[0]!.name);
    }
  });

  it("sends language, location and explainability parameters to Qloo", async () => {
    const seen: QlooRequest[] = [];
    await plan(sampleById("maya")!.input, (inner) => spying(inner, seen));
    const series = seen.map((r) => canonicalParams(r.query)).find((p) => p["filter.type"] === "urn:entity:tv_show");
    expect(series).toBeDefined();
    expect(series!["filter.release_country"]).toContain("Mexico");
    expect(series!["signal.location.query"]).toBe("Mexico City");
    expect(series!["feature.explainability"]).toBe("true");
    expect(series!["signal.interests.entities"]!.split(",")).toHaveLength(4);
    const artists = seen.map((r) => canonicalParams(r.query)).find((p) => p["filter.type"] === "urn:entity:artist");
    expect(artists!["filter.tags"]).toMatch(/urn:tag:genre:music:/);
    const places = seen.map((r) => canonicalParams(r.query)).find((p) => p["filter.type"] === "urn:entity:place");
    expect(places!["filter.location.query"]).toBe("Chicago");
  });

  it("widens the search when the city weighting leaves too few results", async () => {
    const thin = (inner: QlooTransport): QlooTransport => ({
      kind: "thin",
      async get(request, options) {
        const params = canonicalParams(request.query);
        const result = await inner.get(request, options);
        if (params["filter.type"] === "urn:entity:tv_show" && params["signal.location.query"]) {
          const body = structuredClone(result.body) as { results: { entities: unknown[] } };
          body.results.entities = body.results.entities.slice(0, 1);
          return { ...result, body };
        }
        return result;
      },
    });
    const result = await plan(sampleById("maya")!.input, thin);
    const step = result.trace.find((s) => s.title.startsWith("Scout series"))!;
    expect(step.status).toBe("adjusted");
    expect(step.calls).toHaveLength(2);
    expect(step.calls[1]!.params["signal.location.query"]).toBeUndefined();
    expect(result.notes.some((n) => n.kind === "adjusted" && n.text.includes("Mexico City"))).toBe(true);
    expect(result.picks.find((p) => p.slot === "series")?.evidence.locality).toBeUndefined();
  });

  it("falls back to the favorites' own tags when taste analysis is refused", async () => {
    const noTagType = (inner: QlooTransport): QlooTransport => ({
      kind: "no-tag",
      get(request, options) {
        if (canonicalParams(request.query)["filter.type"] === "urn:tag") {
          return Promise.reject(new QlooError("QLOO_FORBIDDEN_TYPE", "403", { status: 403 }));
        }
        return inner.get(request, options);
      },
    });
    const result = await plan(sampleById("sam")!.input, noTagType);
    expect(result.taste.source).toBe("favorites");
    expect(result.taste.tags.length).toBeGreaterThan(2);
    expect(result.trace[1]!.status).toBe("adjusted");
  });

  it("skips the restaurant when no home city is given and says so", async () => {
    const input = { ...sampleById("leo")!.input };
    delete input.homeCity;
    const result = await plan(input);
    expect(result.picks.some((p) => p.slot === "food")).toBe(false);
    expect(result.notes.some((n) => n.text.includes("Add your city"))).toBe(true);
    expect(result.days[5]!.doses.length).toBeGreaterThan(0);
  });

  it("fails clearly when no favorite can be matched", async () => {
    const input: LearnerInput = { language: "es", level: "beginner", targetCity: "madrid", minutesPerDay: 30, favorites: [{ name: "zzqx not a real title" }] };
    await expect(plan(input)).rejects.toBeInstanceOf(AgentError);
    await expect(plan(input)).rejects.toMatchObject({ code: "NO_FAVORITES" });
  });

  it("passes a Qloo auth failure through instead of hiding it", async () => {
    const denied = (): QlooTransport => ({ kind: "denied", get: () => Promise.reject(new QlooError("QLOO_AUTH", "bad key", { status: 401 })) });
    await expect(plan(sampleById("maya")!.input, denied)).rejects.toMatchObject({ code: "QLOO_AUTH" });
  });

  it("adapts to the level: beginners get learner podcasts and English subtitles", async () => {
    const beginner = await plan(sampleById("priya")!.input);
    const podcast = beginner.picks.find((p) => p.slot === "podcast")!;
    expect(podcast.tags.some((t) => /language learning/i.test(t.name))).toBe(true);
    expect(beginner.picks.find((p) => p.slot === "series")!.how).toMatch(/English subtitles/);
    const advanced = await plan(sampleById("sam")!.input);
    expect(advanced.picks.find((p) => p.slot === "series")!.how).toMatch(/Subtitles off/);
    expect(advanced.picks.find((p) => p.slot === "podcast")!.tags.some((t) => /language learning/i.test(t.name))).toBe(false);
  });
});
