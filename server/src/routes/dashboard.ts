import { Router } from "express";
import { DashboardTracker, DASHBOARD_TRACKER_KINDS } from "../models/DashboardTracker";
import { monthRange, toDayUTC } from "../lib/dates";

const router = Router();

const CALORIES_TARGET = 2000;
const PROTEIN_TARGET = 160;
const WATER_TARGET_ML = 3500;
const STEPS_TARGET = 7000;
const WORK_WEEKLY_MONEY_TARGET = 200;
const WORK_DAY_MONEY_TARGET = 40;
const GYM_MONTHLY_TARGET = 20;
const JULY_2026_GYM_TARGET = 10;
const ENGLISH_MONTHLY_TARGET = 20;
const NUTRITION_MONTHLY_TARGET = 26;
const PROJECT_MONTHLY_TARGET = 25;
const MIN_TRACKER_YEAR = 2026;
const MIN_TRACKER_MONTH = 7;
const JULY_2026_START_DAY = 13;

const julyHabitKinds = ["wake", "sleep", "gym", "reading", "english", "planning", "tasks", "projects", "focus", "vitamins", "steps", "work", "calories", "protein", "water"] as const;
const standardHabitKinds = ["wake", "sleep", "gym", "reading", "english", "planning", "tasks", "projectGym", "projectMedical", "focus", "vitamins", "steps", "work", "calories", "protein", "water"] as const;
type HabitKind = (typeof julyHabitKinds)[number] | (typeof standardHabitKinds)[number];

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

function gymTargetForMonth(year: number, month: number) {
  return year === 2026 && month === 7 ? JULY_2026_GYM_TARGET : GYM_MONTHLY_TARGET;
}

function habitKindsForMonth(year: number, month: number) {
  return year === 2026 && month === 7 ? julyHabitKinds : standardHabitKinds;
}

function checkRowTarget(kind: HabitKind, year: number, month: number, activeDayCount: number) {
  if (kind === "gym") return gymTargetForMonth(year, month);
  if (kind === "english") return ENGLISH_MONTHLY_TARGET;
  if (year === 2026 && month === 7) return activeDayCount;
  if (kind === "focus") return ENGLISH_MONTHLY_TARGET;
  if (kind === "projectGym" || kind === "projectMedical") return PROJECT_MONTHLY_TARGET;
  if (kind === "water" || kind === "protein" || kind === "calories") return NUTRITION_MONTHLY_TARGET;
  return activeDayCount;
}

function habitLabel(kind: HabitKind) {
  const labels: Record<HabitKind, string> = {
    wake: "Wake before 9",
    sleep: "Sleep 6-8h",
    gym: "GYM",
    reading: "Reading",
    english: "English",
    planning: "Quran",
    tasks: "Tasks",
    projects: "Projects",
    projectGym: "Project GYM",
    projectMedical: "Project Medical",
    focus: "Learning",
    vitamins: "Vitamins",
    steps: "7k Steps",
    work: "Work",
    calories: "Calories Target",
    protein: "Protein 160g+",
    water: "Water 3.5L",
  };
  return labels[kind];
}

function habitDescription(kind: HabitKind) {
  const descriptions: Record<HabitKind, string> = {
    wake: "Start the day before 9:00",
    sleep: "Hit the 6-8 hour sleep range",
    gym: "Training days logged from workouts or manually checked",
    reading: "Read or learn intentionally",
    english: "English study or practice",
    planning: "Read one page daily",
    tasks: "Finish the daily task list",
    projects: "Move at least one meaningful project forward",
    projectGym: "Work on Project GYM",
    projectMedical: "Work on Project Medical",
    focus: "Daily focused learning session",
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
    wake: "alarm-clock",
    sleep: "moon",
    gym: "dumbbell",
    reading: "book-open",
    english: "languages",
    planning: "calendar-check",
    tasks: "list-checks",
    projects: "folder-kanban",
    projectGym: "dumbbell",
    projectMedical: "folder-kanban",
    focus: "brain",
    vitamins: "pill",
    steps: "footprints",
    work: "briefcase-business",
    calories: "flame",
    protein: "beef",
    water: "droplet",
  };
  return icons[kind];
}

