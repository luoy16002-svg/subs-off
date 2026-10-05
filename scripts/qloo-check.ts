// npm run qloo:check: two small live requests that confirm the key, the base
// URL and the response shapes this app depends on. Prints no secrets.
import { QlooClient } from "../src/qloo/client";
import { QlooError } from "../src/qloo/errors";
import { HACKATHON_BASE_URL, LiveTransport } from "../src/qloo/transport";
import { nodeEnv } from "../src/node-server";

async function main() {
  const env = nodeEnv();
  if (!env.QLOO_API_KEY) {
    console.error("Set QLOO_API_KEY in your shell or in .dev.vars first.");
    process.exit(1);
  }
  const baseUrl = env.QLOO_BASE_URL ?? HACKATHON_BASE_URL;
  const qloo = new QlooClient(new LiveTransport({ apiKey: env.QLOO_API_KEY, baseUrl }));
  console.log(`Base URL: ${baseUrl}`);

  const search = await qloo.search("Severance", { kinds: ["tv_show"], take: 3 });
  const show = search.data[0];
  console.log(`/search: ${search.data.length} results in ${search.call.ms} ms. First: ${show ? `${show.name} (${show.id})` : "none"}`);
  if (!show) return;

  const insights = await qloo.insights({
    "filter.type": "urn:entity:tv_show",
    "signal.interests.entities": [show.id],
    "filter.release_country": ["Spain", "Mexico"],
    "signal.location.query": "Mexico City",
    "feature.explainability": true,
    take: 3,
  });
  const first = insights.data.entities[0];
  console.log(`/v2/insights: ${insights.data.entities.length} results in ${insights.call.ms} ms. Locality: ${insights.data.locality ?? "not reported"}`);
  if (first) {
    console.log(`  First: ${first.name}, countries ${first.countries.join(", ") || "none"}, affinity ${first.affinity ?? "n/a"}`);
    console.log(`  Explainability contributions parsed: ${first.contributions.length}`);
  }

  const tags = await qloo.tags("latin pop", { forKind: "artist", take: 5 });
  console.log(`/v2/tags: ${tags.data.length} artist tags for "latin pop": ${tags.data.map((t) => t.name).join(", ")}`);
  console.log("Qloo is reachable with this key.");
}

main().catch((error) => {
  if (error instanceof QlooError) console.error(`${error.code}: ${error.message}`);
  else console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
