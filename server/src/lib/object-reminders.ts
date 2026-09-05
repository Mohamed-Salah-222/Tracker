import { Task } from "../models/Task";
import { Goal2 } from "../models/Goal2";
import { periodBounds, type Horizon } from "./goal-periods";
import { subscriptionsSummary } from "./subscriptions";
import { kitchenSummary } from "./kitchen-summary";
import { loadSettings } from "../models/Settings";

/**
 * Reminders that belong to a thing rather than to a schedule.
 *
 * The reminders in lib/reminder-runner.ts are schedule-shaped: a time, some days, and
 * a habit to check. They answer "nudge me about my routine". They cannot answer "tell
 * me about this task on Thursday at three", which is the other half of what a reminder
 * is for, and the half people actually mean.
 *
 * So this is object-shaped. The reminder lives on the record: set it on a task and it
 * is a field of that task. Delete the task and the reminder goes with it, with nothing
 * to reconcile and no orphan row left pointing at something that no longer exists.
 *
 * Adding a new kind is one entry in SOURCES.
 */
export type DueReminder = {
  /** Unique per record, so one thing cannot be announced twice in a pass. */
  key: string;
  title: string;
  body: string;
  url: string;
  /**
   * True when you asked for this exact reminder at this exact moment, rather than the
   * app working out for itself that you might want to know. Quiet hours hold the
   * worked-out ones and let the asked-for ones through, and only the worked-out ones
   * are ever collapsed into a digest.
   */
  explicit: boolean;
  /** Called once the push has gone out, so it does not go out again. */
  markSent: () => Promise<void>;
};

export type ReminderSource = {
  key: string;
  label: string;
  /** Everything overdue to be announced as of `now`. */
  due: (now: Date) => Promise<DueReminder[]>;
};


/**
 * Reminders nobody configured.
 *
 * The best nudge is one you never set up. The app already knows a great deal about
 * what is coming and says none of it: subscriptions compute their next charge, goals
 * carry an end date, the kitchen knows what is below its restock line, tasks know what
 * is overdue. All of that pointed forward in time and never reached you.
 *
 * These read that existing knowledge rather than storing anything of their own. Each
 * class is a switch in settings, and each fires at most once a day per subject, which
 * is what the sentOn key below is for.
 */
const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Which derived nudges have already gone out today.
 *
 * Kept in the usage log's sibling collection rather than a new one: it is a set of
 * short-lived keys, not a record worth keeping, and the TTL sweeps it.
 */
const sentToday = new Map<string, string>();

function alreadySent(key: string, todayIso: string): boolean {
  return sentToday.get(key) === todayIso;
}

function markSentToday(key: string, todayIso: string): void {
  sentToday.set(key, todayIso);
  // The map only ever holds today and yesterday, so it cannot grow.
  for (const [k, day] of sentToday) if (day !== todayIso) sentToday.delete(k);
}

/** Builds one entry, wired to the day-level dedupe above. */
function derived(key: string, todayIso: string, title: string, body: string, url: string): DueReminder {
  return {
    key,
    title,
    body,
    url,
    explicit: false,
    markSent: async () => markSentToday(key, todayIso),
  };
}

