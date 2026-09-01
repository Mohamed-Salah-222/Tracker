/**
 * When does a repeating thing happen next?
 *
 * Written on its own rather than inside the subscription route because it is not
 * about money. A gym membership on the 1st, a bin day every Tuesday and a task that
 * repeats every month are the same question, and the Tasks page will want the same
 * answer. Nothing in here knows what it is scheduling.
 *
 * Everything is UTC midnight, matching every other date in the app.
 */
export const CYCLES = ["weekly", "monthly", "yearly"] as const;
export type Cycle = (typeof CYCLES)[number];

const DAY = 86_400_000;

export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const dayUTC = (isoDate: string) => new Date(isoDate + "T00:00:00Z");

/** Days in a month, so the 31st can be clamped in February. */
export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export type Schedule = {
  cycle: Cycle;
  /** Monthly and yearly: the day of the month, 1 to 31. Weekly: ignored. */
  day: number;
  /** Weekly only: 0 is Sunday, matching getUTCDay. */
  weekday?: number;
  /** Yearly only: 1 to 12. */
  month?: number;
  /** Nothing is due before this. */
  startDate: string;
};

/**
 * The occurrence on or after a given date.
 *
 * A monthly charge on the 31st does not skip February: it lands on the 28th or 29th,
 * because that is when the money actually leaves. Clamping is per month rather than
 * a rolling offset, so March goes back to the 31st instead of drifting earlier every
 * month, which is what adding thirty days in a loop would do.
 */
export function occurrenceOnOrAfter(schedule: Schedule, fromIso: string): string {
  const floorIso = fromIso < schedule.startDate ? schedule.startDate : fromIso;
  const from = dayUTC(floorIso);

  if (schedule.cycle === "weekly") {
    const want = ((schedule.weekday ?? 1) % 7 + 7) % 7;
    const ahead = (want - from.getUTCDay() + 7) % 7;
    return iso(new Date(from.getTime() + ahead * DAY));
  }

  if (schedule.cycle === "yearly") {
    const month = Math.min(Math.max(schedule.month ?? 1, 1), 12);
    for (let year = from.getUTCFullYear(); year <= from.getUTCFullYear() + 2; year++) {
      const day = Math.min(schedule.day, daysInMonth(year, month));
      const candidate = new Date(Date.UTC(year, month - 1, day));
      if (candidate >= from) return iso(candidate);
    }
    return iso(from);
  }

  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();
  for (let step = 0; step < 26; step++) {
    const day = Math.min(schedule.day, daysInMonth(year, month + 1));
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate >= from) return iso(candidate);
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  return iso(from);
}

/** The next one strictly after a date, which is what "already paid" means. */
export function occurrenceAfter(schedule: Schedule, afterIso: string): string {
  return occurrenceOnOrAfter(schedule, iso(new Date(dayUTC(afterIso).getTime() + DAY)));
}

/** Every occurrence in a window, for a calendar or a forecast. */
export function occurrencesBetween(schedule: Schedule, fromIso: string, toIso: string, cap = 400): string[] {
  const out: string[] = [];
  let cursor = occurrenceOnOrAfter(schedule, fromIso);
  while (cursor <= toIso && out.length < cap) {
    out.push(cursor);
    cursor = occurrenceAfter(schedule, cursor);
  }
  return out;
}

/**
 * What this costs per month, whatever its cycle.
 *
 * The only honest way to compare a weekly coffee to a yearly domain. Weekly uses
 * 52 / 12 rather than four, which is the difference between 52 and 48 payments a year.
 */
export function monthlyEquivalent(price: number, cycle: Cycle): number {
  if (cycle === "weekly") return (price * 52) / 12;
  if (cycle === "yearly") return price / 12;
  return price;
}

export function yearlyEquivalent(price: number, cycle: Cycle): number {
  if (cycle === "weekly") return price * 52;
  if (cycle === "monthly") return price * 12;
  return price;
}

export const cycleLabel = (cycle: Cycle) => (cycle === "weekly" ? "a week" : cycle === "yearly" ? "a year" : "a month");
