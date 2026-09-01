// Goals at three horizons, with a timeline under each.
import { AxiosError } from "axios";
import { api } from "./api";

export type Horizon = "lifetime" | "monthly" | "weekly" | "custom";
export type GoalStatus = "active" | "done" | "archived";

export type Measure = { unit: string; startValue: number; targetValue: number };

export type Goal = {
  _id: string;
  title: string;
  why: string;
  horizon: Horizon;
  periodKey: string | null;
  periodLabel: string;
  startDate: string | null;
  endDate: string | null;
  /** Days until the period opens. Null once it has begun. */
  daysUntilStart: number | null;
  targetDate: string | null;
  measure: Measure | null;
  status: GoalStatus;
  completedAt: string | null;
  order: number;
  /** null for a goal with no number to track. */
  percent: number | null;
  current: number | null;
  checkpointCount: number;
  lastCheckpointAt: string | null;
  /** Days since the last entry. Null when there has never been one. */
  quietDays: number | null;
  daysLeft: number | null;
};

export type Comment = { _id: string; body: string; createdAt: string | null };
export type Checkpoint = { _id: string; date: string; note: string; improve: string; value: number | null; comments: Comment[] };

export type GoalsResponse = { today: string; currentMonth: string; currentWeek: string; goals: Goal[] };

export const HORIZON_LABEL: Record<Horizon, string> = {
  lifetime: "Open",
  monthly: "Month",
  weekly: "Week",
  custom: "Dated",
};

export const HORIZON_BLURB: Record<Horizon, string> = {
  lifetime: "No deadline. Add checkpoints as you go and the timeline is the progress.",
  monthly: "What a month is for. Pick any month, including one that has not started.",
  weekly: "The short cycle. What you did, and what should have gone better.",
  custom: "Your own start and end, for anything that does not land on a calendar boundary.",
};

/** The Monday on or before a date, matching how the server keys a week. */
export function mondayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

export function shiftDays(iso: string, by: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") + by * 86_400_000).toISOString().slice(0, 10);
}

export function addMonths(monthKey: string, by: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function weekKeyLabel(monday: string): string {
  const start = new Date(monday + "T00:00:00Z");
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(start)} to ${fmt(end)}`;
}

export function goalError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

export async function listGoals(today: string, params: Record<string, string> = {}): Promise<GoalsResponse> {
  const r = await api.get<GoalsResponse>("/goals", { params: { today, ...params } });
  return r.data;
}

/** "3 kg to go", "12,000 EGP to go", or null when there is no number. */
export function remainingLabel(goal: Goal): string | null {
  if (!goal.measure || goal.current === null) return null;
  const left = Math.abs(goal.measure.targetValue - goal.current);
  if (left === 0) return "target reached";
  const n = Number.isInteger(left) ? left.toLocaleString("en-US") : left.toFixed(1);
  return `${n}${goal.measure.unit ? " " + goal.measure.unit : ""} to go`;
}

/**
 * A goal with no entries for a while is the one worth nudging. Period goals get a
 * shorter fuse than open ones, because a week is over before a fortnight of quiet.
 */
export function isQuiet(goal: Goal): boolean {
  if (goal.status !== "active") return false;
  // A period you planned for next month is not neglected, it has not begun.
  if (goal.daysUntilStart !== null) return false;
  const limit = goal.horizon === "weekly" ? 4 : goal.horizon === "monthly" ? 10 : 21;
  if (goal.quietDays === null) return goal.checkpointCount === 0;
  return goal.quietDays >= limit;
}

/** "every ~9 days", or null when there is not enough of a trail to say. */
export function cadenceLabel(count: number, firstIso: string | null, todayIso: string): string | null {
  if (!firstIso || count < 2) return null;
  const span = Math.round((Date.parse(todayIso + "T00:00:00Z") - Date.parse(firstIso + "T00:00:00Z")) / 86_400_000);
  if (span < 1) return null;
  const every = Math.max(1, Math.round(span / count));
  return `about one every ${every} day${every === 1 ? "" : "s"}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / 86_400_000);
}

export function dayLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
