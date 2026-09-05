import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { api } from "./api";

/**
 * Writes that survive a dead zone.
 *
 * The app already reads offline: the service worker serves the shell and the last
 * answer it saw. Writing was the half that did not exist. Workout sets had their own
 * retry queue and nothing else did, so logging water in the same basement simply
 * failed and the number was gone.
 *
 * This catches any write that failed for want of a network, keeps it, and replays it
 * when there is one again. Three rules make that safe:
 *
 *  - Only network failures are queued. A 400 means the server looked at the request
 *    and said no, and replaying it will get the same answer forever.
 *  - Requests replay in the order they were made. A delete that followed a create has
 *    to stay behind it.
 *  - Every queued request carries an idempotency key, so a write that actually
 *    succeeded while the answer was lost cannot happen twice on replay.
 */
const STORAGE_KEY = "lifetracker.offline.queue.v1";
const BACKOFF_MS = [2_000, 5_000, 15_000, 45_000, 120_000];
const MAX_ATTEMPTS = 8;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Endpoints with a queue of their own, which would otherwise be sent twice. */
const OWNED_ELSEWHERE = ["/workouts/sets", "/streak/ping"];

export type QueuedWrite = {
  id: string;
  method: string;
  url: string;
  data: unknown;
  params: unknown;
  queuedAt: number;
  attempts: number;
  lastError: string | null;
};

export type QueueSnapshot = { pending: number; syncing: boolean; oldestAt: number | null; lastError: string | null };

let queue: QueuedWrite[] = [];
let syncing = false;
let lastError: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(snapshot: QueueSnapshot) => void>();

function snapshot(): QueueSnapshot {
  return { pending: queue.length, syncing, oldestAt: queue.length ? queue[0].queuedAt : null, lastError };
}

function emit() {
  const current = snapshot();
  for (const listener of listeners) listener(current);
}

export function subscribeToQueue(listener: (snapshot: QueueSnapshot) => void): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Out of storage. The queue still works for this session.
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    // Anything older than a week is not worth replaying into a changed world.
    queue = parsed.filter((item: QueuedWrite) => item && typeof item.url === "string" && Date.now() - item.queuedAt < MAX_AGE_MS);
  } catch {
    queue = [];
  }
}

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** A failure with no response at all is the network, not the server. */
export function isNetworkFailure(error: { response?: unknown; code?: string }): boolean {
  if (error.response) return false;
  return error.code !== "ERR_CANCELED";
}

function queueable(config: AxiosRequestConfig): boolean {
  const method = (config.method ?? "get").toLowerCase();
  if (method === "get") return false;
  const url = config.url ?? "";
  if (OWNED_ELSEWHERE.some((path) => url.includes(path))) return false;
  // A replay of the export or a test push is pointless once the moment has passed.
  return !url.includes("/export") && !url.includes("/reminders/test");
}

export function enqueue(config: AxiosRequestConfig): QueuedWrite | null {
  if (!queueable(config)) return null;
  const item: QueuedWrite = {
    id: newId(),
    method: (config.method ?? "post").toUpperCase(),
    url: config.url ?? "",
    data: config.data ? safeParse(config.data) : undefined,
    params: config.params ?? undefined,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
  queue.push(item);
  persist();
  emit();
  schedule(0);
  return item;
}

/** Axios hands the body back as a JSON string once the request has been serialised. */
function safeParse(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function schedule(delay: number) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

/**
 * Send what is waiting, oldest first, stopping at the first failure.
 *
 * Stopping matters: the queue is ordered, and skipping past a stuck request to send
 * a later one would apply them out of order.
 */
export async function flush(): Promise<void> {
  if (syncing || queue.length === 0) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  syncing = true;
  lastError = null;
  let drained = 0;
  emit();

  while (queue.length > 0) {
    const item = queue[0];
    try {
      await api.request({
        method: item.method,
        url: item.url,
        data: item.data,
        params: item.params,
        // The same key on every attempt is the whole point: the server replays its
        // first answer rather than doing the work twice.
        headers: { "x-idempotency-key": item.id },
      });
      queue.shift();
      drained++;
      persist();
      emit();
    } catch (error) {
      const failure = error as { response?: { status?: number }; message?: string };
      item.attempts += 1;
      item.lastError = failure.response?.status ? `server said ${failure.response.status}` : (failure.message ?? "no connection");

      // The server looked at it and refused. Replaying will not change its mind, and
      // holding it would block everything behind it forever.
      const rejected = Boolean(failure.response) && (failure.response?.status ?? 0) < 500;
      if (rejected || item.attempts >= MAX_ATTEMPTS) {
        lastError = `${item.method} ${item.url}: ${item.lastError}`;
        queue.shift();
        persist();
        emit();
        continue;
      }

      lastError = item.lastError;
      persist();
      syncing = false;
      emit();
      schedule(BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)]);
      return;
    }
  }

  syncing = false;
  emit();

  // Everything waiting has landed. Anything created offline is still on screen with a
  // placeholder id, so the page is offered a way to go and fetch the real thing.
  if (drained > 0) window.dispatchEvent(new CustomEvent("lifetracker:synced", { detail: { count: drained } }));
}

let installed = false;

/**
 * Catch failed writes on their way out.
 *
 * The request is answered as if it had succeeded, because from the page's point of
 * view it has: the change is recorded and will land. Letting it reject would make
 * every save handler in the app show an error for something that is not lost.
 */
export function installOfflineQueue(): void {
  if (installed) return;
  installed = true;
  restore();

  api.interceptors.response.use(
    (response) => response,
    (error) => {
      const config = error?.config as AxiosRequestConfig | undefined;
      if (!config || !isNetworkFailure(error) || !queueable(config)) return Promise.reject(error);

      const item = enqueue(config);
      if (!item) return Promise.reject(error);

      /**
       * Answer with the thing that was sent, not with a receipt.
       *
       * Pages append the response to their own list, so a receipt renders as an empty
       * row. Echoing the payload back means the task you just typed appears straight
       * away, which is the entire point of not failing. The id is a placeholder and
       * says so: the real one arrives with the next load.
       */
      const echoed = item.data && typeof item.data === "object" && !Array.isArray(item.data) ? { ...(item.data as Record<string, unknown>) } : {};
      const answer: AxiosResponse = {
        data: { ...echoed, _id: `queued:${item.id}`, queued: true },
        status: 202,
        statusText: "Queued offline",
        headers: {},
        config: config as AxiosResponse["config"],
      };
      return Promise.resolve(answer);
    },
  );

  window.addEventListener("online", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });

  if (queue.length > 0) schedule(1_000);
  emit();
}

/** Drop everything waiting. Only offered where the user can see what they are losing. */
export function clearQueue(): void {
  queue = [];
  lastError = null;
  persist();
  emit();
}
