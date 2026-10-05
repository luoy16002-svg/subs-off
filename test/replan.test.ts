import { describe, expect, it } from "vitest";
import { runAgent } from "../src/agent/planner";
import { sampleById } from "../src/agent/samples";
import type { LearnerInput, Plan } from "../src/agent/types";
import { QlooClient } from "../src/qloo/client";
import { FixtureTransport, RecordedStore } from "../src/qloo/fixtures";
import { canonicalParams } from "../src/qloo/query";
import { QlooSimulator } from "../src/qloo/simulator";
import type { QlooRequest } from "../src/qloo/types";

const simulator = new QlooSimulator();

async function run(input: LearnerInput, seen?: QlooRequest[]): Promise<Plan> {
  const inner = new FixtureTransport({ store: new RecordedStore(), simulator });
  const client = new QlooClient({ kind: "spy", get: (request, options) => (seen?.push(request), inner.get(request, options)) });
  return runAgent(input, { qloo: client, mode: "fixtures" });
}

function previousOf(plan: Plan) {
  return plan.picks.map((p) => ({ slot: p.slot, id: p.id, name: p.name }));
}

describe("re-planning from likes and skips", () => {
  const base = sampleById("maya")!.input;

  it("keeps the week stable when nothing changed", async () => {
    const first = await run(base);
    const again = await run({ ...base, previous: previousOf(first) });
    expect(again.picks.map((p) => p.id)).toEqual(first.picks.map((p) => p.id));
    expect(again.changes).toEqual([]);
  });

  it("drops a skipped pick, excludes it in the Qloo request, and explains the swap", async () => {
    const first = await run(base);
    const series = first.picks.find((p) => p.slot === "series")!;
    const seen: QlooRequest[] = [];
    const next = await run(
      { ...base, skips: [{ id: series.id, name: series.name, slot: "series", reason: "not_for_me", tagIds: series.tags.map((t) => t.id) }], previous: previousOf(first) },
      seen,
    );
    expect(next.picks.some((p) => p.id === series.id)).toBe(false);
    const seriesRequest = seen.map((r) => canonicalParams(r.query)).find((p) => p["filter.type"] === "urn:entity:tv_show")!;
    expect(seriesRequest["filter.exclude.entities"]).toContain(series.id);
    const change = next.changes.find((c) => c.slot === "series")!;
    expect(change.from?.id).toBe(series.id);
    expect(change.to?.id).toBe(next.picks.find((p) => p.slot === "series")!.id);
    expect(change.reason).toContain(`You passed on ${series.name}`);
  });

  it("pins a liked pick and feeds it back to Qloo as a signal", async () => {
    const first = await run(base);
    const liked = first.picks.find((p) => p.slot === "music")!;
    const seen: QlooRequest[] = [];
    const next = await run({ ...base, likes: [{ id: liked.id, name: liked.name, slot: "music" }], previous: previousOf(first) }, seen);
    const kept = next.picks.find((p) => p.id === liked.id);
    expect(kept?.pinned).toBe(true);
    const insightCalls = seen.map((r) => canonicalParams(r.query)).filter((p) => p["filter.type"]?.startsWith("urn:entity:"));
    expect(insightCalls.length).toBeGreaterThan(0);
    for (const params of insightCalls) expect(params["signal.interests.entities"]).toContain(liked.id);
  });

  it("re-plans visibly when a like pulls the taste somewhere new", async () => {
    const first = await run(base);
    // Liking a dark, eerie book should move other slots toward that taste.
    const second = await run({ ...base, likes: [{ id: first.picks.find((p) => p.slot === "book")!.id, slot: "book" }], previous: previousOf(first) });
    const liked = second.picks.find((p) => p.slot === "book")!;
    expect(liked.pinned).toBe(true);
    const influencedByLike = second.picks.filter((p) => p.evidence.contributors.some((c) => c.id === liked.id));
    expect(influencedByLike.length).toBeGreaterThan(0);
  });

  it("re-plans toward another city's taste and says why picks moved", async () => {
    const first = await run(base);
    const seen: QlooRequest[] = [];
    const next = await run({ ...base, targetCity: "madrid", previousCity: "mexico-city", previous: previousOf(first) }, seen);
    const series = seen.map((r) => canonicalParams(r.query)).find((p) => p["filter.type"] === "urn:entity:tv_show")!;
    expect(series["signal.location.query"]).toBe("Madrid");
    expect(next.learner.city.name).toBe("Madrid");
    expect(next.changes.length).toBeGreaterThan(0);
    for (const change of next.changes) expect(change.reason).toContain("Madrid audiences");
  });

  it("treats 'too hard' as a request for something gentler", async () => {
    const sam = sampleById("sam")!.input;
    const first = await run(sam);
    const series = first.picks.find((p) => p.slot === "series")!;
    const next = await run({ ...sam, skips: [{ id: series.id, slot: "series", reason: "too_hard", name: series.name }], previous: previousOf(first) });
    const change = next.changes.find((c) => c.slot === "series")!;
    expect(change.reason).toMatch(/too hard/);
    expect(next.trace.find((s) => s.tool === "agent.curate")!.detail).toMatch(/easier series/);
  });
});
