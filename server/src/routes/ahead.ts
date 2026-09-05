import { Router } from "express";
import { Task } from "../models/Task";
import { Goal2 } from "../models/Goal2";
import { WorkoutSession, isRestType } from "../models/WorkoutSession";
import { periodBounds, type Horizon } from "../lib/goal-periods";
import { subscriptionsSummary } from "../lib/subscriptions";
import { kitchenSummary } from "../lib/kitchen-summary";
import { loadSettings, moduleOn } from "../models/Settings";
import { parseDayUTC } from "../lib/validation";

const router = Router();

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayFrom = (v: unknown) => iso(parseDayUTC(v) ?? new Date());

/**
 * What is coming.
 *
 * Every module in this app knows something about the future and none of it ever
 * reached one place: subscriptions know their next charge, goals know when their
 * period ends, tasks know what is scheduled and what was left behind, the workout log
 * knows the planned session, the kitchen knows what has run out. The app was very
 * good at recording the past and silent about the next seven days.
 *
 * Nothing here is stored. It reads what each feature already computes, so an entry
 * cannot disagree with the page it came from.
 */
export type AheadItem = {
  /** The day it lands on, or null for something that is simply true now. */
  date: string | null;
  /** Wall clock, when the thing has one. */
  time: string | null;
  kind: "task" | "overdue" | "subscription" | "goal" | "workout" | "kitchen";
  title: string;
  detail: string;
  url: string;
  /** Days from today. Negative means it is already behind. */
  daysAway: number | null;
};

router.get("/", async (req, res) => {
  const todayIso = todayFrom(req.query.today);
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
  const horizon = iso(new Date(Date.parse(todayIso + "T00:00:00Z") + days * DAY));
  const settings = await loadSettings();
  const items: AheadItem[] = [];

  const daysAway = (date: string) => Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / DAY);

  if (moduleOn(settings, "tasks")) {
    const scheduled = await Task.find({
      done: false,
      isDefault: false,
      date: { $gte: new Date(todayIso + "T00:00:00Z"), $lte: new Date(horizon + "T00:00:00Z") },
    }).sort({ date: 1 });

    for (const task of scheduled) {
      items.push({
        date: iso(task.date),
        time: task.time ?? null,
        kind: "task",
        title: task.title,
        detail: task.time ? `at ${task.time}` : "",
        url: "/today",
        daysAway: daysAway(iso(task.date)),
      });
    }

    // Behind rather than ahead, but it belongs in the same glance.
    const behind = await Task.countDocuments({ done: false, isDefault: false, date: { $lt: new Date(todayIso + "T00:00:00Z") } });
    if (behind > 0) {
      items.push({
        date: null,
        time: null,
        kind: "overdue",
        title: `${behind} task${behind === 1 ? "" : "s"} left behind`,
        detail: "From earlier days",
        url: "/today",
        daysAway: -1,
      });
    }
  }

  if (moduleOn(settings, "payments")) {
    const subs = await subscriptionsSummary(todayIso, days);
    for (const sub of [...subs.owing, ...subs.upcoming]) {
      items.push({
        date: sub.nextDue,
        time: null,
        kind: "subscription",
        title: sub.name,
        detail: `${Math.round(sub.price)} from ${sub.sourceNameSnapshot}`,
        url: "/payments",
        daysAway: sub.daysUntil,
      });
    }
  }

  if (moduleOn(settings, "goals")) {
    for (const goal of await Goal2.find({ status: "active" })) {
      const range = goal.startDate && goal.endDate ? { start: iso(goal.startDate), end: iso(goal.endDate) } : null;
      const bounds = periodBounds(goal.horizon as Horizon, goal.periodKey ?? null, range);
      if (!bounds || bounds.end > horizon || bounds.end < todayIso) continue;
      items.push({
        date: bounds.end,
        time: null,
        kind: "goal",
        title: goal.title,
        detail: "Period ends",
        url: `/goals/${String(goal._id)}`,
        daysAway: daysAway(bounds.end),
      });
    }
  }

  if (moduleOn(settings, "workout")) {
    const sessions = await WorkoutSession.find({
      date: { $gte: new Date(todayIso + "T00:00:00Z"), $lte: new Date(horizon + "T00:00:00Z") },
      completedAt: null,
    }).sort({ date: 1 });
    for (const session of sessions) {
      if (isRestType(session.type)) continue;
      items.push({
        date: iso(session.date),
        time: null,
        kind: "workout",
        title: "Training",
        detail: session.type,
        url: "/workout",
        daysAway: daysAway(iso(session.date)),
      });
    }
  }

  if (moduleOn(settings, "kitchen")) {
    const kitchen = await kitchenSummary(20);
    const outstanding = kitchen.items.filter((line) => !line.done);
    if (outstanding.length > 0) {
      items.push({
        date: null,
        time: null,
        kind: "kitchen",
        title: `${outstanding.length} thing${outstanding.length === 1 ? "" : "s"} to buy`,
        detail: outstanding
          .slice(0, 3)
          .map((line) => line.label)
          .join(", "),
        url: "/kitchen",
        daysAway: null,
      });
    }
  }

  /**
   * Overdue first, then by day, then by time within a day, then by kind.
   *
   * Something with no date is a standing fact rather than an event, so it sorts after
   * everything that actually happens on a day.
   */
  items.sort((a, b) => {
    if ((a.daysAway ?? 0) < 0 && (b.daysAway ?? 0) >= 0) return -1;
    if ((b.daysAway ?? 0) < 0 && (a.daysAway ?? 0) >= 0) return 1;
    if (a.date === null && b.date !== null) return 1;
    if (b.date === null && a.date !== null) return -1;
    if (a.date !== b.date) return (a.date ?? "").localeCompare(b.date ?? "");
    if (a.time !== b.time) return (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
    return a.kind.localeCompare(b.kind);
  });

  res.json({ today: todayIso, days, items });
});

export default router;
