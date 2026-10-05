// Per-viewer conveniences only: the last learner and week, so a refresh
// doesn't lose them. Storage can be missing or blocked, so every call is guarded.

const KEY = "subs-off:v1";

export interface Saved {
  learner?: unknown;
  plan?: unknown;
  feedback?: unknown;
}

export function load(): Saved {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}

export function save(value: Saved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the app still works without it.
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
