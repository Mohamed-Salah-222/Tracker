import { Router } from "express";
import { DashboardTracker, DASHBOARD_TRACKER_KINDS, HABIT_PAGE_KINDS } from "../models/DashboardTracker";
import { WorkoutSession, normalizeWorkoutType } from "../models/WorkoutSession";
import { Task } from "../models/Task";
import { KitchenItem, kitchenStatus } from "../models/KitchenItem";
import { DEFAULT_MONTHLY, TrackerGoals, loadTrackerGoals, type TrackerGoalValues } from "../models/TrackerGoals";
import { monthRange, toDayUTC } from "../lib/dates";
import { isNonNegativeNumber, parseDayUTC } from "../lib/validation";

const router = Router();

// Targets now live in the TrackerGoals singleton so they can be edited from the
// dashboard. WORK_WEEKLY_MONEY_TARGET is derived from the daily figure.
const MIN_TRACKER_YEAR = 2026;
const MIN_TRACKER_MONTH = 8;

const standardHabitKinds = ["sleep", "tasks", "projectMedical", "vitamins", "calories", "protein", "water", "projects", "projectGym", "gym", "english", "steps", "work"] as const;
type HabitKind = (typeof standardHabitKinds)[number];

type Day = {
  iso: string;
  label: string;
  day: number;
  weekend: boolean;
  week: number;
  active: boolean;
};

type DailyCell = {
  date: string;
  checked: boolean;
  completed: boolean;
  editable: boolean;
  state?: "done" | "excused" | null;
  detail?: string | null;
  /** What the user wrote about that day, from the Habits page or the grid. */
  note?: string;
  value?: number;
  target?: number;
};

type AmountCell = {
  date: string;
  amount: number;
  checked: boolean;
  completed: boolean;
  editable: boolean;
  target: number;
  weekend: boolean;
  state?: "done" | "excused" | null;
  detail?: string | null;
};

type TrackerRow = {
  id: string;
  label: string;
  description: string;
  icon: string;
  kind: "daily-check" | "target-count" | "steps-count" | "work-money";
  percent: number;
  goal: number;
  actual: number;
  left: number;
  doneCount?: number;
  cells: DailyCell[] | AmountCell[];
};

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthFromQuery(input: unknown) {
  const fallback = toDayUTC(new Date());
  if (typeof input !== "string" || !/^\d{4}-\d{2}$/.test(input)) {
    const fallbackYear = fallback.getUTCFullYear();
    const fallbackMonth = fallback.getUTCMonth() + 1;
    if (fallbackYear < MIN_TRACKER_YEAR || (fallbackYear === MIN_TRACKER_YEAR && fallbackMonth < MIN_TRACKER_MONTH)) {
      return { year: MIN_TRACKER_YEAR, month: MIN_TRACKER_MONTH };
    }
    return { year: fallbackYear, month: fallbackMonth };
  }
  const [year, month] = input.split("-").map(Number);
  if (month < 1 || month > 12) return { year: MIN_TRACKER_YEAR, month: MIN_TRACKER_MONTH };
  if (year < MIN_TRACKER_YEAR || (year === MIN_TRACKER_YEAR && month < MIN_TRACKER_MONTH)) {
    return { year: MIN_TRACKER_YEAR, month: MIN_TRACKER_MONTH };
  }
  return { year, month };
}

function percent(actual: number, goal: number) {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((actual / goal) * 100));
}

function uncappedPercent(actual: number, goal: number) {
  if (goal <= 0) return 0;
  return Math.round((actual / goal) * 100);
}

function trackerState(doc: { checked: boolean; state?: "done" | "excused" | null } | undefined, completed: boolean) {
  if (doc?.state === "excused") return "excused";
  if (doc?.state === "done" || completed || doc?.checked) return "done";
  return null;
}

function dailySatisfied(state: "done" | "excused" | null) {
  return state === "done" || state === "excused";
}

function habitKindsForMonth() {
  return standardHabitKinds;
}

/** A kind with no configured monthly count means "every day of the month". */
function checkRowTarget(kind: HabitKind, activeDayCount: number, goals: TrackerGoalValues) {
  const configured = goals.monthlyByKind[kind];
  return typeof configured === "number" ? configured : activeDayCount;
}

