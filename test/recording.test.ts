import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent/planner";
import { sampleById } from "../src/agent/samples";
import { CachingTransport } from "../src/qloo/cache";
import { QlooClient } from "../src/qloo/client";
import { FixtureTransport, RecordedStore } from "../src/qloo/fixtures";
import { insightsEntities } from "../src/qloo/parse";
import { pruneBody } from "../src/qloo/prune";
import { RecordingTransport } from "../src/qloo/recording";
import { LiveTransport } from "../src/qloo/transport";
import { fakeQlooFetch } from "./helpers";

const now = () => new Date("2026-10-20T09:00:00Z");

describe("recording live answers", () => {
  it("records a live run and replays it offline with no simulator", async () => {
    const fake = fakeQlooFetch({ key: "rec-secret-key" });
    const recorder = new RecordingTransport(new LiveTransport({ apiKey: "rec-secret-key", fetchImpl: fake.fetchImpl }), { now });
    const maya = sampleById("maya")!.input;
    const livePlan = await runAgent(maya, { qloo: new QlooClient(new CachingTransport(recorder)), mode: "live", now });
    const file = recorder.file("https://hackathon.api.qloo.com");

    expect(file.entries.length).toBeGreaterThan(15);
    expect(JSON.stringify(file)).not.toContain("rec-secret-key");
    expect(file.entries.every((e) => e.recordedAt === "2026-10-20T09:00:00.000Z")).toBe(true);

    const replay = new QlooClient(new FixtureTransport({ store: new RecordedStore(file) }));
    const replayPlan = await runAgent(maya, { qloo: replay, mode: "fixtures", now });
    expect(replayPlan.picks.map((p) => p.id)).toEqual(livePlan.picks.map((p) => p.id));
    expect(replayPlan.picks.map((p) => p.why)).toEqual(livePlan.picks.map((p) => p.why));
    expect(replayPlan.sources.recorded).toBeGreaterThan(0);
    expect(replayPlan.sources.simulated).toBe(0);
    expect(replayPlan.picks[0]!.evidence.source).toBe("recorded");
  });

  it("keeps everything the parsers read when trimming a response", () => {
    const raw = {
      success: true,
      duration: 41,
      query: { locality: { signal: { name: "Mexico City", entity_id: "X" } } },
      results: {
        entities: [
          {
            name: "La casa de las flores",
            entity_id: "4C1C3A3E-1111-4111-8111-000000000001",
            type: "urn:entity",
            subtype: "urn:entity:tv_show",
            popularity: 0.71,
            disambiguation: "2018, Manolo Caro",
            external: { imdb: [{ id: "tt0000000", user_rating: 7.1 }] },
            properties: {
              release_year: 2018,
              description: "A wealthy family's flower shop hides one scandal after another.",
              release_country: ["Mexico"],
              image: { url: "https://images.qloo.com/i/example.jpg" },
              akas: [
                { value: "The House of Flowers", languages: ["en"] },
                { value: "La casa de las flores", languages: ["es"] },
                { value: "Dom kwiatów", languages: ["pl"] },
                { value: "Дом цветов", languages: ["ru"] },
              ],
              production_companies: ["Noc Noc Cinema"],
              websites: ["https://example.com"],
              filming_location: "Mexico City",
            },
            tags: [{ id: "urn:tag:genre:media:dark_comedy", name: "Dark Comedy", type: "urn:tag:genre:media" }],
            query: { affinity: 0.92, explainability: { "signal.interests.entities": [{ entity_id: "4C1C3A3E-2222-4222-8222-000000000002", score: 0.8 }] } },
          },
        ],
      },
    };
    const pruned = pruneBody(raw) as typeof raw;
    const [before] = insightsEntities(raw);
    const [after] = insightsEntities(pruned);
    expect(after).toMatchObject({
      id: before!.id,
      name: before!.name,
      kind: before!.kind,
      year: before!.year,
      countries: before!.countries,
      image: before!.image,
      affinity: before!.affinity,
      tags: before!.tags,
      contributions: before!.contributions,
    });
    expect(after!.localTitles.map((t) => t.languages[0])).toEqual(["en", "es"]);
    expect(JSON.stringify(pruned)).not.toContain("production_companies");
    expect(JSON.stringify(pruned)).not.toContain("external");
    expect(pruned.query).toEqual(raw.query);
  });
});
