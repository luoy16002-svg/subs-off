import type { AiBinding } from "./agent/llm";
import type { KvLike } from "./qloo/cache";
import { HACKATHON_BASE_URL } from "./qloo/transport";

/** Bindings and variables. The same shape works for a Worker and for Node. */
export interface AppEnv {
  QLOO_API_KEY?: string;
  QLOO_BASE_URL?: string;
  /** auto (default): live when a key is set, otherwise offline. Or force "live" / "fixtures". */
  QLOO_MODE?: string;
  /** "true" (default) serves already-recorded answers before calling Qloo. */
  QLOO_RECORDED_FIRST?: string;
  AI?: AiBinding;
  AI_MODEL?: string;
  AI_FALLBACK_MODELS?: string;
  /** auto (default) uses Workers AI when bound; "off" keeps template notes. */
  AI_MODE?: string;
  AI_DAILY_LIMIT?: string;
  QLOO_CACHE?: KvLike;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

export interface RuntimeConfig {
  mode: "live" | "fixtures";
  baseUrl: string;
  recordedFirst: boolean;
  ai: { enabled: boolean; model: string; fallbackModels: string[]; dailyLimit: number };
  warnings: string[];
}

export const DEFAULT_AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const DEFAULT_AI_FALLBACKS = ["@cf/meta/llama-3.1-8b-instruct-fast"];

export function resolveConfig(env: AppEnv): RuntimeConfig {
  const warnings: string[] = [];
  const hasKey = Boolean(env.QLOO_API_KEY && env.QLOO_API_KEY.trim());
  const requested = (env.QLOO_MODE ?? "auto").trim().toLowerCase();
  let mode: "live" | "fixtures";
  if (requested === "fixtures" || requested === "offline") mode = "fixtures";
  else if (requested === "live") {
    mode = hasKey ? "live" : "fixtures";
    if (!hasKey) warnings.push("QLOO_MODE is live but QLOO_API_KEY is not set; running on offline data.");
  } else mode = hasKey ? "live" : "fixtures";

  const aiMode = (env.AI_MODE ?? "auto").trim().toLowerCase();
  const fallbackModels = (env.AI_FALLBACK_MODELS ?? DEFAULT_AI_FALLBACKS.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const dailyLimit = Number(env.AI_DAILY_LIMIT ?? "300");

  return {
    mode,
    baseUrl: (env.QLOO_BASE_URL ?? HACKATHON_BASE_URL).trim() || HACKATHON_BASE_URL,
    recordedFirst: (env.QLOO_RECORDED_FIRST ?? "true").trim().toLowerCase() !== "false",
    ai: {
      enabled: aiMode !== "off" && Boolean(env.AI),
      model: env.AI_MODEL?.trim() || DEFAULT_AI_MODEL,
      fallbackModels,
      dailyLimit: Number.isFinite(dailyLimit) && dailyLimit >= 0 ? dailyLimit : 300,
    },
    warnings,
  };
}