function habitLabel(kind: HabitKind, goals: TrackerGoalValues) {
  const labels: Record<HabitKind, string> = {
    sleep: "Sleep 6-8h",
    gym: "GYM",
    english: "English",
    tasks: "Tasks",
    projects: "Projects",
    projectGym: "Books",
    projectMedical: "Prayer",
    vitamins: "Vitamins",
    steps: `${goals.stepsTarget / 1000}k Steps`,
    work: "Work",
    calories: "Calories Target",
    // Derived from the saved goals so the label and the target cannot drift apart.
    protein: `Protein ${goals.proteinTarget}g+`,
    water: `Water ${goals.waterTargetMl % 1000 === 0 ? goals.waterTargetMl / 1000 : (goals.waterTargetMl / 1000).toFixed(1)}L`,
  };
  return labels[kind];
}

function habitDescription(kind: HabitKind) {
  const descriptions: Record<HabitKind, string> = {
    sleep: "Hit the 6-8 hour sleep range",
    gym: "Training days logged from workouts or manually checked",
    english: "English study or practice",
    tasks: "Days where every planned task was finished",
    projects: "Move at least one meaningful project forward",
    projectGym: "Read something today",
    projectMedical: "Prayers kept up for the day",
    vitamins: "Take the daily stack",
    steps: "Monthly movement target, counted against 7k times active days",
    work: "Money made toward the monthly weekday target",
    calories: "Stay inside the daily calorie target",
    protein: "Hit the daily protein floor",
    water: "Hit the daily water target",
  };
  return descriptions[kind];
}

function habitIcon(kind: HabitKind) {
  const icons: Record<HabitKind, string> = {
    sleep: "moon",
    gym: "dumbbell",
    english: "languages",
    tasks: "list-checks",
    projects: "folder-kanban",
    projectGym: "book-open",
    projectMedical: "hands",
    vitamins: "pill",
    steps: "footprints",
    work: "briefcase-business",
    calories: "flame",
    protein: "beef",
    water: "droplet",
  };
  return icons[kind];
}

function makeCheckRow(kind: HabitKind, days: Day[], cells: DailyCell[], goals: TrackerGoalValues, monthlyGoal = days.length, allowOverGoal = false): TrackerRow {
  const doneCount = cells.filter((cell) => cell.editable && cell.completed).length;
  return {
    id: kind,
    label: habitLabel(kind, goals),
    description: habitDescription(kind),
    icon: habitIcon(kind),
    kind: kind === "gym" ? "target-count" : "daily-check",
    percent: allowOverGoal ? uncappedPercent(doneCount, monthlyGoal) : percent(doneCount, monthlyGoal),
    goal: monthlyGoal,
    actual: doneCount,
    left: Math.max(monthlyGoal - doneCount, 0),
    doneCount,
    cells,
  };
}

