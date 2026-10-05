// npm run record: calls the live Qloo API once per sample learner (plus the
// likely demo re-plan and the builder's quick picks) and saves trimmed answers
// to fixtures/recorded.json. Needs QLOO_API_KEY in the environment or .dev.vars.
//   npm run record            merge new recordings into the existing file
//   npm run record -- --fresh start from an empty file
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent } from "../src/agent/planner";
import { QUICK_PICKS, SAMPLE_LEARNERS } from "../src/agent/samples";
import type { LearnerInput, Plan } from "../src/agent/types";
import { SEARCH_KINDS } from "../src/app";
import { CachingTransport } from "../src/qloo/cache";
import { QlooClient } from "../src/qloo/client";
import type { RecordedFile } from "../src/qloo/fixtures";
import { insightsEntities, listTags } from "../src/qloo/parse";
import { RecordingTransport } from "../src/qloo/recording";
import { HACKATHON_BASE_URL, LiveTransport } from "../src/qloo/transport";
import { nodeEnv } from "../src/node-server";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "fixtures", "recorded.json");
const reportPath = join(root, "fixtures", "record-report.json");

function summary(plan: Plan) {
  return {
    learner: plan.learner.name,
    language: plan.learner.languageName,
    picks: plan.picks.map((p) => ({ slot: p.slot, name: p.name, localTitle: p.localTitle, rank: p.evidence.rank, of: p.evidence.of, contributors: p.evidence.contributors.length })),
    taste: plan.taste,
    notes: plan.notes.map((n) => n.text),
    steps: plan.trace.map((s) => ({ title: s.title, status: s.status, detail: s.detail })),
  };
}

async function main() {
  const env = nodeEnv();
  const apiKey = env.QLOO_API_KEY;
  if (!apiKey) {
    console.error("Set QLOO_API_KEY in your shell or in .dev.vars first. It is only sent to Qloo, never written to the recordings.");
    process.exit(1);
  }
  const baseUrl = env.QLOO_BASE_URL ?? HACKATHON_BASE_URL;
  const fresh = process.argv.includes("--fresh");
  const existing = !fresh && existsSync(target) ? (JSON.parse(readFileSync(target, "utf8")) as RecordedFile) : undefined;

  const recorder = new RecordingTransport(new LiveTransport({ apiKey, baseUrl }), { maxInFlight: 3, ...(existing ? { existing } : {}) });
  const qloo = new QlooClient(new CachingTransport(recorder));
  const report: Record<string, unknown> = { baseUrl, startedAt: new Date().toISOString(), learners: [] as unknown[] };

  for (const sample of SAMPLE_LEARNERS) {
    process.stdout.write(`Recording ${sample.id}... `);
    const plan = await runAgent(sample.input, { qloo, mode: "live" });
    (report.learners as unknown[]).push(summary(plan));
    const music = plan.picks.find((p) => p.slot === "music");
    const series = plan.picks.find((p) => p.slot === "series");
    if (music && series) {
      // The path a visitor is most likely to try: like a song, skip the series.
      const replan: LearnerInput = {
        ...sample.input,
        likes: [{ id: music.id, name: music.name, slot: "music" }],
        skips: [{ id: series.id, name: series.name, slot: "series", reason: "not_for_me", tagIds: series.tags.map((t) => t.id) }],
        previous: plan.picks.map((p) => ({ slot: p.slot, id: p.id, name: p.name })),
      };
      await runAgent(replan, { qloo, mode: "live" });
    }
    console.log(`${plan.picks.length} picks`);
  }

  const names = new Set([...QUICK_PICKS.map((q) => q.name), ...SAMPLE_LEARNERS.flatMap((s) => s.input.favorites.map((f) => f.name))]);
  for (const name of names) await qloo.search(name, { kinds: SEARCH_KINDS, take: 7 }).catch(() => undefined);

  const file = recorder.file(baseUrl);
  writeFileSync(target, `${JSON.stringify(file, null, 1)}\n`);

  // Contract checks: does the live API look the way the parsers expect?
  const insights = file.entries.filter((e) => e.path === "/v2/insights" && e.params["filter.type"]?.startsWith("urn:entity:"));
  const explained = insights.filter((e) => e.params["feature.explainability"] === "true");
  const withContributions = explained.filter((e) => insightsEntities(e.body).some((entity) => entity.contributions.length > 0));
  const tagEntries = file.entries.filter((e) => e.path === "/v2/tags");
  const tagsWithParents = tagEntries.filter((e) => listTags(e.body).some((t) => t.parentTypes.length > 0));
  const sampleExplain = (() => {
    for (const entry of explained) {
      const raw = (entry.body as { results?: { entities?: Array<{ query?: { explainability?: unknown } }> } }).results?.entities?.[0]?.query?.explainability;
      if (raw !== undefined) return raw;
    }
    return null;
  })();
  const checks = {
    entries: file.entries.length,
    insightCalls: insights.length,
    explainedCalls: explained.length,
    explainedCallsWithParsedContributions: withContributions.length,
    tagSearches: tagEntries.length,
    tagSearchesWithParentTypes: tagsWithParents.length,
    failures: recorder.failures,
    sampleExplainability: sampleExplain,
  };
  report.checks = checks;
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const sizeMb = statSync(target).size / 1024 / 1024;
  console.log(`\nSaved ${file.entries.length} responses to fixtures/recorded.json (${sizeMb.toFixed(2)} MB).`);
  console.log(`Report: fixtures/record-report.json`);
  if (explained.length > 0 && withContributions.length === 0) {
    console.warn("WARNING: explainability came back in a layout the parser did not recognize. See sampleExplainability in the report.");
  }
  if (recorder.failures.length > 0) console.warn(`WARNING: ${recorder.failures.length} requests failed. See the report.`);
  if (sizeMb > 8) console.warn("WARNING: the recordings are large; the Worker bundle may exceed the free plan's size limit.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
