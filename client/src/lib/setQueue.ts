// Set writes that survive a bad signal.
//
// Gyms are the worst place on earth for reception, and this page is used on a phone
// inside one. The old path wrote the set optimistically, fired a PUT, and rolled the
// value back off the screen when the request failed. Nobody reads a toast mid-set,
// so a dropped request quietly meant a lost set.
//
// Every write goes through this queue instead. The value stays on screen, the write
// is remembered in localStorage so it outlives a reload or a tab the phone decided
// to evict, and it is retried until the server accepts it.
import { useSyncExternalStore } from "react";
import { AxiosError } from "axios";
import { api } from "./api";

export type PendingFields = {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  done: boolean;
};

export type PendingSet = {
  sessionId: string;
  exerciseId: string;
  setNumber: number;
  fields: PendingFields;
  attempts: number;
  updatedAt: number;
};

export type SyncedSet = { sessionId: string; exerciseId: string; setNumber: number; _id?: string };

export type QueueState = {
  /**
   * Only the writes worth interrupting someone for: one that has already come back
   * failed, or anything at all while the phone is offline. A write that left a
   * moment ago and is simply in flight is not in here, because saving normally
   * should be silent.
   */
  keys: Set<string>;
  count: number;
  /** Everything still owed, in flight included. */
  owed: number;
  syncing: boolean;
  /** Set when the server refused a write outright, so it will never be retried. */
  lastError: string | null;
};

export type DroppedSet = { sessionId: string; exerciseId: string; setNumber: number; reason: string };

const STORAGE_KEY = "workout:pending-sets:v1";
const BACKOFF_MS = [1_000, 3_000, 8_000, 20_000, 45_000];
// Axios waits forever by default. On a dying signal a hung request would sit there
// looking like success; this turns it into a failure the queue can retry.
const REQUEST_TIMEOUT_MS = 15_000;

export function pendingKey(sessionId: string, exerciseId: string, setNumber: number): string {
  return `${sessionId}|${exerciseId}|${setNumber}`;
}

// ---------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------
const entries = new Map<string, PendingSet>();
const listeners = new Set<() => void>();
const syncListeners = new Set<(s: SyncedSet) => void>();
const dropListeners = new Set<(d: DroppedSet) => void>();

let syncing = false;
let lastError: string | null = null;
let retryTimer: number | null = null;

// Rebuilt on every change so useSyncExternalStore can compare by reference.
let snapshot: QueueState = { keys: new Set(), count: 0, owed: 0, syncing: false, lastError: null };

function rebuild() {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const keys = new Set<string>();
  for (const [key, e] of entries) if (offline || e.attempts > 0) keys.add(key);
  snapshot = { keys, count: keys.size, owed: entries.size, syncing, lastError };
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...entries.values()]));
  } catch {
    /* private mode, quota, or storage switched off: the in-memory queue still works */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const e of parsed as PendingSet[]) {
      if (!e?.sessionId || !e?.exerciseId || typeof e.setNumber !== "number") continue;
      entries.set(pendingKey(e.sessionId, e.exerciseId, e.setNumber), { ...e, attempts: 0 });
    }
  } catch {
    /* a corrupt blob is not worth crashing the page over */
  }
}

// ---------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------
/**
 * A rejection the server will give again no matter how often we ask: the session was
 * deleted, or the payload is invalid. Retrying forever would mean a queue that never
 * drains. Timeouts, rate limits and 5xx are all still worth another go.
 */
function isPermanent(err: unknown): boolean {
  if (!(err instanceof AxiosError)) return false;
  const status = err.response?.status;
  if (status === undefined) return false; // no response at all: the network, not us
  if (status === 408 || status === 425 || status === 429) return false;
  return status >= 400 && status < 500;
}

function describe(err: unknown): string {
  if (err instanceof AxiosError) return (err.response?.data as { error?: string })?.error ?? err.message;
  return "Something went wrong";
}