router.get("/", async (req, res) => {
  const { year, month } = monthFromQuery(req.query.month);
  const { start: monthStart, end: monthEnd } = monthRange(year, month);
  const rangeStart = monthStart;
  const today = iso(toDayUTC(new Date()));
  const days: Day[] = Array.from({ length: Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000) }, (_, index) => {
    const date = addDays(monthStart, index);
    return {
      iso: iso(date),
      label: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      day: date.getUTCDate(),
      weekend: date.getUTCDay() === 0 || date.getUTCDay() === 6,
      week: Math.floor(index / 7) + 1,
      active: date >= rangeStart,
    };
  });
  const activeDays = days.filter((day) => day.active);

  const goals = await loadTrackerGoals();

  const trackerDocs = await DashboardTracker.find({ date: { $gte: rangeStart, $lt: monthEnd } });

  const trackerByKindDay = new Map<string, (typeof trackerDocs)[number]>();
  for (const doc of trackerDocs) trackerByKindDay.set(`${doc.kind}:${iso(doc.date)}`, doc);

  // The GYM row mirrors the workout log: a finished session fills the cell in, a
  // rest day greys it out. A manual tracker doc still wins, so tapping the cell
  // yourself keeps working on days you trained without logging a session.
  const workoutSessions = await WorkoutSession.find({ date: { $gte: rangeStart, $lt: monthEnd } });
  const workoutByDay = new Map<string, (typeof workoutSessions)[number]>();
  for (const session of workoutSessions) workoutByDay.set(iso(session.date), session);

  // The TASKS row mirrors the task list the same way GYM mirrors the workout log:
  // clear every task on a day and the cell fills in by itself.
  const monthTasks = await Task.find({ date: { $gte: rangeStart, $lt: monthEnd } });
  const tasksByDay = new Map<string, { total: number; done: number }>();
  for (const task of monthTasks) {
    const key = iso(task.date);
    const entry = tasksByDay.get(key) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (task.done) entry.done += 1;
    tasksByDay.set(key, entry);
  }

  function tasksCellFromList(dayIso: string): { state: "done" | "excused" | null; detail: string } | null {
    const entry = tasksByDay.get(dayIso);
    if (!entry || entry.total === 0) return null; // nothing planned; leave it to the user
    if (entry.done === entry.total) {
      return { state: "done", detail: `All ${entry.total} task${entry.total === 1 ? "" : "s"} done` };
    }
    return { state: null, detail: `${entry.done}/${entry.total} tasks done` };
  }

  function gymCellFromWorkout(dayIso: string): { state: "done" | "excused" | null; detail: string } | null {
    const session = workoutByDay.get(dayIso);
    if (!session) return null;
    if (normalizeWorkoutType(session.type) === "rest") {
      return { state: "excused", detail: "Rest day from the workout log" };
    }
    if (session.completedAt) {
      return { state: "done", detail: "Session completed in the workout log" };
    }
    return { state: null, detail: "Session started but not finished" };
  }

  const manualRows = habitKindsForMonth().map((kind) => {
    if (kind === "steps") {
      const cells: DailyCell[] = days.map((day) => {
        const doc = trackerByKindDay.get(`${kind}:${day.iso}`);
        const value = doc?.amount ?? 0;
        const state = day.active ? trackerState(doc, value > 0) : "done";
        return {
          date: day.iso,
          checked: dailySatisfied(state),
          completed: day.active ? value > 0 : true,
          editable: day.active,
          state,
          value,
          target: goals.stepsTarget,
          detail: day.active ? (state === "excused" ? "Intentional skip" : value ? `${Math.round(value).toLocaleString("en-US")} steps` : "Log steps") : "Prefilled warm-up day",
        };
      });
      const actual = Math.round(cells.reduce((sum, cell) => sum + (cell.editable ? cell.value ?? 0 : 0), 0));
      const goal = activeDays.length * goals.stepsTarget;
      const doneCount = cells.filter((cell) => cell.editable && cell.checked).length;
      return {
        id: kind,
        label: habitLabel(kind, goals),
        description: habitDescription(kind),
        icon: habitIcon(kind),
        kind: "steps-count" as const,
        percent: uncappedPercent(actual, goal),
        goal,
        actual,
        left: Math.max(goal - actual, 0),
        doneCount,
        cells,
      };
    }

    if (kind === "work") {
      const workGoal = activeDays.filter((day) => !day.weekend).length * goals.workDayMoney;
      const cells: AmountCell[] = days.map((day) => {
        const doc = trackerByKindDay.get(`${kind}:${day.iso}`);
        const amount = doc?.amount ?? 0;
        const state = day.active ? (day.weekend && !doc ? "excused" : trackerState(doc, amount > 0)) : "done";
        const checked = day.active ? day.weekend || dailySatisfied(state) : true;
        return {
          date: day.iso,
          amount,
          checked,
          completed: day.active ? amount > 0 : true,
          editable: day.active,
          target: goals.workDayMoney,
          weekend: day.weekend,
          state,
          detail: day.active ? (state === "excused" ? "Intentional skip. Add money if you worked." : amount ? `$${amount}` : day.weekend ? "Weekend auto-checked. Add money if you worked." : "Log money") : "Prefilled warm-up day",
        };
      });
      const actual = Math.round(cells.reduce((sum, cell) => sum + (cell.editable ? cell.amount : 0), 0) * 100) / 100;
      return {
        id: kind,
        label: habitLabel(kind, goals),
        description: habitDescription(kind),
        icon: habitIcon(kind),
        kind: "work-money" as const,
        percent: uncappedPercent(actual, workGoal),
        goal: workGoal,
        actual,
        left: Math.max(workGoal - actual, 0),
        cells,
      };
    }

    const cells: DailyCell[] = days.map((day) => {
      const doc = trackerByKindDay.get(`${kind}:${day.iso}`);
      let state: "done" | "excused" | null = day.active ? trackerState(doc, Boolean(doc?.checked)) : "done";
      let detail: string | null = day.active ? (state === "excused" ? "Intentional skip" : null) : "Prefilled warm-up day";

      // A deliberate manual mark wins; a blank or cleared cell falls through to the
      // workout log. Checking only for the doc's existence was wrong: the tracker
      // upserts a row on every click, including clearing one, so days the user had
      // merely touched at some point could never be filled in by finishing a session.
      const manuallyMarked = Boolean(doc && (doc.state === "done" || doc.state === "excused" || doc.checked));

      if (day.active) {
        if (kind === "tasks") {
          // The task list is authoritative whenever the day has any tasks. Unlike GYM,
          // this binding has to stay live in both directions: finishing everything
          // ticks the day, and adding a task afterwards unticks it again. Honouring a
          // stale manual tick here would pin the cell permanently and break that.
          // Days with no tasks at all still fall back to manual marking.
          const derived = tasksCellFromList(day.iso);
          if (derived) {
            state = derived.state;
            detail = derived.detail;
          }
        } else if (kind === "gym" && !manuallyMarked) {
          const derived = gymCellFromWorkout(day.iso);
          if (derived) {
            state = derived.state;
            detail = derived.detail;
          }
        }
      }

      return {
        date: day.iso,
        checked: dailySatisfied(state),
        completed: day.active ? state === "done" : true,
        editable: day.active,
        state,
        detail,
        note: doc?.note ?? "",
      };
    });
    return makeCheckRow(kind, days, cells, goals, checkRowTarget(kind, activeDays.length, goals), kind === "gym");
  });

  // Shopping ring: what is at or below its restock line right now. Not month-scoped
  // like the habit rows — stock is a present-tense fact, not a daily history.
  const kitchenItems = await KitchenItem.find().sort({ count: 1, foodNameSnapshot: 1 });
  const needsRestock = kitchenItems.filter((i) => kitchenStatus(i.count, i.lowThreshold) !== "ok");
  const kitchen = {
    tracked: kitchenItems.length,
    out: needsRestock.filter((i) => i.count <= 0).length,
    low: needsRestock.filter((i) => i.count > 0).length,
    items: needsRestock.slice(0, 12).map((i) => ({
      id: String(i._id),
      name: i.foodNameSnapshot,
      count: i.count,
      lowThreshold: i.lowThreshold,
      status: kitchenStatus(i.count, i.lowThreshold),
    })),
  };

  const rows = manualRows;
  const primaryRows = rows;
  const totalGoal = primaryRows.reduce((sum, row) => sum + row.goal, 0);
  const totalActual = primaryRows.reduce((sum, row) => sum + Math.min(row.actual, row.goal), 0);
  const overallPercent = primaryRows.length ? Math.round(primaryRows.reduce((sum, row) => sum + Math.min(row.percent, 100), 0) / primaryRows.length) : 0;
  const completedRows = rows.filter((row) => row.percent >= 100).length;
  const misses = rows
    .filter((row) => row.left > 0)
    .map((row) => ({ id: row.id, label: row.label, left: row.left, percent: row.percent }))
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 5);
  const topHabits = rows
    .map((row) => ({ id: row.id, label: row.label, percent: row.percent, actual: row.actual, goal: row.goal }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 10);
  const dayProgress = days.map((day) => {
    const editableRows = primaryRows;
    const done = editableRows.reduce((sum, row) => {
      const cell = row.cells.find((candidate) => candidate.date === day.iso) as DailyCell | AmountCell | undefined;
      return sum + (cell?.editable && cell.checked ? 1 : 0);
    }, 0);
    return {
      date: day.iso,
      day: day.day,
      label: day.label,
      percent: day.active ? percent(done, editableRows.length) : 100,
    };
  });

  res.json({
    today,
    month: {
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      year,
      month,
      start: iso(rangeStart),
      end: iso(addDays(monthEnd, -1)),
      days,
    },
    targets: {
      calories: goals.caloriesTarget,
      protein: goals.proteinTarget,
      waterMl: goals.waterTargetMl,
      steps: goals.stepsTarget,
      workWeeklyMoney: goals.workDayMoney * 5,
      workDayMoney: goals.workDayMoney,
      gymMonthlyDays: checkRowTarget("gym", activeDays.length, goals),
      englishMonthlyDays: checkRowTarget("english", activeDays.length, goals),
      projectMonthlyDays: checkRowTarget("projects", activeDays.length, goals),
    },
    metrics: {
      overallPercent,
      completedRows,
      totalRows: rows.length,
      totalGoal,
      totalActual,
      goalsLeft: Math.max(totalGoal - totalActual, 0),
      gymCount: manualRows.find((row) => row.id === "gym")?.actual ?? 0,
      workHours: manualRows.find((row) => row.id === "work")?.actual ?? 0,
      misses,
      topHabits,
      dayProgress,
    },
    kitchen,
    rows,
  });
});

