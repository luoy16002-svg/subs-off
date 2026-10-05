import { QlooSimulator } from "../src/qloo/simulator";
import { QlooError, errorFromStatus } from "../src/qloo/errors";
import type { QlooPath } from "../src/qloo/types";

/**
 * A stand-in for https://hackathon.api.qloo.com: answers GET requests with the
 * simulator, checks the X-Api-Key header, and records every request it sees.
 */
export function fakeQlooFetch(options: { key: string; failWith?: (url: URL) => number | undefined } = { key: "test-key" }) {
  const simulator = new QlooSimulator();
  const requests: Array<{ url: URL; headers: Record<string, string> }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    requests.push({ url, headers });
    if (headers["x-api-key"] !== options.key) {
      return new Response(JSON.stringify({ message: "No API key found in request" }), { status: 401, headers: { "content-type": "application/json" } });
    }
    const forced = options.failWith?.(url);
    if (forced) return new Response(JSON.stringify({ message: "forced" }), { status: forced, headers: { "content-type": "application/json" } });
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    try {
      const body = simulator.answer({ path: url.pathname as QlooPath, query });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    } catch (error) {
      const status = error instanceof QlooError && error.status ? error.status : 500;
      return new Response(JSON.stringify({ message: error instanceof Error ? error.message : "error" }), { status, headers: { "content-type": "application/json" } });
    }
  }) as typeof fetch;
  return { fetchImpl, requests, simulator };
}

export { errorFromStatus };

/** Reads an NDJSON stream body into parsed events. */
export async function readNdjson(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