export const SOURCES: ReminderSource[] = [
  {
    key: "task",
    label: "Tasks with a reminder set",
    async due(now) {
      /**
       * Anything whose moment has passed and that has not been announced.
       *
       * Late rather than never: a server that was asleep at the minute still sends
       * when it wakes, because a reminder about a task you have not done yet is
       * useful an hour late and useless never.
       */
      const tasks = await Task.find({ remindAt: { $ne: null, $lte: now }, remindedAt: null, done: false });
      return tasks.map((task) => ({
        key: `task:${String(task._id)}`,
        title: task.title,
        body: task.time ? `Due at ${task.time}` : "On your list for today",
        url: "/today",
        explicit: true,
        markSent: async () => {
          task.remindedAt = new Date();
          await task.save();
        },
      }));
    },
  },

  {
    key: "subscription",
    label: "A subscription about to be charged",
    async due(now) {
      const settings = await loadSettings();
      if (settings.modules.payments === false || settings.autoReminders.subscription === false) return [];

      const todayIso = iso(now);
      const summary = await subscriptionsSummary(todayIso, 3);
      const out: DueReminder[] = [];

      for (const sub of [...summary.owing, ...summary.upcoming]) {
        // Two days of warning: enough to move money, not so much that it is noise.
        if (sub.daysUntil > 2) continue;
        const key = `subscription:${sub._id}:${sub.nextDue}`;
        if (alreadySent(key, todayIso)) continue;
        const when = sub.daysUntil < 0 ? `${Math.abs(sub.daysUntil)} days late` : sub.daysUntil === 0 ? "today" : sub.daysUntil === 1 ? "tomorrow" : `in ${sub.daysUntil} days`;
        out.push(derived(key, todayIso, `${sub.name} is due ${when}`, `${Math.round(sub.price)} from ${sub.sourceNameSnapshot}`, "/payments"));
      }
      return out;
    },
  },
  {
    key: "goal",
    label: "A goal running out of time",
    async due(now) {
      const settings = await loadSettings();
      if (settings.modules.goals === false || settings.autoReminders.goal === false) return [];

      const todayIso = iso(now);
      const goals = await Goal2.find({ status: "active" });
      const out: DueReminder[] = [];

      for (const goal of goals) {
        const range = goal.startDate && goal.endDate ? { start: iso(goal.startDate), end: iso(goal.endDate) } : null;
        const bounds = periodBounds(goal.horizon as Horizon, goal.periodKey ?? null, range);
        if (!bounds) continue; // An open-ended goal has no deadline to warn about.
        const daysLeft = Math.round((Date.parse(bounds.end + "T00:00:00Z") - Date.parse(todayIso + "T00:00:00Z")) / DAY_MS);
        if (daysLeft < 0 || daysLeft > 3) continue;

        const key = `goal:${String(goal._id)}:${bounds.end}`;
        if (alreadySent(key, todayIso)) continue;
        const when = daysLeft === 0 ? "ends today" : daysLeft === 1 ? "ends tomorrow" : `ends in ${daysLeft} days`;
        out.push(derived(key, todayIso, `${goal.title} ${when}`, "Worth a last checkpoint either way.", `/goals/${String(goal._id)}`));
      }
      return out;
    },
  },
  {
    key: "kitchen",
    label: "Things to buy",
    async due(now) {
      const settings = await loadSettings();
      if (settings.modules.kitchen === false || settings.autoReminders.kitchen === false) return [];

      const todayIso = iso(now);
      const key = `kitchen:${todayIso}`;
      if (alreadySent(key, todayIso)) return [];

      // toBuy is the count; items holds the lines behind it, both already derived
      // by the same summary the Kitchen page and the dashboard read.
      const summary = await kitchenSummary(20);
      const outstanding = summary.items.filter((line) => !line.done);
      // One nudge for the whole list. A notification per tomato is not a reminder.
      if (outstanding.length < 3) return [];

      const names = outstanding.slice(0, 3).map((line) => line.label);
      const rest = outstanding.length - names.length;
      return [derived(key, todayIso, `${outstanding.length} things to buy`, names.join(", ") + (rest > 0 ? ` and ${rest} more` : ""), "/kitchen")];
    },
  },
  {
    key: "overdue",
    label: "Tasks left behind",
    async due(now) {
      const settings = await loadSettings();
      if (settings.modules.tasks === false || settings.autoReminders.overdue === false) return [];

      const todayIso = iso(now);
      const key = `overdue:${todayIso}`;
      if (alreadySent(key, todayIso)) return [];

      const overdue = await Task.countDocuments({ done: false, isDefault: false, date: { $lt: new Date(todayIso + "T00:00:00Z") } });
      if (overdue < 3) return [];
      return [derived(key, todayIso, `${overdue} tasks left behind`, "Move them to today or let them go.", "/today")];
    },
  },
];

/** Everything, from every source, that should go out now. */
export async function dueObjectReminders(now = new Date()): Promise<DueReminder[]> {
  const found: DueReminder[] = [];
  for (const source of SOURCES) {
    try {
      found.push(...(await source.due(now)));
    } catch {
      // One source failing must not silence the others.
    }
  }
  return found;
}
