import { AxiosError } from "axios";
import { todayISO } from "./today";

// =====================================================================
// Shared task vocabulary.
//
// Tasks and Today are two views of the same thing. They used to carry their own
// copies of the type, the error helper, the date maths and the row component,
// which is how they drifted apart. Everything common lives here.
// =====================================================================

export type Task = {
  _id: string;
  title: string;
  /** ISO datetime from the API; the calendar day is the first 10 characters. */
  date: string;
  done: boolean;
  /** "15:00", or null for some time that day. */
  time?: string | null;
  /** An absolute instant to be nudged at, or null for no reminder. */
  remindAt?: string | null;
  /** Set once the notification has gone out. */
  remindedAt?: string | null;
  completedAt?: string | null;
  /** The anchor task every day is seeded with. Cannot be renamed or deleted. */
  isDefault?: boolean;
};

export function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

/** The calendar day a task belongs to. */
export function taskDay(task: Task): string {
  return task.date.slice(0, 10);
}

export function shiftDay(iso: string, by: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

export function isWeekend(iso: string): boolean {
  const dow = new Date(iso + "T00:00:00Z").getUTCDay();
  return dow === 0 || dow === 6;
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

export const weekdayLong = (iso: string) => fmt(iso, { weekday: "long" });
export const dayLong = (iso: string) => fmt(iso, { weekday: "long", month: "long", day: "numeric" });
export const dayMedium = (iso: string) => fmt(iso, { weekday: "short", month: "short", day: "numeric" });
export const dayShort = (iso: string) => fmt(iso, { month: "short", day: "numeric" });
export const fullDate = (iso: string) => fmt(iso, { month: "long", day: "numeric", year: "numeric" });

/** "today" / "tomorrow" / "3 days ago": for headers and overdue badges. */
export function relativeDay(iso: string): string {
  const days = Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(todayISO() + "T00:00:00Z")) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days < 0) {
    const n = Math.abs(days);
    if (n < 7) return `${n} days ago`;
    if (n < 30) return `${Math.floor(n / 7)}w ago`;
    return `${Math.floor(n / 30)}mo ago`;
  }
  if (days < 7) return `in ${days} days`;
  return `in ${Math.floor(days / 7)}w`;
}

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