// =====================================================================
// GET /dashboard/goals   —   PATCH /dashboard/goals
// The targets every row is measured against. `monthlyByKind` holds "how many days
// this month"; a kind absent from it is measured against every day of the month.
// =====================================================================
const DAILY_GOAL_FIELDS = ["caloriesTarget", "proteinTarget", "waterTargetMl", "stepsTarget", "workDayMoney"] as const;

router.get("/goals", async (_req, res) => {
  const goals = await loadTrackerGoals();
  res.json({
    ...goals,
    // So the editor can list every row, not only the ones already customised.
    editableKinds: standardHabitKinds.filter((k) => k !== "steps" && k !== "work").map((kind) => ({
      kind,
      label: habitLabel(kind, goals),
      monthly: goals.monthlyByKind[kind] ?? null,
    })),
    defaults: DEFAULT_MONTHLY,
  });
});

router.patch("/goals", async (req, res) => {
  const doc = (await TrackerGoals.findOne()) ?? (await TrackerGoals.create({}));

  for (const field of DAILY_GOAL_FIELDS) {
    const value = req.body?.[field];
    if (value === undefined) continue;
    if (!isNonNegativeNumber(value)) return res.status(400).json({ error: `${field} must be a non-negative number` });
    doc.set(field, value);
  }

  const monthly = req.body?.monthlyByKind;
  if (monthly !== undefined) {
    if (typeof monthly !== "object" || monthly === null || Array.isArray(monthly)) {
      return res.status(400).json({ error: "monthlyByKind must be an object" });
    }
    for (const [kind, value] of Object.entries(monthly)) {
      if (!DASHBOARD_TRACKER_KINDS.includes(kind as (typeof DASHBOARD_TRACKER_KINDS)[number])) {
        return res.status(400).json({ error: `unknown tracker kind: ${kind}` });
      }
      // null clears the override, putting that row back to "every day of the month".
      if (value === null) {
        doc.monthlyByKind.delete(kind);
        continue;
      }
      if (typeof value !== "number" || !isNonNegativeNumber(value)) return res.status(400).json({ error: `${kind} must be a non-negative number` });
      doc.monthlyByKind.set(kind, value);
    }
  }

  await doc.save();
  res.json(await loadTrackerGoals());
});

