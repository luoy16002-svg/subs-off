import { describe, expect, it, vi } from "vitest";
import { CachingTransport } from "../src/qloo/cache";
import { QlooClient } from "../src/qloo/client";
import { QlooError } from "../src/qloo/errors";
import { FixtureTransport, RecordedFirstTransport, RecordedStore, type RecordedFile } from "../src/qloo/fixtures";
import { insightsEntities, listEntities, listTags, parseContributions, parseEntity } from "../src/qloo/parse";
import { canonicalParams, requestKey } from "../src/qloo/query";
import { QlooSimulator } from "../src/qloo/simulator";
import { HACKATHON_BASE_URL, LiveTransport, type QlooTransport } from "../src/qloo/transport";
import { fakeQlooFetch } from "./helpers";

describe("query canonicalization", () => {
  it("sorts keys and set-like values and drops empty values", () => {
    const params = canonicalParams({
      take: 10,
      "signal.interests.entities": ["B", "A", "B"],
      "filter.type": "urn:entity:movie",
      "filter.tags": "urn:tag:z,urn:tag:a",
      "signal.location.query": "",
      page: undefined,
      "feature.explainability": true,
    });
    expect(Object.keys(params)).toEqual(["feature.explainability", "filter.tags", "filter.type", "signal.interests.entities", "take"]);
    expect(params["signal.interests.entities"]).toBe("A,B");
    expect(params["filter.tags"]).toBe("urn:tag:a,urn:tag:z");
    expect(params["feature.explainability"]).toBe("true");
  });

  it("gives the same key regardless of parameter order", () => {
    const a = requestKey({ path: "/v2/insights", query: { "filter.type": "urn:entity:artist", "signal.interests.entities": ["X", "Y"] } });
    const b = requestKey({ path: "/v2/insights", query: { "signal.interests.entities": ["Y", "X"], "filter.type": "urn:entity:artist" } });
    expect(a).toBe(b);
    expect(a.startsWith("/v2/insights?")).toBe(true);
  });
});

