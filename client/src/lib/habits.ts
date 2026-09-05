// Habit definitions. These used to be a hardcoded enum plus three lookup maps
// spread over five files, so adding one meant a code change and a deploy.
import { AxiosError } from "axios";
import { api } from "./api";

export type HabitType = "check" | "count";

export type HabitDef = {
  _id: string;
  key: string;
  label: string;
  description: string;
  icon: string;
  type: HabitType;
  dailyTarget: number;
  unit: string;
  /** 0 means every day of the month. */
  monthlyTarget: number;
  schedule: Schedule;
  /** Built by the server so the wording is decided in one place. */
  scheduleLabel: string;
  timeOfDay: TimeOfDay;
  /** The last day of a pause, or null. */
  pausedUntil: string | null;
  onHabitsPage: boolean;
  order: number;
  archived: boolean;
  /** Set when another page fills this in, which locks how it is measured. */
  derivedFrom: string | null;
};

export const SCHEDULE_TYPES = ["daily", "weekdays", "timesPerWeek", "everyNDays"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export type Schedule = {
  type: ScheduleType;
  /** 0 to 6, Sunday first, matching getUTCDay. */
  days: number[];
  times: number;
  n: number;
  anchor: string | null;
};

export const DEFAULT_SCHEDULE: Schedule = { type: "daily", days: [], times: 3, n: 2, anchor: null };

export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "anytime"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const TIME_OF_DAY_LABEL: Record<TimeOfDay, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  anytime: "Anytime",
};

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The same sentence the server builds, so the two never drift apart in wording. */
export function describeSchedule(s: Schedule): string {
  if (s.type === "weekdays") return s.days.length === 7 ? "Every day" : s.days.map((d) => DAY_SHORT[d]).join(", ");
  if (s.type === "timesPerWeek") return s.times === 1 ? "Once a week" : s.times + " times a week";
  if (s.type === "everyNDays") return s.n === 2 ? "Every other day" : "Every " + s.n + " days";
  return "Every day";
}

export function habitError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export async function listHabits(archived = false): Promise<HabitDef[]> {
  const r = await api.get<HabitDef[]>("/habits", { params: archived ? { archived: "1" } : {} });
  return r.data;
}

/**
 * The icons a habit can wear. Anything the app already uses somewhere, so the set
 * stays recognisable rather than becoming a full icon picker.
 */
export const HABIT_ICONS = [
  "circle-check",
  "pill",
  "hands",
  "moon",
  "footprints",
  "book-open",
  "folder-kanban",
  "languages",
  "dumbbell",
  "list-checks",
  "flame",
  "beef",
  "droplet",
  "briefcase",
  "heart",
  "brain",
  "sun",
  "music",
  "pen-line",
  "bike",
] as const;

/** How a monthly target reads on screen. */
export function monthlyLabel(monthlyTarget: number): string {
  return monthlyTarget > 0 ? `${monthlyTarget} days a month` : "Every day";
}
