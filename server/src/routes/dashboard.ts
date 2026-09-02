import { Router } from "express";
import { DashboardTracker } from "../models/DashboardTracker";
import { Habit } from "../models/Habit";
import { ensureHabits } from "../lib/habit-seed";
import { WorkoutSession, normalizeWorkoutType } from "../models/WorkoutSession";
import { CalorieEntry } from "../models/CalorieEntry";
import { WaterEntry } from "../models/WaterEntry";
import { CheatDay } from "../models/CheatDay";
import { SleepEntry } from "../models/SleepEntry";
import { IncomeEntry } from "../models/IncomeEntry";
import { durationLabel, inBand } from "../lib/sleep";
import { caloriesHit, proteinHit, waterHit } from "../lib/daily-facts";
import { Task } from "../models/Task";
import { kitchenSummary } from "../lib/kitchen-summary";
import { DEFAULT_MONTHLY, TrackerGoals, loadTrackerGoals, type TrackerGoalValues } from "../models/TrackerGoals";
import { monthRange, toDayUTC } from "../lib/dates";
import { isNonNegativeNumber, parseDayUTC } from "../lib/validation";

const router = Router();

// Targets now live in the TrackerGoals singleton so they can be edited from the
// dashboard. WORK_WEEKLY_MONEY_TARGET is derived from the daily figure.
/**
 * The floor used to be hardcoded to August 2026 and any earlier month was silently
 * rewritten to it, so six weeks of real tracking, going back to 1 July, could not be
 * reached and the back button simply stopped. It is read off the data instead.
 */
let earliestMonthCache: { key: string; at: number } | null = null;

async function earliestTrackedMonth(): Promise<{ year: number; month: number }> {
  const now = Date.now();
  if (!earliestMonthCache || now - earliestMonthCache.at > 300_000) {
    const first = await DashboardTracker.findOne().sort({ date: 1 }).select({ date: 1 });
    const d = first?.date ?? new Date();
    earliestMonthCache = { key: `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`, at: now };
  }
  const [year, month] = earliestMonthCache.key.split("-").map(Number);
  return { year, month };
}

/** A habit definition as the routes need it. */
type HabitDef = {
  key: string;
  label: string;
  description: string;
  icon: string;
  type: "check" | "count";
  dailyTarget: number;
  unit: string;
  monthlyTarget: number;
  onHabitsPage: boolean;
  derivedFrom: string | null;
};

async function loadHabits(): Promise<HabitDef[]> {
  await ensureHabits();
  const docs = await Habit.find({ archived: false }).sort({ order: 1, label: 1 });
  return docs.map((d) => ({
    key: d.key,
    label: d.label,
    description: d.description,
    icon: d.icon,
    type: d.type,
    dailyTarget: d.dailyTarget,
    unit: d.unit,
    monthlyTarget: d.monthlyTarget,
    onHabitsPage: d.onHabitsPage,
    derivedFrom: d.derivedFrom ?? null,
  }));
}

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

/**
 * The caller's calendar day, not the server's.
 *
 * "Today" is a local idea and this file was deriving it from a UTC clock, so between
 * midnight and 03:00 in Cairo the grid highlighted yesterday and the calorie ceiling
 * rule judged the wrong day. Every other page already sends its local day; this one
 * now accepts it too and only falls back to UTC when nothing is supplied.
 */
function todayFromQuery(input: unknown): Date {
  const parsed = parseDayUTC(input);
  return parsed ?? toDayUTC(new Date());
}

