import { Subscription } from "../models/Subscription";
import { cycleLabel, iso, monthlyEquivalent, occurrenceAfter, occurrenceOnOrAfter, occurrencesBetween, yearlyEquivalent, type Cycle, type Schedule } from "./recurrence";

type SubDoc = InstanceType<typeof Subscription>;

export function scheduleOf(sub: SubDoc): Schedule {
  return {
    cycle: sub.cycle as Cycle,
    day: sub.billingDay,
    weekday: sub.billingWeekday ?? undefined,
    month: sub.billingMonth ?? undefined,
    startDate: iso(sub.startDate),
  };
}

/**
 * The next date this is owed.
 *
 * Anything already settled is behind `paidThrough`, so the answer is the first
 * occurrence after it. With nothing settled yet the answer is the first occurrence
 * from the day it started, which is what stops a service added today from looking
 * like it owes every month since it was signed up for.
 */
export function nextDueOf(sub: SubDoc): string {
  const schedule = scheduleOf(sub);
  return sub.paidThrough ? occurrenceAfter(schedule, iso(sub.paidThrough)) : occurrenceOnOrAfter(schedule, schedule.startDate);
}

export function shapeSubscription(sub: SubDoc, todayIso: string) {
  const nextDue = nextDueOf(sub);
  const daysUntil = Math.round((Date.parse(nextDue + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / 86_400_000);

  /**
   * How many charges are owed, not just whether one is.
   *
   * A subscription nobody has settled for three months owes three payments, and
   * reporting only the oldest would let the other two disappear the moment it was
   * paid once.
   */
  const owed = occurrencesBetween(scheduleOf(sub), nextDue, todayIso, 60);

  return {
    _id: String(sub._id),
    name: sub.name,
    price: sub.price,
    cycle: sub.cycle,
    cycleLabel: cycleLabel(sub.cycle as Cycle),
    billingDay: sub.billingDay,
    billingWeekday: sub.billingWeekday ?? null,
    billingMonth: sub.billingMonth ?? null,
    sourceType: sub.sourceType,
    sourceId: String(sub.sourceId),
    sourceNameSnapshot: sub.sourceNameSnapshot,
    category: sub.category,
    note: sub.note ?? "",
    startDate: iso(sub.startDate),
    paidThrough: sub.paidThrough ? iso(sub.paidThrough) : null,
    archived: sub.archived,

    nextDue,
    daysUntil,
    due: daysUntil <= 0,
    overdue: daysUntil < 0,
    owedCount: owed.length,
    owedTotal: Math.round(owed.length * sub.price * 100) / 100,
    monthlyEquivalent: Math.round(monthlyEquivalent(sub.price, sub.cycle as Cycle) * 100) / 100,
    yearlyEquivalent: Math.round(yearlyEquivalent(sub.price, sub.cycle as Cycle) * 100) / 100,
  };
}

export type ShapedSubscription = ReturnType<typeof shapeSubscription>;

/**
 * What recurring money costs and what is about to leave.
 *
 * The monthly figure is the comparable one: a weekly delivery and a yearly renewal
 * mean nothing side by side until both are expressed per month.
 */
export async function subscriptionsSummary(todayIso: string, horizonDays = 30) {
  const docs = await Subscription.find({ archived: false }).sort({ name: 1 });
  const items = docs.map((d) => shapeSubscription(d, todayIso)).sort((a, b) => a.nextDue.localeCompare(b.nextDue) || a.name.localeCompare(b.name));

  const horizon = iso(new Date(Date.parse(todayIso + "T00:00:00Z") + horizonDays * 86_400_000));
  const upcoming = items.filter((s) => !s.due && s.nextDue <= horizon);
  const owing = items.filter((s) => s.due);

  const byCategory = new Map<string, number>();
  for (const item of items) byCategory.set(item.category, Math.round(((byCategory.get(item.category) ?? 0) + item.monthlyEquivalent) * 100) / 100);

  return {
    today: todayIso,
    horizonDays,
    items,
    owing,
    upcoming,
    counts: { total: items.length, owing: owing.length, upcoming: upcoming.length },
    monthlyTotal: Math.round(items.reduce((sum, s) => sum + s.monthlyEquivalent, 0) * 100) / 100,
    yearlyTotal: Math.round(items.reduce((sum, s) => sum + s.yearlyEquivalent, 0) * 100) / 100,
    owedTotal: Math.round(owing.reduce((sum, s) => sum + s.owedTotal, 0) * 100) / 100,
    /** What leaves inside the horizon, so a big yearly renewal cannot ambush a month. */
    dueSoonTotal: Math.round(upcoming.reduce((sum, s) => sum + s.price, 0) * 100) / 100,
    byCategory: [...byCategory.entries()].map(([category, monthly]) => ({ category, monthly })).sort((a, b) => b.monthly - a.monthly),
  };
}
