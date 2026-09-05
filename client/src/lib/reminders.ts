import { AxiosError } from "axios";
import { api } from "./api";

export const CONDITIONS = ["usage", "tasks", "water", "calories", "protein", "sleep", "journal", "workout", "steps"] as const;
export type Condition = (typeof CONDITIONS)[number];

/** What each condition means, in the second person, for the picker. */
export const CONDITION_LABELS: Record<Condition, string> = {
  usage: "you have opened the app",
  tasks: "everything planned is done",
  water: "the water target is hit",
  calories: "the day is inside the calorie target",
  protein: "the protein floor is hit",
  sleep: "last night is logged",
  journal: "today is written",
  workout: "the session or rest day is logged",
  steps: "the step target is hit",
};

export type Reminder = {
  _id: string;
  label: string;
  body: string;
  time: string;
  days: number[];
  condition: Condition | null;
  url: string;
  enabled: boolean;
  lastSentOn: string | null;
  lastSentAt: string | null;
  sentCount: number;
  lastSkippedReason: string | null;
};

export type PushConfig = { ready: boolean; publicKey: string; devices: number; conditions: Condition[] };

export function reminderError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export const supportsPush = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export const permission = (): NotificationPermission => (supportsPush() ? Notification.permission : "denied");

/**
 * The VAPID key travels as base64url and the browser wants raw bytes.
 *
 * Built on an explicit ArrayBuffer: a plain Uint8Array is typed over ArrayBufferLike,
 * which subscribe() will not take because it could in principle be shared memory.
 */
function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function loadConfig(): Promise<PushConfig> {
  const r = await api.get<PushConfig>("/reminders/config");
  return r.data;
}

/**
 * Ask this browser to accept notifications, then hand the subscription to the server.
 *
 * Returns what actually happened rather than throwing, because "you said no" is a
 * normal answer that the page has to explain, not an error.
 */
export async function enablePush(publicKey: string): Promise<{ ok: boolean; reason?: string }> {
  if (!supportsPush()) return { ok: false, reason: "This browser cannot show notifications." };
  if (!publicKey) return { ok: false, reason: "The server has no push keys configured." };

  const granted = await Notification.requestPermission();
  if (granted !== "granted") return { ok: false, reason: granted === "denied" ? "Notifications are blocked for this site." : "Notifications were not allowed." };

  const registration = await navigator.serviceWorker.ready;
  // Tell the worker where the API is, so it can re-register itself if the browser
  // ever retires this subscription while the app is closed.
  registration.active?.postMessage({ type: "api-base", base: api.defaults.baseURL ?? "" });

  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) }));

  await api.post("/reminders/subscribe", {
    ...subscription.toJSON(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
  });
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!supportsPush()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api.post("/reminders/unsubscribe", { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}

/**
 * Re-report an existing subscription on app start.
 *
 * Endpoints rotate, and the server's copy goes stale silently: reminders simply stop
 * arriving with nothing to show for it. Re-sending what the browser currently holds
 * costs one request and keeps the two in step.
 */
export async function refreshSubscription(): Promise<void> {
  if (!supportsPush() || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({ type: "api-base", base: api.defaults.baseURL ?? "" });
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await api.post("/reminders/subscribe", {
      ...subscription.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
    });
  } catch {
    /* A stale endpoint is pruned server-side on the next send. */
  }
}

export const listReminders = () => api.get<Reminder[]>("/reminders").then((r) => r.data);
export const createReminder = (body: Partial<Reminder>) => api.post<Reminder>("/reminders", body).then((r) => r.data);
export const updateReminder = (id: string, body: Partial<Reminder>) => api.patch<Reminder>(`/reminders/${id}`, body).then((r) => r.data);
export const deleteReminder = (id: string) => api.delete(`/reminders/${id}`);
export const testPush = () => api.post("/reminders/test");

export const DAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** "Every day at 21:00", "Weekdays at 07:30", "Mo, We, Fr at 18:00". */
export function scheduleLabel(reminder: Pick<Reminder, "time" | "days">): string {
  const { days, time } = reminder;
  if (days.length === 0) return `Every day at ${time}`;
  const set = [...days].sort().join(",");
  if (set === "1,2,3,4,5") return `Weekdays at ${time}`;
  if (set === "0,6") return `Weekends at ${time}`;
  return `${days.map((d) => DAY_SHORT[d]).join(", ")} at ${time}`;
}

/** Sensible starting points, so the first reminder is one tap rather than a form. */
export const SUGGESTIONS: { label: string; body: string; time: string; condition: Condition | null; url: string }[] = [
  { label: "Log your day", body: "Anything you did today that is not written down yet.", time: "21:00", condition: "usage", url: "/today" },
  { label: "Water", body: "Still short of the target for today.", time: "16:00", condition: "water", url: "/calories" },
  { label: "Write it down", body: "How did today actually go?", time: "22:00", condition: "journal", url: "/today" },
  { label: "Last night", body: "Bed and wake times for last night.", time: "09:00", condition: "sleep", url: "/today" },
  { label: "Training", body: "Session or rest day, either counts.", time: "18:00", condition: "workout", url: "/workout" },
];
