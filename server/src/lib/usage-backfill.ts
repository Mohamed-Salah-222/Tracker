import { UsageDay } from "../models/UsageDay";
import { DashboardTracker } from "../models/DashboardTracker";
import { CalorieEntry } from "../models/CalorieEntry";
import { WaterEntry } from "../models/WaterEntry";
import { Task } from "../models/Task";
import { WorkoutSession } from "../models/WorkoutSession";
import { SetLog } from "../models/SetLog";
import { Expense } from "../models/Expense";
import { MoneyMovement } from "../models/MoneyMovement";
import { WeightEntry } from "../models/WeightEntry";

/**
 * Give the streak the history it already earned.
 *
 * The usage log started the day it was written, so without this a tracker used every
 * day since July would show a streak of one, and the five year badge would be five
 * years away from today rather than from when the habit actually started.
 *
 * The signal is `createdAt`, not the `date` field on the record. A calorie entry dated
 * yesterday but written today is evidence the app was used today; the day the food was
 * eaten says nothing about when anybody opened anything.
 *
 * Two caveats, stated rather than hidden:
 *  - createdAt is an instant, so it is bucketed by UTC day. Something logged after
 *    01:00 Cairo lands on the previous day. Over a backfill of past months that is
 *    close enough; from here on the client sends its real local date.
 *  - Rows written by seeds and migrations rather than by a person are excluded, since
 *    they would mark days the app was never opened.
 */
const SOURCES = [
  { model: DashboardTracker, area: "dashboard" },
  { model: CalorieEntry, area: "calories" },
  { model: WaterEntry, area: "calories" },
  { model: Task, area: "tasks" },
  { model: WorkoutSession, area: "workout" },
  { model: SetLog, area: "workout" },
  { model: Expense, area: "payments" },
  { model: MoneyMovement, area: "payments" },
  { model: WeightEntry, area: "body" },
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);

let done = false;

export async function backfillUsage(): Promise<{ ran: boolean; days: number }> {
  if (done) return { ran: false, days: 0 };
  done = true;

  // Only ever runs against an empty log. Once a day has been lived through, the
  // record of it is better than anything this could reconstruct.
  if ((await UsageDay.countDocuments()) > 0) return { ran: false, days: 0 };

  const byDay = new Map<string, Set<string>>();
  for (const { model, area } of SOURCES) {
    const rows = await (model as { find: (q: object) => { select: (s: object) => Promise<{ createdAt?: Date }[]> } })
      .find({})
      .select({ createdAt: 1 });
    for (const row of rows) {
      if (!row.createdAt) continue;
      const day = iso(row.createdAt);
      const areas = byDay.get(day) ?? new Set<string>();
      areas.add(area);
      byDay.set(day, areas);
    }
  }

  if (byDay.size === 0) return { ran: false, days: 0 };

  await UsageDay.insertMany(
    [...byDay.entries()].map(([day, areas]) => ({
      date: new Date(day + "T00:00:00Z"),
      actions: areas.size,
      areas: [...areas],
      backfilled: true,
    })),
    { ordered: false },
  );

  return { ran: true, days: byDay.size };
}
