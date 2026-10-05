export type QlooErrorCode =
  | "QLOO_AUTH"
  | "QLOO_FORBIDDEN_TYPE"
  | "QLOO_BAD_REQUEST"
  | "QLOO_NOT_FOUND"
  | "QLOO_RATE_LIMIT"
  | "QLOO_UPSTREAM"
  | "QLOO_TIMEOUT"
  | "QLOO_NETWORK"
  | "QLOO_CONFIG"
  | "FIXTURE_MISS";

export class QlooError extends Error {
  readonly code: QlooErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: QlooErrorCode, message: string, options: { retryable?: boolean; status?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "QlooError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.status !== undefined) this.status = options.status;
  }

  toJSON() {
    return { code: this.code, message: this.message, retryable: this.retryable, status: this.status };
  }
}

export function errorFromStatus(status: number, body: unknown): QlooError {
  const detail = messageFrom(body);
  if (status === 401) {
    return new QlooError("QLOO_AUTH", "Qloo rejected the API key (401). Check the key and that the base URL is https://hackathon.api.qloo.com.", { status });
  }
  if (status === 403) {
    return new QlooError("QLOO_FORBIDDEN_TYPE", `Qloo refused this request (403)${detail ? `: ${detail}` : ""}.`, { status });
  }
  if (status === 404) {
    return new QlooError("QLOO_NOT_FOUND", `Qloo found nothing for this request (404)${detail ? `: ${detail}` : ""}.`, { status });
  }
  if (status === 429) {
    return new QlooError("QLOO_RATE_LIMIT", "Qloo is rate limiting this key right now.", { status, retryable: true });
  }
  if (status >= 500) {
    return new QlooError("QLOO_UPSTREAM", `Qloo returned a server error (${status}).`, { status, retryable: true });
  }
  return new QlooError("QLOO_BAD_REQUEST", `Qloo could not use this request (${status})${detail ? `: ${detail}` : ""}.`, { status });
}

function messageFrom(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  for (const key of ["message", "reason", "error"]) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  }
  return undefined;
}
