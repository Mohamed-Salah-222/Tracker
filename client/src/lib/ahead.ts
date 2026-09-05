import { api } from "./api";

export type AheadKind = "task" | "overdue" | "subscription" | "goal" | "workout" | "kitchen";

export type AheadItem = {
  /** The day it lands on, or null for something that is simply true now. */
  date: string | null;
  time: string | null;
  kind: AheadKind;
  title: string;
  detail: string;
  url: string;
  /** Days from today. Negative means it is already behind. */
  daysAway: number | null;
};

export type Ahead = { today: string; days: number; items: AheadItem[] };

export const loadAhead = (today: string, days = 7) => api.get<Ahead>("/ahead", { params: { today, days } }).then((r) => r.data);

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today", "Tomorrow", "Fri 12". Nothing longer: this is a glance, not a calendar. */
export function whenLabel(item: AheadItem): string {
  if (item.date === null) return "Now";
  if (item.daysAway !== null && item.daysAway < 0) return "Behind";
  if (item.daysAway === 0) return "Today";
  if (item.daysAway === 1) return "Tomorrow";
  // Built by hand rather than left to toLocaleDateString, which orders the parts by
  // locale and turns "Sat 5" into "5 Sat" on the phone but not on the laptop.
  const d = new Date(item.date + "T00:00:00Z");
  return `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export const KIND_LABEL: Record<AheadKind, string> = {
  task: "Task",
  overdue: "Overdue",
  subscription: "Payment",
  goal: "Goal",
  workout: "Training",
  kitchen: "Shopping",
};