function makeCheckRow(kind: HabitKind, days: Day[], cells: DailyCell[], monthlyGoal = days.length, allowOverGoal = false): TrackerRow {
  const doneCount = cells.filter((cell) => cell.editable && cell.completed).length;
  return {
    id: kind,
    label: habitLabel(kind),
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
  const rangeStart = year === MIN_TRACKER_YEAR && month === MIN_TRACKER_MONTH ? new Date(Date.UTC(year, month - 1, JULY_2026_START_DAY)) : monthStart;
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

  const trackerDocs = await DashboardTracker.find({ date: { $gte: rangeStart, $lt: monthEnd } });

  const trackerByKindDay = new Map<string, (typeof trackerDocs)[number]>();
  for (const doc of trackerDocs) trackerByKindDay.set(`${doc.kind}:${iso(doc.date)}`, doc);

  const manualRows = habitKindsForMonth(year, month).map((kind) => {
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
          target: STEPS_TARGET,
          detail: day.active ? (state === "excused" ? "Intentional skip" : value ? `${Math.round(value).toLocaleString("en-US")} steps` : "Log steps") : "Prefilled warm-up day",
        };
      });
      const actual = Math.round(cells.reduce((sum, cell) => sum + (cell.editable ? cell.value ?? 0 : 0), 0));
      const goal = activeDays.length * STEPS_TARGET;
      const doneCount = cells.filter((cell) => cell.editable && cell.checked).length;
      return {
        id: kind,
        label: habitLabel(kind),
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
      const workGoal = activeDays.filter((day) => !day.weekend).length * WORK_DAY_MONEY_TARGET;
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
          target: WORK_DAY_MONEY_TARGET,
          weekend: day.weekend,
          state,
          detail: day.active ? (state === "excused" ? "Intentional skip. Add money if you worked." : amount ? `$${amount}` : day.weekend ? "Weekend auto-checked. Add money if you worked." : "Log money") : "Prefilled warm-up day",
        };
      });
      const actual = Math.round(cells.reduce((sum, cell) => sum + (cell.editable ? cell.amount : 0), 0) * 100) / 100;
      return {
        id: kind,
        label: habitLabel(kind),
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
      const state = day.active ? trackerState(doc, Boolean(doc?.checked)) : "done";
      return {
        date: day.iso,
        checked: dailySatisfied(state),
        completed: day.active ? state === "done" : true,
        editable: day.active,
        state,
        detail: day.active ? (state === "excused" ? "Intentional skip" : null) : "Prefilled warm-up day",
      };
    });
    return makeCheckRow(kind, days, cells, checkRowTarget(kind, year, month, activeDays.length), kind === "gym");
  });

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
      calories: CALORIES_TARGET,
      protein: PROTEIN_TARGET,
      waterMl: WATER_TARGET_ML,
      steps: STEPS_TARGET,
      workWeeklyMoney: WORK_WEEKLY_MONEY_TARGET,
      workDayMoney: WORK_DAY_MONEY_TARGET,
      gymMonthlyDays: gymTargetForMonth(year, month),
      englishMonthlyDays: ENGLISH_MONTHLY_TARGET,
      learningMonthlyDays: year === 2026 && month === 7 ? activeDays.length : ENGLISH_MONTHLY_TARGET,
      projectMonthlyDays: year === 2026 && month === 7 ? activeDays.length : PROJECT_MONTHLY_TARGET,
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
    rows,
  });
});

router.put("/tracker/:kind/:date", async (req, res) => {
  const kind = req.params.kind;
  if (!DASHBOARD_TRACKER_KINDS.includes(kind as (typeof DASHBOARD_TRACKER_KINDS)[number])) {
    return res.status(400).json({ error: "Invalid tracker kind" });
  }

  const date = toDayUTC(req.params.date);
  const checked = Boolean(req.body.checked);
  const stateInput = req.body.state;
  const state = stateInput === "done" || stateInput === "excused" ? stateInput : checked ? "done" : null;
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
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json(doc);
});

export default router;