// =====================================================================
// GET /dashboard/habits?date=YYYY-MM-DD
// The Habits page's day view. Reads the same DashboardTracker rows the monthly
// grid does, so a tick made here shows up there and the other way round.
// =====================================================================
router.get("/habits", async (req, res) => {
  const day = parseDayUTC(req.query.date);
  if (!day) return res.status(400).json({ error: "valid date required" });

  const goals = await loadTrackerGoals();
  const docs = await DashboardTracker.find({ kind: { $in: HABIT_PAGE_KINDS }, date: day });
  const byKind = new Map(docs.map((d) => [d.kind, d]));

  const items = HABIT_PAGE_KINDS.map((kind) => {
    const doc = byKind.get(kind);
    // Steps is a number you record, not a box you tick, so it reports its amount and
    // target and counts as done once the target is reached — same rule as the grid.
    const isCount = kind === "steps";
    const amount = doc?.amount ?? 0;
    const target = isCount ? goals.stepsTarget : 0;
    const state = isCount ? (doc?.state === "excused" ? "excused" : amount >= target && target > 0 ? "done" : null) : trackerState(doc, Boolean(doc?.checked));

    return {
      kind,
      label: habitLabel(kind, goals),
      description: habitDescription(kind),
      icon: habitIcon(kind),
      input: isCount ? ("count" as const) : ("check" as const),
      amount: isCount ? amount : null,
      target: isCount ? target : null,
      state,
      checked: dailySatisfied(state),
      note: doc?.note ?? "",
    };
  });

  res.json({
    date: iso(day),
    done: items.filter((i) => i.state === "done").length,
    skipped: items.filter((i) => i.state === "excused").length,
    total: items.length,
    items,
  });
});

router.put("/tracker/:kind/:date", async (req, res) => {
  const kind = req.params.kind;
  if (!DASHBOARD_TRACKER_KINDS.includes(kind as (typeof DASHBOARD_TRACKER_KINDS)[number])) {
    return res.status(400).json({ error: "Invalid tracker kind" });
  }

  const date = parseDayUTC(req.params.date);
  if (!date) return res.status(400).json({ error: "Invalid tracker date" });

  const checked = Boolean(req.body.checked);
  const stateInput = req.body.state;
  const state = stateInput === "done" || stateInput === "excused" ? stateInput : checked ? "done" : null;
  const noteInput = req.body.note;
  if (noteInput !== undefined && typeof noteInput !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }
  const amount = req.body.amount === null || req.body.amount === undefined || req.body.amount === "" ? null : Number(req.body.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  const doc = await DashboardTracker.findOneAndUpdate(
    { kind, date } as Record<string, unknown>,
    {
      $set: {
        checked: state === "done" || state === "excused",
        amount,
        state,
        // Only touched when supplied, so ticking a cell never wipes its note.
        ...(noteInput !== undefined ? { note: noteInput } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json(doc);
});

export default router;
