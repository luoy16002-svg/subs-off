import type { AgentEvent, LearnerInput } from "../../src/agent/types";
import type { EntityKind } from "../../src/qloo/types";

export interface AppConfig {
  mode: "live" | "fixtures";
  writer: "workers-ai" | "templates";
  languages: Array<{ code: string; name: string; nativeName: string; cities: Array<{ slug: string; name: string }> }>;
  samples: Array<{ id: string; blurb: string; input: LearnerInput }>;
}

export interface SearchResult {
  id: string;
  name: string;
  kind: EntityKind;
  year?: number;
  detail?: string;
  image?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable = true) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export async function fetchConfig(): Promise<AppConfig> {
  const response = await fetch("/api/config");
  if (!response.ok) throw new ApiError("Couldn't load the app settings.", response.status);
  return (await response.json()) as AppConfig;
}

export async function searchFavorites(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, signal ? { signal } : {});
  const body = (await response.json().catch(() => ({ results: [] }))) as { results?: SearchResult[]; error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "Search is unavailable right now.", response.status);
  return body.results ?? [];
}

/** Posts a learner and feeds each NDJSON event to `onEvent` as it arrives. */
export async function streamPlan(input: LearnerInput, onEvent: (event: AgentEvent) => void, signal?: AbortSignal): Promise<void> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => undefined)) as { error?: { message?: string; retryable?: boolean } } | undefined;
    throw new ApiError(body?.error?.message ?? "The planner didn't answer. Try again.", response.status, body?.error?.retryable ?? true);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as AgentEvent);
      newline = buffer.indexOf("\n");
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as AgentEvent);
}