function schedule() {
  if (retryTimer !== null || entries.size === 0) return;
  // attempts is already incremented by the failure that got us here, so the entry
  // with one failure behind it waits the first step rather than skipping it.
  const worst = Math.max(...[...entries.values()].map((e) => e.attempts));
  const wait = BACKOFF_MS[Math.min(Math.max(worst - 1, 0), BACKOFF_MS.length - 1)];
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flush();
  }, wait);
}

export async function flush(): Promise<void> {
  if (syncing || entries.size === 0) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return schedule();

  syncing = true;
  lastError = null;
  rebuild();

  for (const [key, entry] of [...entries]) {
    try {
      const r = await api.put<{ _id?: string }>("/workouts/sets", {
        sessionId: entry.sessionId,
        exerciseId: entry.exerciseId,
        setNumber: entry.setNumber,
        ...entry.fields,
      }, { timeout: REQUEST_TIMEOUT_MS });
      // Only clear the slot if nothing newer was queued while this was in flight.
      const current = entries.get(key);
      if (current && current.updatedAt === entry.updatedAt) entries.delete(key);
      const synced: SyncedSet = { sessionId: entry.sessionId, exerciseId: entry.exerciseId, setNumber: entry.setNumber, _id: r.data?._id };
      for (const l of syncListeners) l(synced);
    } catch (err) {
      if (isPermanent(err)) {
        // Never coming back. Nobody would notice it vanish from the queue, so this
        // is the one case the page is told about outright.
        entries.delete(key);
        lastError = describe(err);
        const dropped: DroppedSet = { sessionId: entry.sessionId, exerciseId: entry.exerciseId, setNumber: entry.setNumber, reason: lastError };
        for (const l of dropListeners) l(dropped);
      } else {
        entry.attempts += 1;
      }
    }
  }

  syncing = false;
  persist();
  rebuild();

  // A set ticked while this pass was in flight has not been tried even once. Making
  // it sit out a backoff step meant for failures would delay a save that has no
  // reason to be slow, so it goes straight round again.
  if ([...entries.values()].some((e) => e.attempts === 0)) return void flush();
  schedule();
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------
/**
 * Queue one set. The whole row is sent rather than the single edited field, because
 * an earlier write for the same set may still be owed: replaying just `{done:true}`
 * over a weight that never landed would save a ticked set with no numbers in it.
 * PUT /workouts/sets upserts on (session, exercise, setNumber), so replays are safe.
 */
export function queueSet(sessionId: string, exerciseId: string, setNumber: number, fields: PendingFields): void {
  entries.set(pendingKey(sessionId, exerciseId, setNumber), { sessionId, exerciseId, setNumber, fields, attempts: 0, updatedAt: Date.now() });
  persist();
  rebuild();
  void flush();
}

/** Drops every write owed for a session. For when the session itself is deleted. */
export function forgetSession(sessionId: string): void {
  let changed = false;
  for (const [key, e] of [...entries]) {
    if (e.sessionId !== sessionId) continue;
    entries.delete(key);
    changed = true;
  }
  if (!changed) return;
  persist();
  rebuild();
}

/** The queued rows for one session, newest state per set, for overlaying on a reload. */
export function pendingFor(sessionId: string): PendingSet[] {
  return [...entries.values()].filter((e) => e.sessionId === sessionId);
}

export function onSetSynced(cb: (s: SyncedSet) => void): () => void {
  syncListeners.add(cb);
  return () => syncListeners.delete(cb);
}

/** Fires when the server refuses a write for good, so the page can say so. */
export function onSetDropped(cb: (d: DroppedSet) => void): () => void {
  dropListeners.add(cb);
  return () => dropListeners.delete(cb);
}

export function useSetQueue(): QueueState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

restore();
rebuild();

if (typeof window !== "undefined") {
  // Coming back into signal, or back into the foreground, is the moment worth retrying.
  window.addEventListener("online", () => {
    rebuild();
    void flush();
  });
  // Losing signal makes everything already queued worth showing, without waiting for
  // a request to fail first.
  window.addEventListener("offline", rebuild);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flush();
  });
  void flush();
}
