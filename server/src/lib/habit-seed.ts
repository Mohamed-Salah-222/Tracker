// One-time move from hardcoded habits to rows.
//
// Everything below used to live as an enum plus habitLabel/habitDescription/habitIcon
// maps plus DEFAULT_MONTHLY. The values are copied across verbatim so the month reads
// exactly the same the first time this runs.
import { Habit } from "../models/Habit";
import { DashboardTracker } from "../models/DashboardTracker";
import { TrackerGoals } from "../models/TrackerGoals";

type Seed = {
  key: string;
  label: string;
  description: string;
  icon: string;
  type: "check" | "count";
  dailyTarget?: number;
  unit?: string;
  monthlyTarget: number;
  onHabitsPage: boolean;
  derivedFrom?: "workout" | "tasks" | "calories" | "protein" | "water" | "sleep";
};

/**
 * `projectMedical` was Prayer and `projectGym` was Books, keys left over from when
 * those slots meant something else. Both carry months of history, so the rows are
 * renamed rather than abandoned.
 */
export const LEGACY_KEY_RENAMES: Record<string, string> = { projectMedical: "prayer", projectGym: "books" };

const SEEDS: Seed[] = [
  { key: "sleep", label: "Sleep", description: "A night inside your sleep range, from the sleep log", icon: "moon", type: "check", monthlyTarget: 0, onHabitsPage: true, derivedFrom: "sleep" },
  { key: "vitamins", label: "Vitamins", description: "Daily vitamins taken", icon: "pill", type: "check", monthlyTarget: 0, onHabitsPage: true },
  { key: "prayer", label: "Prayer", description: "Prayers kept for the day", icon: "hands", type: "check", monthlyTarget: 0, onHabitsPage: true },
  { key: "books", label: "Books", description: "Read something today", icon: "book-open", type: "check", monthlyTarget: 25, onHabitsPage: true },
  { key: "projects", label: "Projects", description: "Moved a project forward", icon: "folder-kanban", type: "check", monthlyTarget: 25, onHabitsPage: true },
  { key: "english", label: "English", description: "English study or practice", icon: "languages", type: "check", monthlyTarget: 20, onHabitsPage: true },
  { key: "steps", label: "Steps", description: "Walk the daily step target", icon: "footprints", type: "count", dailyTarget: 10000, unit: "steps", monthlyTarget: 0, onHabitsPage: true },

  // Written by other features. Locked: deleting one would orphan the page that feeds it.
  { key: "gym", label: "GYM", description: "Training days logged from workouts or manually checked", icon: "dumbbell", type: "check", monthlyTarget: 20, onHabitsPage: false, derivedFrom: "workout" },
  { key: "tasks", label: "Tasks", description: "Everything planned for the day finished", icon: "list-checks", type: "check", monthlyTarget: 0, onHabitsPage: false, derivedFrom: "tasks" },
  { key: "calories", label: "Calories Target", description: "Stay inside the daily calorie target", icon: "flame", type: "check", monthlyTarget: 26, onHabitsPage: false, derivedFrom: "calories" },
  { key: "protein", label: "Protein", description: "Hit the daily protein floor", icon: "beef", type: "check", monthlyTarget: 26, onHabitsPage: false, derivedFrom: "protein" },
  { key: "water", label: "Water", description: "Hit the daily water target", icon: "droplet", type: "check", monthlyTarget: 26, onHabitsPage: false, derivedFrom: "water" },

  { key: "work", label: "Work", description: "Money earned that day", icon: "briefcase", type: "check", monthlyTarget: 0, onHabitsPage: false },
];

/**
 * Move a habit's history onto a new key, one row at a time.
 *
 * A blanket updateMany dies on the unique (kind, date) index the moment a single row
 * already exists under the target name, and leaves the rename half applied. Some of
 * these target names do already exist: "books" and "prayers" were created by mistake
 * in an earlier session and hold a handful of empty rows.
 *
 * So each day is merged rather than moved: an empty row on either side loses to one
 * that actually records something.
 */
async function renameKind(from: string, to: string): Promise<void> {
  const sources = await DashboardTracker.find({ kind: from });
  for (const source of sources) {
    const target = await DashboardTracker.findOne({ kind: to, date: source.date });
    if (!target) {
      source.kind = to;
      await source.save();
      continue;
    }
    const holdsSomething = (row: typeof source) => row.state !== null || (row.note ?? "") !== "" || (row.amount ?? 0) > 0;
    if (holdsSomething(target) || !holdsSomething(source)) {
      // The target is the better record, or both are blank: drop the duplicate.
      await DashboardTracker.deleteOne({ _id: source._id });
      continue;
    }
    await DashboardTracker.deleteOne({ _id: target._id });
    source.kind = to;
    await source.save();
  }
}

/**
 * Changes to habits that already exist.
 *
 * The seed above only ever runs against an empty collection, so a habit that gains a
 * source later would never pick it up on a database that has been running for months.
 * Each step states the condition it repairs and is safe to run on every boot.
 */
async function patchExisting(): Promise<void> {
  // Sleep became a duration rather than a tick, so the row is now fed by the log.
  const sleep = await Habit.findOne({ key: "sleep" });
  if (sleep && !sleep.derivedFrom) {
    sleep.derivedFrom = "sleep";
    if (sleep.label === "Sleep 6-8h") sleep.label = "Sleep";
    sleep.description = "A night inside your sleep range, from the sleep log";
    await sleep.save();
  }
}

let done = false;

/** Idempotent, and cheap enough to call on any request that needs the definitions. */
export async function ensureHabits(): Promise<void> {
  if (done) return;
  if ((await Habit.countDocuments()) > 0) {
    await patchExisting();
    done = true;
    return;
  }

  // History first: the rows have to answer to the new keys before anything reads them.
  for (const [from, to] of Object.entries(LEGACY_KEY_RENAMES)) await renameKind(from, to);

  const goals = await TrackerGoals.findOne();
  const monthly = goals?.monthlyByKind ?? new Map<string, number>();

  await Habit.insertMany(
    SEEDS.map((s, index) => ({
      ...s,
      // A target already set by hand outranks the seeded default.
      monthlyTarget: monthly.get(s.key) ?? monthly.get(Object.keys(LEGACY_KEY_RENAMES).find((k) => LEGACY_KEY_RENAMES[k] === s.key) ?? "") ?? s.monthlyTarget,
      order: index,
      derivedFrom: s.derivedFrom ?? null,
    })),
  );
  done = true;
}
