import recordedJson from "../fixtures/recorded.json";
import { WorkersAiWriter, type Writer } from "./agent/llm";
import { resolveConfig, type AppEnv, type RuntimeConfig } from "./config";
import { CachingTransport } from "./qloo/cache";
import { QlooClient } from "./qloo/client";
import { FixtureTransport, RecordedFirstTransport, RecordedStore, type RecordedFile } from "./qloo/fixtures";
import { QlooSimulator } from "./qloo/simulator";
import { LiveTransport, type QlooTransport } from "./qloo/transport";

export interface Services {
  config: RuntimeConfig;
  qloo: QlooClient;
  writer?: Writer;
  recorded: RecordedStore;
}

export interface ServiceOverrides {
  recorded?: RecordedFile;
  fetchImpl?: typeof fetch;
  transport?: QlooTransport;
}

export function createServices(env: AppEnv, overrides: ServiceOverrides = {}): Services {
  const config = resolveConfig(env);
  const recorded = new RecordedStore(overrides.recorded ?? (recordedJson as unknown as RecordedFile));
  let transport: QlooTransport;
  if (overrides.transport) {
    transport = overrides.transport;
  } else if (config.mode === "live") {
    const live = new LiveTransport({
      apiKey: env.QLOO_API_KEY ?? "",
      baseUrl: config.baseUrl,
      ...(overrides.fetchImpl ? { fetchImpl: overrides.fetchImpl } : {}),
    });
    transport = new RecordedFirstTransport({ live, store: recorded, preferRecorded: config.recordedFirst });
  } else {
    transport = new FixtureTransport({ store: recorded, simulator: new QlooSimulator() });
  }
  const cached = new CachingTransport(transport, env.QLOO_CACHE ? { kv: env.QLOO_CACHE } : {});
  const services: Services = { config, qloo: new QlooClient(cached), recorded };
  if (config.ai.enabled && env.AI) {
    services.writer = new WorkersAiWriter(env.AI, {
      model: config.ai.model,
      fallbackModels: config.ai.fallbackModels,
      maxCallsPerMinute: 20,
      maxCallsPerDay: config.ai.dailyLimit,
    });
  }
  return services;
}

let shared: { signature: string; services: Services } | undefined;

/** One set of services per isolate, so caches survive between requests. */
export function getServices(env: AppEnv): Services {
  const signature = [env.QLOO_MODE, env.QLOO_BASE_URL, env.QLOO_API_KEY ? "key" : "nokey", env.QLOO_RECORDED_FIRST, env.AI_MODE, env.AI_MODEL, env.AI ? "ai" : "noai", env.QLOO_CACHE ? "kv" : "nokv"].join("|");
  if (!shared || shared.signature !== signature) shared = { signature, services: createServices(env) };
  return shared.services;
}
