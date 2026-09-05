import { api } from "./api";
import type { HabitDef } from "./habits";

/**
 * One habit over time.
 *
 * `off` is the important state here: a day the habit was never meant to happen. Before
 * schedules existed every such day rendered as a miss, so a Monday, Wednesday, Friday
 * habit looked like a four-day failure every week.
 */
export type DayState = "done" | "excused" | "missed" | "unknown" | "off" | "paused" | "future";

export type HabitDay = { date: string; state: DayState; amount: number | null; note: string };
export type HabitWeek = { start: string; done: number; target: number; kept: boolean };

export type HabitStats = {
  key: string;
  label: string;
  since: string | null;
  from: string;
  to: string;
  unit: "day" | "week";
  current: number;
  best: number;
  done: number;
  excused: number;
  missed: number;
  expected: number;
  rate: number;
  last30: number;
  days: HabitDay[];
  weeks: HabitWeek[];
  notes: { date: string; note: string }[];
};

export const loadHabitStats = (key: string, today: string, days = 365) =>
  api.get<{ habit: HabitDef; stats: HabitStats }>(`/habits/${key}/stats`, { params: { today, days } }).then((r) => r.data);

/**
 * How a square reads.
 *
 * Monochrome, so the states are told apart by weight rather than colour: a kept day is
 * filled, a skipped one is outlined, a miss is a faint ground, and a day that was never
 * this habit's day is nothing at all.
 */
export const CELL_CLASS: Record<DayState, string> = {
  done: "bg-foreground",
  excused: "bg-transparent ring-1 ring-inset ring-foreground/50",
  missed: "bg-muted",
  unknown: "bg-muted/40",
  off: "bg-transparent",
  paused: "bg-transparent ring-1 ring-inset ring-border",
  future: "bg-transparent",
};

export const STATE_LABEL: Record<DayState, string> = {
  done: "Done",
  excused: "Skipped",
  missed: "Missed",
  unknown: "Nothing logged",
  off: "Not a day for it",
  paused: "Paused",
  future: "Still to come",
};
