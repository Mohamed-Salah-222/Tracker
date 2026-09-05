/**
 * How often a habit is meant to happen.
 *
 * Until now a habit was either every day or a count for the month, so a habit you
 * actually do on Monday, Wednesday and Friday read as four failures a week. The
 * monthly target softened the score and did nothing for the grid, which still showed
 * a row of misses for days you never intended to use.
 *
 * The shape is flat rather than a union per type. Mongoose stores a flat subdocument
 * without ceremony, changing a habit from "3 times a week" to "Mon, Wed, Fri" then
 * costs nothing, and the unused fields simply sit there. Everything that reads a
 * schedule goes through the helpers below, so the unused fields are never consulted.
 */
export const SCHEDULE_TYPES = ["daily", "weekdays", "timesPerWeek", "everyNDays"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export type Schedule = {
  type: ScheduleType;
  /** weekdays: which days, 0 to 6 with Sunday first, matching getUTCDay. */
  days: number[];
  /** timesPerWeek: how many days in the week keep it. */
  times: number;
  /** everyNDays: the gap. 2 is every other day. */
  n: number;
  /** everyNDays: the day the cycle counts from. */
  anchor: string | null;
};

export const DEFAULT_SCHEDULE: Schedule = { type: "daily", days: [], times: 3, n: 2, anchor: null };

const DAY = 86_400_000;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (dayIso: string) => Date.parse(dayIso + "T00:00:00Z");
const dowOf = (dayIso: string) => new Date(at(dayIso)).getUTCDay();

/** The day a week starts, given the week-start day from settings. */
export function weekStart(dayIso: string, startsOn: number): string {
  const d = new Date(at(dayIso));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - startsOn + 7) % 7));
  return iso(d);
}

export const shiftDay = (dayIso: string, by: number) => iso(new Date(at(dayIso) + by * DAY));
export const daysBetween = (fromIso: string, toIso: string) => Math.round((at(toIso) - at(fromIso)) / DAY);

/** Every day from `fromIso` to `toIso`, both ends included. */
export function eachDay(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  for (let d = fromIso; d <= toIso; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/**
 * Read a schedule off a request body.
 *
 * Returns the error text rather than throwing, so the route can answer with it. A
 * schedule nobody can satisfy is the failure mode worth guarding: no weekdays chosen,
 * zero times a week, a gap of zero days.
 */
export function normalizeSchedule(input: unknown, fallbackAnchor: string): { schedule: Schedule } | { error: string } {
  if (input === undefined || input === null) return { schedule: { ...DEFAULT_SCHEDULE, anchor: fallbackAnchor } };
  if (typeof input !== "object") return { error: "schedule must be an object" };
  const raw = input as Record<string, unknown>;
  const type = raw.type;
  if (typeof type !== "string" || !(SCHEDULE_TYPES as readonly string[]).includes(type)) {
    return { error: `schedule must be one of ${SCHEDULE_TYPES.join(", ")}` };
  }

  const schedule: Schedule = { ...DEFAULT_SCHEDULE, anchor: fallbackAnchor, type: type as ScheduleType };

  if (type === "weekdays") {
    const days = Array.isArray(raw.days) ? raw.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6) : [];
    if (days.length === 0) return { error: "pick at least one day of the week" };
    schedule.days = [...new Set(days)].sort((a, b) => a - b);
  }

  if (type === "timesPerWeek") {
    const times = Number(raw.times);
    if (!Number.isInteger(times) || times < 1 || times > 7) return { error: "times a week must be between 1 and 7" };
    schedule.times = times;
  }

  if (type === "everyNDays") {
    const n = Number(raw.n);
    if (!Number.isInteger(n) || n < 2 || n > 30) return { error: "the gap must be between 2 and 30 days" };
    schedule.n = n;
    schedule.anchor = typeof raw.anchor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.anchor) ? raw.anchor : fallbackAnchor;
  }

  return { schedule };
}

/** Plain English, for the page and for the manage list. */
export function describeSchedule(s: Schedule): string {
  if (s.type === "weekdays") {
    if (s.days.length === 7) return "Every day";
    return s.days.map((d) => SHORT[d]).join(", ");
  }
  if (s.type === "timesPerWeek") return s.times === 1 ? "Once a week" : `${s.times} times a week`;
  if (s.type === "everyNDays") return s.n === 2 ? "Every other day" : `Every ${s.n} days`;
  return "Every day";
}

/**
 * Is this habit meant to happen on this day?
 *
 * A habit counted by the week has no particular day, so every day is a chance to keep
 * it and none of them is a miss on its own. Whether the week was kept is a question
 * for `weeksIn`, not for a single square.
 */
export function isExpected(s: Schedule, dayIso: string): boolean {
  if (s.type === "weekdays") return s.days.includes(dowOf(dayIso));
  if (s.type === "everyNDays") return s.anchor ? Math.abs(daysBetween(s.anchor, dayIso)) % s.n === 0 : true;
  return true;
}

/** True when a day is simply not this habit's day, so it should read as blank rather than missed. */
export const isOffDay = (s: Schedule, dayIso: string) => s.type !== "timesPerWeek" && !isExpected(s, dayIso);

/** How many days in this window the habit was meant to happen. */
export function expectedCount(s: Schedule, fromIso: string, toIso: string, startsOn: number): number {
  if (toIso < fromIso) return 0;
  if (s.type === "timesPerWeek") {
    // Part of a week inside the window cannot demand more days than it holds.
    return weeksIn(fromIso, toIso, startsOn).reduce((sum, week) => sum + Math.min(s.times, week.days.length), 0);
  }
  return eachDay(fromIso, toIso).filter((d) => isExpected(s, d)).length;
}

/** The weeks a window touches, each with only the days that fall inside it. */
export function weeksIn(fromIso: string, toIso: string, startsOn: number): { start: string; days: string[] }[] {
  const out: { start: string; days: string[] }[] = [];
  let current: { start: string; days: string[] } | null = null;
  for (const day of eachDay(fromIso, toIso)) {
    const start = weekStart(day, startsOn);
    if (!current || current.start !== start) {
      current = { start, days: [] };
      out.push(current);
    }
    current.days.push(day);
  }
  return out;
}

/** A weekly habit's streak counts weeks; everything else counts days. */
export const streakUnit = (s: Schedule): "day" | "week" => (s.type === "timesPerWeek" ? "week" : "day");

/** Paused means the days do not count, rather than the habit being gone. */
export const isPaused = (pausedUntil: Date | null | undefined, dayIso: string) => Boolean(pausedUntil && dayIso <= iso(pausedUntil));
