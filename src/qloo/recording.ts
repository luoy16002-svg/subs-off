import type { RecordedEntry, RecordedFile } from "./fixtures";
import { pruneBody } from "./prune";
import { canonicalParams, requestKey } from "./query";
import type { GetOptions, QlooTransport, TransportResult } from "./transport";
import type { QlooRequest } from "./types";

/**
 * Wraps a live transport, keeps a trimmed copy of every answer, and limits
 * how many requests are in flight so a recording run stays polite.
 */
export class RecordingTransport implements QlooTransport {
  readonly kind = "recording";
  readonly #inner: QlooTransport;
  readonly #entries = new Map<string, RecordedEntry>();
  readonly #maxInFlight: number;
  readonly #now: () => Date;
  #inFlight = 0;
  #queue: Array<() => void> = [];
  readonly failures: Array<{ key: string; error: string }> = [];

  constructor(inner: QlooTransport, options: { maxInFlight?: number; now?: () => Date; existing?: RecordedFile } = {}) {
    this.#inner = inner;
    this.#maxInFlight = Math.max(1, options.maxInFlight ?? 4);
    this.#now = options.now ?? (() => new Date());
    for (const entry of options.existing?.entries ?? []) this.#entries.set(entry.key, entry);
  }

  async #slot(): Promise<void> {
    if (this.#inFlight < this.#maxInFlight) {
      this.#inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => this.#queue.push(resolve));
    this.#inFlight += 1;
  }

  #release() {
    this.#inFlight -= 1;
    this.#queue.shift()?.();
  }

  async get(request: QlooRequest, options?: GetOptions): Promise<TransportResult> {
    const key = requestKey(request);
    await this.#slot();
    try {
      const result = await this.#inner.get(request, options);
      const body = pruneBody(result.body);
      this.#entries.set(key, { key, path: request.path, params: canonicalParams(request.query), recordedAt: this.#now().toISOString(), body });
      return { ...result, body };
    } catch (error) {
      this.failures.push({ key, error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.#release();
    }
  }

  file(baseUrl: string): RecordedFile {
    const entries = [...this.#entries.values()].sort((a, b) => a.key.localeCompare(b.key));
    return { version: 1, baseUrl, recordedAt: this.#now().toISOString(), entries };
  }
}