function monthFromQuery(input: unknown, today: Date, floor: { year: number; month: number }) {
  const before = (y: number, m: number) => y < floor.year || (y === floor.year && m < floor.month);
  if (typeof input !== "string" || !/^\d{4}-\d{2}$/.test(input)) {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth() + 1;
    return before(y, m) ? { year: floor.year, month: floor.month } : { year: y, month: m };
  }
  const [year, month] = input.split("-").map(Number);
  if (month < 1 || month > 12) return { year: floor.year, month: floor.month };
  if (before(year, month)) return { year: floor.year, month: floor.month };
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

/**
 * A habit with no monthly target means every active day, which is what a missing
 * entry used to mean silently. It is an explicit 0 on the row now.
 */
function checkRowTarget(habit: HabitDef, activeDayCount: number) {
  return habit.monthlyTarget > 0 ? habit.monthlyTarget : activeDayCount;
}

/**
 * Two labels still read from the goals rather than the definition, because their
 * number is the target itself and repeating it in the label is how the two drift.
 */
function habitLabel(habit: HabitDef, goals: TrackerGoalValues) {
  if (habit.key === "protein") return `Protein ${goals.proteinTarget}g+`;
  if (habit.key === "water") {
    const ml = goals.waterTargetMl;
    return `Water ${ml % 1000 === 0 ? ml / 1000 : (ml / 1000).toFixed(1)}L`;
  }
  if (habit.key === "steps") return `${Math.round(goals.stepsTarget / 1000)}k Steps`;
  return habit.label;
}


function makeCheckRow(habit: HabitDef, days: Day[], cells: DailyCell[], goals: TrackerGoalValues, monthlyGoal = days.length, allowOverGoal = false): TrackerRow {
  const doneCount = cells.filter((cell) => cell.editable && cell.completed).length;
  return {
    id: habit.key,
    label: habitLabel(habit, goals),
    description: habit.description,
    icon: habit.icon,
    kind: habit.key === "gym" ? "target-count" : "daily-check",
    percent: allowOverGoal ? uncappedPercent(doneCount, monthlyGoal) : percent(doneCount, monthlyGoal),
    goal: monthlyGoal,
    actual: doneCount,
    left: Math.max(monthlyGoal - doneCount, 0),
    doneCount,
    cells,
  };
}

router.get("/", async (req, res) => {
  // The month a day belongs to follows the same local reading, or the grid opens on
  // the wrong month for the first few hours of the 1st.
  const today = todayFromQuery(req.query.today);
  const floor = await earliestTrackedMonth();
  const { year, month } = monthFromQuery(req.query.month, today, floor);
  const { start: monthStart, end: monthEnd } = monthRange(year, month);
  const rangeStart = monthStart;
  const todayIso = iso(today);
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
  const habits = await loadHabits();
  const monthlyTargetOf = (key: string) => {
    const habit = habits.find((h) => h.key === key);
    return habit ? checkRowTarget(habit, activeDays.length) : activeDays.length;
  };

  const trackerDocs = await DashboardTracker.find({ date: { $gte: rangeStart, $lt: monthEnd } });

  const trackerByKindDay = new Map<string, (typeof trackerDocs)[number]>();
  for (const doc of trackerDocs) trackerByKindDay.set(`${doc.kind}:${iso(doc.date)}`, doc);

  // The GYM row mirrors the workout log: a finished session fills the cell in, a
  // rest day greys it out. A manual tracker doc still wins, so tapping the cell
  // yourself keeps working on days you trained without logging a session.
  const workoutSessions = await WorkoutSession.find({ date: { $gte: rangeStart, $lt: monthEnd } });

  // Calories, protein and water were manual tick-boxes while the real figures sat
  // one page away, so every logged day had to be claimed a second time by hand.
  const [calorieEntries, waterRows, cheatRows] = await Promise.all([
    CalorieEntry.find({ date: { $gte: rangeStart, $lt: monthEnd }, deletedAt: null }),
    WaterEntry.find({ date: { $gte: rangeStart, $lt: monthEnd }, deletedAt: null }),
    CheatDay.find({ date: { $gte: rangeStart, $lt: monthEnd } }),
  ]);

  const intakeByDay = new Map<string, { cal: number; protein: number }>();
  for (const e of calorieEntries) {
    const iso = e.date.toISOString().slice(0, 10);
    const amount = (e.entryMode === "perUnit" ? e.units : e.grams) ?? 0;
    const cal = amount * (e.entryMode === "perUnit" ? e.caloriesPerUnitSnapshot : e.caloriesPerGramSnapshot);
    const protein = amount * (e.entryMode === "perUnit" ? e.proteinPerUnitSnapshot : e.proteinPerGramSnapshot);
    const row = intakeByDay.get(iso) ?? { cal: 0, protein: 0 };
    row.cal += cal;
    row.protein += protein;
    intakeByDay.set(iso, row);
  }

  const waterByDay = new Map<string, number>();
  for (const w of waterRows) {
    const iso = w.date.toISOString().slice(0, 10);
    waterByDay.set(iso, (waterByDay.get(iso) ?? 0) + w.ml);
  }

  /**
   * Sleep used to be a tick box called "Sleep 6-8h", so a night was either inside a
   * range nothing could read or outside it. The log holds the duration now and the
   * row is filled in from it, the way GYM is filled in from the workout log.
   */
  /**
   * What was earned each day, from the income log.
   *
   * The WORK row used to be its own little ledger: a number typed into the grid that
   * had nothing to do with the day's earnings recorded on the Income page. Logging a
   * shift left the row empty, so the same money had to be entered twice or the row
   * simply lied.
   */
  const incomeRows = await IncomeEntry.find({ date: { $gte: rangeStart, $lt: monthEnd }, deletedAt: null }).select({ date: 1, amount: 1, minutes: 1 });
  const incomeByDay = new Map<string, { amount: number; minutes: number }>();
  for (const row of incomeRows) {
    const key = iso(row.date);
    const found = incomeByDay.get(key) ?? { amount: 0, minutes: 0 };
    found.amount += row.amount;
    found.minutes += row.minutes;
    incomeByDay.set(key, found);
  }

  const sleepRows = await SleepEntry.find({ date: { $gte: rangeStart, $lt: monthEnd } });
  const sleepByDay = new Map<string, (typeof sleepRows)[number]>();
  for (const row of sleepRows) sleepByDay.set(iso(row.date), row);

  function sleepCellFor(dayIso: string): { state: "done" | "excused" | null; detail: string } | null {
    const night = sleepByDay.get(dayIso);
    if (!night) return null;
    const band = { min: goals.sleepMinMinutes, max: goals.sleepMaxMinutes };
    const length = durationLabel(night.minutes);
    if (inBand(night.minutes, band)) return { state: "done", detail: length + " slept" };
    const short = night.minutes < band.min;
    return { state: null, detail: length + (short ? ", under " + durationLabel(band.min) : ", over " + durationLabel(band.max)) };
  }

  const cheatDays = new Set(cheatRows.map((c) => c.date.toISOString().slice(0, 10)));
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

  /**
   * Calories, protein and water read straight off what was logged.
   *
   * A day with nothing logged stays blank rather than counting as a miss: an empty
   * day means "not recorded", and scoring it as a failure would punish forgetting to
   * open the app rather than the eating itself. A cheat day is excused, which is
   * what the Calories page has always claimed and nothing here previously honoured.
   */
  function intakeCellFor(kind: string, dayIso: string, isToday: boolean): { state: "done" | "excused" | null; detail: string } | null {
    if (kind === "water") {
      const ml = waterByDay.get(dayIso) ?? 0;
      const hit = waterHit(ml, goals);
      if (hit === null) return null;
      const target = goals.waterTargetMl;
      const litres = (v: number) => (v % 1000 === 0 ? `${v / 1000}L` : `${(v / 1000).toFixed(1)}L`);
      return hit ? { state: "done", detail: `${litres(ml)} drunk` } : { state: null, detail: `${litres(ml)} of ${litres(target)}` };
    }

    const intake = intakeByDay.get(dayIso);
    if (!intake || intake.cal <= 0) return null;
    const cheat = cheatDays.has(dayIso);
    if (cheat) return { state: "excused", detail: "Cheat day" };

    if (kind === "calories") {
      const cal = Math.round(intake.cal);
      const floor = goals.caloriesMinTarget;
      const hit = caloriesHit(intake.cal, goals, { isToday, cheat });
      // Under the ceiling is the whole test, so today says how much room is left
      // rather than waiting for the day to be over before it will tick.
      if (hit) return { state: "done", detail: isToday ? `${cal} cal, ${goals.caloriesTarget - cal} left` : `${cal} cal logged` };
      // The wording says which way it missed, which the verdict on its own cannot.
      if (cal > goals.caloriesTarget) return { state: null, detail: `${cal} cal, over by ${cal - goals.caloriesTarget}` };
      if (floor > 0 && cal < floor) return { state: null, detail: `${cal} cal, ${floor - cal} under the floor` };
      return { state: null, detail: `${cal} cal logged` };
    }
    if (kind === "protein") {
      const p = Math.round(intake.protein);
      return proteinHit(intake.protein, goals) ? { state: "done", detail: `${p}g protein` } : { state: null, detail: `${p}g of ${goals.proteinTarget}g` };
    }
    return null;
  }

  const manualRows = habits.map((habit) => {
    const kind = habit.key;
    // Any counted habit draws the number grid, not just Steps. Keying this on the
    // name was why a habit created as "record a number" still rendered as a tick box
    // with its amount nowhere in sight.
    if (habit.type === "count") {
      // Steps keeps its target in the goals, where its own editor writes it. Every
      // other counted habit carries its target on the definition.
      const dailyTarget = kind === "steps" ? goals.stepsTarget : habit.dailyTarget;
      const unit = habit.unit || (kind === "steps" ? "steps" : "");
      const cells: DailyCell[] = days.map((day) => {
        const doc = trackerByKindDay.get(`${kind}:${day.iso}`);
        const value = doc?.amount ?? 0;
        const hit = dailyTarget > 0 && value >= dailyTarget;
        const state = day.active ? (doc?.state === "excused" ? "excused" : hit ? "done" : trackerState(doc, false)) : "done";
        return {
          date: day.iso,
          checked: dailySatisfied(state),
          // Reaching the number, or saying you did it without recording one. Using
          // hit alone meant a manually ticked day rendered as done and still did not
          // count toward the month.
          completed: day.active ? state === "done" : true,
          editable: day.active,
          state,
          value,
          target: dailyTarget,
          detail: day.active
            ? state === "excused"
              ? "Intentional skip"
              : value
                ? `${Math.round(value).toLocaleString("en-US")}${unit ? " " + unit : ""}`
                : state === "done"
                  ? "Done, no number recorded"
                  : `Log ${unit || "it"}`
            : "Prefilled warm-up day",
        };
      });

      const daysHit = cells.filter((cell) => cell.editable && cell.completed).length;
      // With a monthly target the row counts days you reached it, which is what
      // "20 days a month" asks for. Without one it stays a running total, which is
      // how Steps has always read.
      const byDays = habit.monthlyTarget > 0;
      const actual = byDays ? daysHit : Math.round(cells.reduce((sum, cell) => sum + (cell.editable ? (cell.value ?? 0) : 0), 0));
      const goal = byDays ? habit.monthlyTarget : activeDays.length * dailyTarget;
      return {
        id: kind,
        label: habitLabel(habit, goals),
        description: habit.description,
        icon: habit.icon,
        kind: "steps-count" as const,
        percent: uncappedPercent(actual, goal),
        goal,
        actual,
        left: Math.max(goal - actual, 0),
        doneCount: daysHit,
        cells,
      };
    }

    if (kind === "work") {
      const workGoal = activeDays.filter((day) => !day.weekend).length * goals.workDayMoney;
      const cells: AmountCell[] = days.map((day) => {
        const doc = trackerByKindDay.get(`${kind}:${day.iso}`);
        // The income log decides where it has something to say. A day it knows
        // nothing about keeps whatever was typed into the grid, so the months that
        // were only ever recorded here are not wiped.
        const earned = incomeByDay.get(day.iso) ?? null;
        const amount = earned ? Math.round(earned.amount * 100) / 100 : (doc?.amount ?? 0);
        const state = day.active ? (earned ? "done" : day.weekend && !doc ? "excused" : trackerState(doc, amount > 0)) : "done";
        const checked = day.active ? day.weekend || dailySatisfied(state) : true;

        const hours = earned ? Math.round((earned.minutes / 60) * 10) / 10 : 0;
        const detail = !day.active
          ? "Prefilled warm-up day"
          : earned
            ? `${amount} from ${hours}h on the income page`
            : state === "excused"
              ? "Intentional skip. Add money if you worked."
              : amount
                ? `${amount}`
                : day.weekend
                  ? "Weekend auto-checked. Add money if you worked."
                  : "Log money";

        return {
          date: day.iso,
          amount,
          checked,
          completed: day.active ? amount > 0 : true,
          editable: day.active,
          target: goals.workDayMoney,
          weekend: day.weekend,
          state,
          detail,
        };
      });
      const actual = Math.round(cells.reduce((sum, cell) => sum + (cell.editable ? cell.amount : 0), 0) * 100) / 100;
      return {
        id: kind,
        label: habitLabel(habit, goals),
        description: habit.description,
        icon: habit.icon,
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
          /**
           * The task list decides, in both directions: finishing everything ticks the
           * day and adding a task afterwards unticks it again, so a stale manual mark
           * must never pin the cell.
           *
           * A day with no tasks at all used to fall back to that manual mark, and the
           * row read 31/31 across a month where 25 days held nothing. Same mistake as
           * calories, protein and water; this one was left behind when those were
           * fixed. An intentional skip still stands, since that is a real statement.
           */
          const derived = tasksCellFromList(day.iso);
          if (doc?.state === "excused") {
            state = "excused";
            detail = "Intentional skip";
          } else if (derived) {
            state = derived.state;
            detail = derived.detail;
          } else {
            state = null;
            detail = "No tasks planned";
          }
        } else if (kind === "sleep") {
          /**
           * A measured night beats a claimed one, so the log decides wherever there
           * is one: five hours logged reads as five hours even if the box was ticked
           * that morning out of habit.
           *
           * Where there is no log the old tick stands, unlike calories or water. This
           * was a tick box for months before it was a number, so an unlogged night is
           * genuinely unknown rather than one that was measured and missed, and
           * blanking that history would throw away the only record of it.
           */
          const derived = sleepCellFor(day.iso);
          if (doc?.state === "excused") {
            state = "excused";
            detail = "Intentional skip";
          } else if (derived) {
            state = derived.state;
            detail = derived.detail;
          }
        } else if (kind === "gym" && !manuallyMarked) {
          const derived = gymCellFromWorkout(day.iso);
          if (derived) {
            state = derived.state;
            detail = derived.detail;
          }
        } else if (kind === "calories" || kind === "protein" || kind === "water") {
          /**
           * Measured, not claimed, so the log decides outright.
           *
           * Falling back to the manual mark when a day had no data looked harmless
           * and was not: these rows were tick-boxes for months, so every unlogged
           * day still carried an old tick and stayed green. The month read 24/26 on
           * all three at once regardless of what was actually eaten or drunk.
           *
           * A deliberate "excused" still stands. That is the honest way to say a day
           * should not count, and it is set by double-clicking the cell.
           */
          const derived = intakeCellFor(kind, day.iso, day.iso === todayIso);
          if (doc?.state === "excused") {
            state = "excused";
            detail = "Intentional skip";
          } else if (derived) {
            state = derived.state;
            detail = derived.detail;
          } else {
            state = null;
            detail = kind === "water" ? "No water logged" : "Nothing logged";
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
    return makeCheckRow(habit, days, cells, goals, checkRowTarget(habit, activeDays.length), kind === "gym");
  });

  // Shopping ring: what is at or below its restock line right now, plus anything
  // written on the to-buy list by hand. Not month-scoped like the habit rows; stock
  // is a present-tense fact, not a daily history. Shared with the kitchen page so
  // the two cannot drift, which they did while each had its own copy of the rule.
  const kitchen = await kitchenSummary(12);

  const rows = manualRows;
  const primaryRows = rows;
  const totalGoal = primaryRows.reduce((sum, row) => sum + row.goal, 0);
  const totalActual = primaryRows.reduce((sum, row) => sum + Math.min(row.actual, row.goal), 0);
  const overallPercent = primaryRows.length ? Math.round(primaryRows.reduce((sum, row) => sum + Math.min(row.percent, 100), 0) / primaryRows.length) : 0;
  const completedRows = rows.filter((row) => row.percent >= 100).length;
  /**
   * How much of each day was actually done.
   *
   * This counted `checked`, which is true for an intentional skip, so a day where ten
   * of thirteen habits were skipped scored 100% while a day with nine genuinely done
   * scored 77%. Skips are now neutral: out of the numerator and the denominator both.
   * A day still to come is not scored at all rather than counted as perfect.
   */
  const dayProgress = days.map((day) => {
    const future = day.iso > todayIso;
    let done = 0;
    let judged = 0;
    let skipped = 0;
    for (const row of primaryRows) {
      const cell = row.cells.find((candidate) => candidate.date === day.iso) as DailyCell | AmountCell | undefined;
      if (!cell?.editable) continue;
      if (cell.state === "excused") {
        skipped++;
        continue;
      }
      judged++;
      if (cell.state === "done") done++;
    }
    return {
      date: day.iso,
      day: day.day,
      label: day.label,
      /** null means "nothing to judge": a future day, or one entirely skipped. */
      percent: future || judged === 0 ? null : percent(done, judged),
      done,
      judged,
      // Surfaced so a day at 100% off three judged habits reads differently from one
      // at 100% off thirteen.
      skipped,
      future,
    };
  });

  res.json({
    today: todayIso,
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
      gymMonthlyDays: monthlyTargetOf("gym"),
      englishMonthlyDays: monthlyTargetOf("english"),
      projectMonthlyDays: monthlyTargetOf("projects"),
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
      dayProgress,
      /** The first month with any data, so the client knows where to stop going back. */
      earliestMonth: `${floor.year}-${String(floor.month).padStart(2, "0")}`,
    },
    kitchen,
    rows,
  });
});

// =====================================================================
// GET /dashboard/goals   /   PATCH /dashboard/goals
// The targets every row is measured against. `monthlyByKind` holds "how many days
// this month"; a kind absent from it is measured against every day of the month.
// =====================================================================
const DAILY_GOAL_FIELDS = ["caloriesTarget", "proteinTarget", "waterTargetMl", "stepsTarget", "workDayMoney", "sleepMinMinutes", "sleepMaxMinutes"] as const;

// =====================================================================
// GET /dashboard/recap?today=YYYY-MM-DD&months=6
//
// The long view the grid cannot give: a year of days at a glance, how each month
// compared to the last, and where each habit stands over its whole life. Loaded on
// demand by the recap modal rather than bloating every dashboard request.
// =====================================================================
router.get("/recap", async (req, res) => {
  const today = todayFromQuery(req.query.today);
  const todayIso = iso(today);
  const habits = (await loadHabits()).filter((h) => h.key !== "work");
  const keys = habits.map((h) => h.key);

  const monthsBack = Math.min(Math.max(Number(req.query.months) || 6, 1), 24);
  const floor = await earliestTrackedMonth();

  const docs = await DashboardTracker.find({ kind: { $in: keys } }).sort({ date: 1 });

  /** done / excused / missed for one habit on one day. */
  const stateOf = (doc: (typeof docs)[number]) => (doc.state === "excused" ? "excused" : doc.state === "done" || doc.checked ? "done" : "missed");

  /**
   * A day with no row at all is a miss, not a day that never happened.
   *
   * Counting only the rows that exist made every habit read near 100%: Vitamins came
   * out 28/28 while the grid said 14/31, because the seventeen days nobody touched it
   * were simply absent. The denominator is days the habit could have been done.
   */
  const stateByKey = new Map<string, "done" | "excused" | "missed">();
  const firstSeen = new Map<string, string>();
  for (const doc of docs) {
    const day = iso(doc.date);
    stateByKey.set(`${doc.kind}:${day}`, stateOf(doc));
    const seen = firstSeen.get(doc.kind);
    if (!seen || day < seen) firstSeen.set(doc.kind, day);
  }

  const dayList: string[] = [];
  for (let i = 364; i >= 0; i--) dayList.push(iso(new Date(today.getTime() - i * 86_400_000)));

  /** Only habits that had started by that day, so a new one is not judged on the past. */
  const judgeable = (key: string, day: string) => {
    const from = firstSeen.get(key);
    return !!from && day >= from && day <= todayIso;
  };

  const tally = (days: string[], keys2: string[]) => {
    let done = 0;
    let judged = 0;
    let skipped = 0;
    for (const day of days) {
      for (const key of keys2) {
        if (!judgeable(key, day)) continue;
        const st = stateByKey.get(`${key}:${day}`) ?? "missed";
        if (st === "excused") {
          skipped++;
          continue;
        }
        judged++;
        if (st === "done") done++;
      }
    }
    return { done, judged, skipped };
  };

  // ---- a square per day for the last year ----
  const heatmap = dayList.map((date) => {
    const t = tally([date], keys);
    return { date, percent: t.judged > 0 ? Math.round((t.done / t.judged) * 100) : null, done: t.done, judged: t.judged };
  });

  // ---- month by month ----
  const monthKeys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (key >= `${floor.year}-${String(floor.month).padStart(2, "0")}`) monthKeys.push(key);
  }
  const months = monthKeys.map((key) => {
    const t = tally(dayList.filter((d) => d.startsWith(key)), keys);
    const [y, m] = key.split("-").map(Number);
    return {
      key,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }),
      percent: t.judged > 0 ? Math.round((t.done / t.judged) * 100) : null,
      done: t.done,
      judged: t.judged,
    };
  });

  // ---- each habit over its whole life ----
  const perHabit = habits.map((habit) => {
    const t = tally(dayList, [habit.key]);
    return {
      key: habit.key,
      label: habit.label,
      icon: habit.icon,
      done: t.done,
      judged: t.judged,
      skipped: t.skipped,
      firstSeen: firstSeen.get(habit.key) ?? null,
      percent: t.judged > 0 ? Math.round((t.done / t.judged) * 100) : null,
    };
  });

  res.json({
    today: todayIso,
    heatmap,
    months,
    habits: perHabit.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1)),
  });
});

