import { QlooError, errorFromStatus } from "./errors";
import { buildUrl } from "./query";
import type { QlooRequest, ResponseSource } from "./types";

export interface TransportResult {
  body: unknown;
  source: ResponseSource;
  ms: number;
  recordedAt?: string;
}

export interface GetOptions {
  signal?: AbortSignal;
}

/** One way of answering a Qloo GET request: live HTTP, recorded fixtures, a cache. */
export interface QlooTransport {
  readonly kind: string;
  get(request: QlooRequest, options?: GetOptions): Promise<TransportResult>;
}

export const HACKATHON_BASE_URL = "https://hackathon.api.qloo.com";

export interface LiveTransportOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  userAgent?: string;
}

const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;

/**
 * Calls the Qloo REST API directly, the same endpoints `qloo api` uses.
 * The key travels only in the X-Api-Key header and never leaves the server.
 */
export class LiveTransport implements QlooTransport {
  readonly kind = "live";
  readonly baseUrl: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #maxAttempts: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #userAgent: string;

  constructor(options: LiveTransportOptions) {
    if (!options.apiKey || !options.apiKey.trim()) {
      throw new QlooError("QLOO_CONFIG", "A Qloo API key is required for live mode.");
    }
    const baseUrl = (options.baseUrl ?? HACKATHON_BASE_URL).trim().replace(/\/+$/, "");
    const parsed = new URL(baseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
      throw new QlooError("QLOO_CONFIG", "The Qloo base URL must use HTTPS.");
    }
    this.baseUrl = baseUrl;
    this.#apiKey = options.apiKey.trim();
    this.#timeoutMs = options.timeoutMs ?? 9000;
    this.#maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    this.#fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#userAgent = options.userAgent ?? "subs-off/1.0 (+qloo-hackathon)";
  }

  async get(request: QlooRequest, options: GetOptions = {}): Promise<TransportResult> {
    const url = buildUrl(this.baseUrl, request.path, request.query);
    const started = Date.now();
    let lastError: QlooError | undefined;

    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const response = await this.#fetch(url.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Api-Key": this.#apiKey,
            "User-Agent": this.#userAgent,
          },
          signal: controller.signal,
        });
        const text = await readBounded(response);
        const body = text.trim() ? safeJson(text) : {};
        if (response.ok) {
          if (body === undefined) {
            throw new QlooError("QLOO_UPSTREAM", "Qloo returned a response that is not JSON.", { retryable: true });
          }
          return { body, source: "live", ms: Date.now() - started };
        }
        const error = errorFromStatus(response.status, body);
        if (!error.retryable || attempt === this.#maxAttempts) throw error;
        lastError = error;
        const retryAfter = Number(response.headers.get("retry-after"));
        await this.#sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2500) : 300 * attempt);
      } catch (cause) {
        if (cause instanceof QlooError) {
          if (!cause.retryable || attempt === this.#maxAttempts) throw cause;
          lastError = cause;
          await this.#sleep(300 * attempt);
          continue;
        }
        if (options.signal?.aborted) throw new QlooError("QLOO_NETWORK", "The request was cancelled.");
        const timedOut = controller.signal.aborted;
        lastError = timedOut
          ? new QlooError("QLOO_TIMEOUT", "Qloo took too long to answer.", { retryable: true, cause })
          : new QlooError("QLOO_NETWORK", "Could not reach the Qloo API.", { retryable: true, cause });
        if (attempt === this.#maxAttempts) throw lastError;
        await this.#sleep(300 * attempt);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
      }
    }
    throw lastError ?? new QlooError("QLOO_NETWORK", "Could not reach the Qloo API.", { retryable: true });
  }
}

async function readBounded(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) {
    throw new QlooError("QLOO_UPSTREAM", "Qloo returned an unexpectedly large response.");
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new QlooError("QLOO_UPSTREAM", "Qloo returned an unexpectedly large response.");
  }
  return text;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
