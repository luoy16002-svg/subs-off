import { QlooError } from "./errors";
import { requestKey } from "./query";
import type { QlooSimulator } from "./simulator";
import type { GetOptions, QlooTransport, TransportResult } from "./transport";
import type { QlooPath, QlooRequest } from "./types";

/** One recorded live response, keyed by its canonical request. */
export interface RecordedEntry {
  key: string;
  path: QlooPath;
  params: Record<string, string>;
  recordedAt: string;
  body: unknown;
}

export interface RecordedFile {
  version: number;
  baseUrl?: string;
  recordedAt?: string | null;
  entries: RecordedEntry[];
}

export class RecordedStore {
  readonly #entries = new Map<string, RecordedEntry>();

  constructor(file?: RecordedFile | null) {
    for (const entry of file?.entries ?? []) {
      if (entry && typeof entry.key === "string" && entry.body !== undefined) this.#entries.set(entry.key, entry);
    }
  }

  get size(): number {
    return this.#entries.size;
  }

  lookup(request: QlooRequest): RecordedEntry | undefined {
    return this.#entries.get(requestKey(request));
  }

  entries(): RecordedEntry[] {
    return [...this.#entries.values()];
  }
}

/**
 * Offline transport: an exact recorded response when one exists, otherwise
 * the catalog simulator (when allowed), otherwise a clear FIXTURE_MISS.
 */
export class FixtureTransport implements QlooTransport {
  readonly kind = "fixtures";
  readonly #store: RecordedStore;
  readonly #simulator: QlooSimulator | undefined;

  constructor(options: { store: RecordedStore; simulator?: QlooSimulator }) {
    this.#store = options.store;
    this.#simulator = options.simulator;
  }

  async get(request: QlooRequest, _options?: GetOptions): Promise<TransportResult> {
    const started = Date.now();
    const hit = this.#store.lookup(request);
    if (hit) return { body: structuredClone(hit.body), source: "recorded", ms: Date.now() - started, recordedAt: hit.recordedAt };
    if (this.#simulator) {
      const body = this.#simulator.answer(request);
      return { body, source: "simulated", ms: Date.now() - started };
    }
    throw new QlooError("FIXTURE_MISS", `No recorded response for ${requestKey(request)}.`);
  }
}

/**
 * Live transport with two quota savers: answers already recorded for the
 * sample learners are served from the recording, and when Qloo is briefly
 * unavailable a recorded answer for the same request is used instead.
 * It never falls back to simulated data.
 */
export class RecordedFirstTransport implements QlooTransport {
  readonly kind = "live+recorded";
  readonly #live: QlooTransport;
  readonly #store: RecordedStore;
  readonly #preferRecorded: boolean;

  constructor(options: { live: QlooTransport; store: RecordedStore; preferRecorded?: boolean }) {
    this.#live = options.live;
    this.#store = options.store;
    this.#preferRecorded = options.preferRecorded ?? true;
  }

  async get(request: QlooRequest, options?: GetOptions): Promise<TransportResult> {
    const hit = this.#store.lookup(request);
    if (hit && this.#preferRecorded) {
      return { body: structuredClone(hit.body), source: "recorded", ms: 0, recordedAt: hit.recordedAt };
    }
    try {
      return await this.#live.get(request, options);
    } catch (error) {
      if (hit && error instanceof QlooError && error.retryable) {
        return { body: structuredClone(hit.body), source: "recorded", ms: 0, recordedAt: hit.recordedAt };
      }
      throw error;
    }
  }
}