router.get("/goals", async (_req, res) => {
  const goals = await loadTrackerGoals();
  const habits = await loadHabits();
  res.json({
    ...goals,
    // Every row, not only the ones already customised. A monthly target of 0 means
    // every day of the month, which the editor shows as blank.
    editableKinds: habits
      .filter((h) => h.key !== "steps" && h.key !== "work")
      .map((h) => ({ kind: h.key, label: habitLabel(h, goals), monthly: h.monthlyTarget > 0 ? h.monthlyTarget : null })),
    defaults: {},
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
    await ensureHabits();
    for (const [kind, value] of Object.entries(monthly)) {
      const habit = await Habit.findOne({ key: kind });
      if (!habit) return res.status(400).json({ error: `unknown habit: ${kind}` });
      // null puts the row back to "every day of the month", stored as an explicit 0.
      if (value === null) {
        habit.monthlyTarget = 0;
      } else {
        if (typeof value !== "number" || !isNonNegativeNumber(value)) return res.status(400).json({ error: `${kind} must be a non-negative number` });
        habit.monthlyTarget = value;
      }
      await habit.save();
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
  const habits = (await loadHabits()).filter((h) => h.onHabitsPage);
  const keys = habits.map((h) => h.key);
  const docs = await DashboardTracker.find({ kind: { $in: keys }, date: day });
  const byKind = new Map(docs.map((d) => [d.kind, d]));

  // Where each habit stands this month, so ticking today happens next to the reason
  // it matters instead of behind a link to the dashboard.
  const { start: mStart, end: mEnd } = monthRange(day.getUTCFullYear(), day.getUTCMonth() + 1);
  const monthDocs = await DashboardTracker.find({ kind: { $in: keys }, date: { $gte: mStart, $lt: mEnd } });
  const daysThisMonth = Math.round((mEnd.getTime() - mStart.getTime()) / 86400000);
  const monthDone = new Map<string, number>();
  for (const doc of monthDocs) {
    const habit = habits.find((h) => h.key === doc.kind);
    if (!habit) continue;
    const target = habit.key === "steps" ? goals.stepsTarget : habit.dailyTarget;
    const hit = habit.type === "count" ? target > 0 && (doc.amount ?? 0) >= target : false;
    // Same rule the grid counts by: reached the number, or said you did it.
    if (hit || doc.state === "done" || (doc.state !== "excused" && doc.checked)) {
      monthDone.set(doc.kind, (monthDone.get(doc.kind) ?? 0) + 1);
    }
  }

  const items = habits.map((habit) => {
    const doc = byKind.get(habit.key);
    // A counted habit records a number and is done once it reaches its target, the
    // same rule the grid uses. Steps takes its target from the goals so the two
    // cannot disagree; everything else carries its own.
    const isCount = habit.type === "count";
    const amount = doc?.amount ?? 0;
    const target = habit.key === "steps" ? goals.stepsTarget : habit.dailyTarget;
    const state = isCount ? (doc?.state === "excused" ? "excused" : amount >= target && target > 0 ? "done" : null) : trackerState(doc, Boolean(doc?.checked));

    return {
      kind: habit.key,
      label: habitLabel(habit, goals),
      description: habit.description,
      icon: habit.icon,
      input: isCount ? ("count" as const) : ("check" as const),
      unit: habit.unit,
      amount: isCount ? amount : null,
      target: isCount ? target : null,
      state,
      checked: dailySatisfied(state),
      note: doc?.note ?? "",
      monthDone: monthDone.get(habit.key) ?? 0,
      /** 0 on the definition means every day, so it resolves to the month's length. */
      monthTarget: habit.monthlyTarget > 0 ? habit.monthlyTarget : daysThisMonth,
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
  await ensureHabits();
  if (!(await Habit.exists({ key: kind }))) {
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

  /**
   * A day whose money came from the income log cannot be overtyped here.
   *
   * The row reads from that log wherever it has something to say, so a number entered
   * against the same day would be stored, ignored on the next load, and quietly
   * disappear. Refusing it and saying where the figure lives is the honest answer.
   */
  if (kind === "work" && req.body.amount !== undefined) {
    const logged = await IncomeEntry.exists({ date, deletedAt: null });
    if (logged) return res.status(400).json({ error: "That day's money comes from the income page. Edit it there." });
  }

  const doc = await DashboardTracker.findOneAndUpdate(
    { kind, date } as Record<string, unknown>,
    {
      $set: {
        checked: state === "done" || state === "excused",
        state,
        // Both only touched when supplied. Ticking a cell used to wipe the number
        // recorded against it, because amount was set unconditionally while the note
        // one line below was carefully guarded.
        ...(req.body.amount !== undefined ? { amount } : {}),
        ...(noteInput !== undefined ? { note: noteInput } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json(doc);
});

export default router;