describe("LiveTransport", () => {
  it("calls the hackathon base URL with the key only in the X-Api-Key header", async () => {
    const fake = fakeQlooFetch({ key: "secret-123" });
    const live = new LiveTransport({ apiKey: "secret-123", fetchImpl: fake.fetchImpl });
    expect(live.baseUrl).toBe(HACKATHON_BASE_URL);
    const result = await live.get({ path: "/search", query: { query: "Severance", take: 3 } });
    expect(result.source).toBe("live");
    const sent = fake.requests[0]!;
    expect(sent.url.origin).toBe("https://hackathon.api.qloo.com");
    expect(sent.url.pathname).toBe("/search");
    expect(sent.headers["x-api-key"]).toBe("secret-123");
    expect(sent.url.toString()).not.toContain("secret-123");
  });

  it("maps a 401 to a non-retryable QLOO_AUTH error", async () => {
    const fake = fakeQlooFetch({ key: "right" });
    const live = new LiveTransport({ apiKey: "wrong", fetchImpl: fake.fetchImpl, sleep: async () => undefined });
    await expect(live.get({ path: "/search", query: { query: "x" } })).rejects.toMatchObject({ code: "QLOO_AUTH", retryable: false });
    expect(fake.requests).toHaveLength(1);
  });

  it("retries a rate limit once, then reports it", async () => {
    const fake = fakeQlooFetch({ key: "k", failWith: () => 429 });
    const sleep = vi.fn(async () => undefined);
    const live = new LiveTransport({ apiKey: "k", fetchImpl: fake.fetchImpl, sleep, maxAttempts: 2 });
    await expect(live.get({ path: "/search", query: { query: "x" } })).rejects.toMatchObject({ code: "QLOO_RATE_LIMIT", retryable: true });
    expect(fake.requests).toHaveLength(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("recovers when a server error clears on retry", async () => {
    let calls = 0;
    const fake = fakeQlooFetch({ key: "k", failWith: () => (calls++ === 0 ? 503 : undefined) });
    const live = new LiveTransport({ apiKey: "k", fetchImpl: fake.fetchImpl, sleep: async () => undefined });
    const result = await live.get({ path: "/search", query: { query: "Severance" } });
    expect(result.source).toBe("live");
    expect(fake.requests).toHaveLength(2);
  });

  it("refuses a missing key or a plain-HTTP base URL", () => {
    expect(() => new LiveTransport({ apiKey: "" })).toThrow(QlooError);
    expect(() => new LiveTransport({ apiKey: "k", baseUrl: "http://example.com" })).toThrow(/HTTPS/);
  });
});

describe("parsing documented response shapes", () => {
  // Trimmed from the "Basic Insights Response Example" in Qloo's docs.
  const documented = {
    success: true,
    results: {
      entities: [
        {
          name: "Everything Everywhere All at Once",
          entity_id: "F0D354AA-BA7E-49D2-8ABA-9A8250F5C852",
          type: "urn:entity",
          subtype: "urn:entity:movie",
          properties: {
            release_year: 2022,
            release_date: "2022-04-08",
            description: "A middle-aged Chinese immigrant is swept up into an insane adventure.",
            content_rating: "R",
            duration: 139,
            image: { url: "https://staging.images.qloo.com/i/F0D354AA-BA7E-49D2-8ABA-9A8250F5C852-420x-outside.jpg" },
            akas: [{ value: "Todo en todas partes al mismo tiempo", languages: ["es"] }],
            release_country: ["United States"],
          },
          popularity: 0.9984116946335868,
          tags: [{ id: "urn:tag:keyword:media:multiverse", name: "Multiverse", type: "urn:tag:keyword:media" }],
          query: { measurements: { audience_growth: -0.04 } },
          disambiguation: "2022, Daniel Scheinert, Daniel Kwan",
        },
      ],
    },
    duration: 34,
  };

  it("reads an Insights entity", () => {
    const [entity] = insightsEntities(documented);
    expect(entity).toMatchObject({
      id: "F0D354AA-BA7E-49D2-8ABA-9A8250F5C852",
      name: "Everything Everywhere All at Once",
      kind: "movie",
      year: 2022,
      contentRating: "R",
      durationMin: 139,
      countries: ["United States"],
    });
    expect(entity!.localTitles[0]).toEqual({ value: "Todo en todas partes al mismo tiempo", languages: ["es"] });
    expect(entity!.tags[0]!.name).toBe("Multiverse");
  });

  it("reads /search and /entities in both list layouts", () => {
    const raw = documented.results.entities[0]!;
    expect(listEntities({ results: [raw] })).toHaveLength(1);
    expect(listEntities({ results: { entities: [raw] } })).toHaveLength(1);
    expect(listEntities({ results: {} })).toHaveLength(0);
  });

  it("reads tags from /v2/tags and taste analysis", () => {
    expect(listTags({ results: { tags: [{ tag_id: "urn:tag:genre:media:comedy", name: "Comedy", type: "urn:tag:genre:media" }] } })[0]).toMatchObject({ id: "urn:tag:genre:media:comedy", name: "Comedy" });
    expect(listTags({ results: [{ id: "urn:tag:genre:music:indie_folk", name: "Indie Folk" }] })[0]!.id).toBe("urn:tag:genre:music:indie_folk");
  });

  it("reads explainability in the layouts it may arrive in", () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const B = "22222222-2222-4222-8222-222222222222";
    expect(parseContributions({ "signal.interests.entities": [{ entity_id: A, score: 0.7 }, { entity_id: B, score: 0.3 }] })).toEqual([
      { entityId: A, score: 0.7 },
      { entityId: B, score: 0.3 },
    ]);
    expect(parseContributions([{ id: B, value: 0.9 }])).toEqual([{ entityId: B, score: 0.9 }]);
    expect(parseContributions({ [A]: 0.4, warning: "partial" })).toEqual([{ entityId: A, score: 0.4 }]);
    expect(parseContributions(undefined)).toEqual([]);
  });

  it("ignores entities without an id or a name", () => {
    expect(parseEntity({ name: "No id" })).toBeUndefined();
    expect(parseEntity({ entity_id: "x" })).toBeUndefined();
  });
});

describe("fixtures and caching", () => {
  const recordedBody = { success: true, results: [{ name: "Recorded Show", entity_id: "AAAAAAAA-0000-4000-8000-000000000001", subtype: "urn:entity:tv_show" }] };
  const file: RecordedFile = {
    version: 1,
    entries: [
      { key: requestKey({ path: "/search", query: { query: "recorded", take: 6 } }), path: "/search", params: { query: "recorded", take: "6" }, recordedAt: "2026-10-20T10:00:00Z", body: recordedBody },
    ],
  };

  it("serves an exact recorded response before simulating", async () => {
    const transport = new FixtureTransport({ store: new RecordedStore(file), simulator: new QlooSimulator() });
    const client = new QlooClient(transport);
    const hit = await client.search("recorded");
    expect(hit.call.source).toBe("recorded");
    expect(hit.call.recordedAt).toBe("2026-10-20T10:00:00Z");
    expect(hit.data[0]!.name).toBe("Recorded Show");
    const miss = await client.search("Severance");
    expect(miss.call.source).toBe("simulated");
    expect(miss.data[0]!.name).toBe("Severance");
  });

  it("reports a clear miss when no simulator is allowed", async () => {
    const transport = new FixtureTransport({ store: new RecordedStore(file) });
    await expect(transport.get({ path: "/search", query: { query: "other" } })).rejects.toMatchObject({ code: "FIXTURE_MISS" });
  });

  it("live mode prefers recordings, falls back to them on outages, and never simulates", async () => {
    const failing: QlooTransport = { kind: "live", get: async () => Promise.reject(new QlooError("QLOO_UPSTREAM", "down", { retryable: true })) };
    const store = new RecordedStore(file);
    const preferred = new RecordedFirstTransport({ live: failing, store });
    expect((await preferred.get({ path: "/search", query: { query: "recorded", take: 6 } })).source).toBe("recorded");

    const liveFirst = new RecordedFirstTransport({ live: failing, store, preferRecorded: false });
    expect((await liveFirst.get({ path: "/search", query: { query: "recorded", take: 6 } })).source).toBe("recorded");
    await expect(liveFirst.get({ path: "/search", query: { query: "not recorded" } })).rejects.toMatchObject({ code: "QLOO_UPSTREAM" });

    const auth: QlooTransport = { kind: "live", get: async () => Promise.reject(new QlooError("QLOO_AUTH", "bad key")) };
    const strict = new RecordedFirstTransport({ live: auth, store, preferRecorded: false });
    await expect(strict.get({ path: "/search", query: { query: "recorded", take: 6 } })).rejects.toMatchObject({ code: "QLOO_AUTH" });
  });

  it("caches per canonical request and shares in-flight calls", async () => {
    let calls = 0;
    const inner: QlooTransport = {
      kind: "live",
      get: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { body: { success: true, results: [] }, source: "live", ms: 5 };
      },
    };
    const cache = new CachingTransport(inner);
    const request = { path: "/search" as const, query: { query: "a", take: 2 } };
    const [first, second] = await Promise.all([cache.get(request), cache.get({ path: "/search", query: { take: 2, query: "a" } })]);
    expect(first).toMatchObject({ source: "live" });
    expect(first.cached).toBeUndefined();
    expect(second).toMatchObject({ source: "live", cached: true });
    expect(await cache.get(request)).toMatchObject({ source: "live", cached: true });
    expect(calls).toBe(1);
  });
});

describe("offline simulator", () => {
  const sim = new QlooSimulator();

  it("answers search with the documented list shape", () => {
    const body = sim.answer({ path: "/search", query: { query: "severance", types: "urn:entity:tv_show", take: 3 } }) as { results: Array<Record<string, unknown>> };
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results[0]).toMatchObject({ name: "Severance", subtype: "urn:entity:tv_show" });
  });

  it("requires a signal or a filter, like the API", () => {
    expect(() => sim.answer({ path: "/v2/insights", query: { "filter.type": "urn:entity:movie" } })).toThrow(/at least one valid signal or filter/);
  });

  it("rejects an unknown locality with a 400", () => {
    try {
      sim.answer({ path: "/v2/insights", query: { "filter.type": "urn:entity:movie", "signal.location.query": "Atlantis" } });
      throw new Error("expected an error");
    } catch (error) {
      expect(error).toMatchObject({ code: "QLOO_BAD_REQUEST", status: 400 });
    }
  });

  it("respects release country, exclusions and explainability", () => {
    const severance = new QlooClient(new FixtureTransport({ store: new RecordedStore(), simulator: sim }));
    return severance.search("Severance", { kinds: ["tv_show"] }).then(async ({ data }) => {
      const seed = data[0]!;
      const result = await severance.insights({
        "filter.type": "urn:entity:tv_show",
        "filter.release_country": ["Spain"],
        "signal.interests.entities": [seed.id],
        "filter.exclude.entities": [seed.id],
        "feature.explainability": true,
        take: 5,
      });
      expect(result.data.entities.length).toBeGreaterThan(0);
      for (const entity of result.data.entities) {
        expect(entity.countries).toContain("Spain");
        expect(entity.id).not.toBe(seed.id);
        expect(entity.affinity).toBeGreaterThan(0);
        expect(entity.contributions[0]!.entityId).toBe(seed.id);
      }
    });
  });
});
