import { UsageDay } from "../models/UsageDay";
import { Task } from "../models/Task";
import { JournalEntry } from "../models/JournalEntry";
import { SleepEntry } from "../models/SleepEntry";
import { WorkoutSession, isRestType } from "../models/WorkoutSession";
import { SetLog } from "../models/SetLog";
import { IncomeEntry } from "../models/IncomeEntry";
import { Expense } from "../models/Expense";
import { MoneyMovement } from "../models/MoneyMovement";
import { Subscription } from "../models/Subscription";
import { Food } from "../models/Food";
import { Recipe } from "../models/Recipe";
import { ShoppingItem } from "../models/ShoppingItem";
import { KitchenItem } from "../models/KitchenItem";
import { Goal2 } from "../models/Goal2";
import { GoalCheckpoint } from "../models/GoalCheckpoint";
import { WeightEntry } from "../models/WeightEntry";
import { CalorieEntry } from "../models/CalorieEntry";
import { WaterEntry } from "../models/WaterEntry";
import { BODY_METRICS } from "./body-metrics";
import { countWhere, dailyFacts, longestRun, sumOf, type DayFact } from "./daily-facts";
import { streakSummary } from "./streak";

/**
 * Every number a badge can be measured against.
 *
 * A measure is a lifetime figure, never a current one. Badges record what you did, so
 * a run that has since ended still counts towards the badge it earned, and nothing
 * here can go down.
 */
export type Measures = Record<string, number>;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Distinct local days present in a set of dated rows. */
function distinctDays(rows: { date: Date }[]): number {
  return new Set(rows.map((r) => iso(r.date))).size;
}

/**
 * Longest run of consecutive days across a set of dated rows.
 * Used where the fact is simply "there was one that day".
 */
function runOfDays(rows: { date: Date }[]): number {
  const days = [...new Set(rows.map((r) => iso(r.date)))].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    const ms = Date.parse(day + "T00:00:00Z");
    run = previous !== null && ms - previous === 86_400_000 ? run + 1 : 1;
    previous = ms;
    if (run > best) best = run;
  }
  return best;
}

let cache: { at: number; measures: Measures; facts: DayFact[] } | null = null;
const CACHE_MS = 30_000;

/**
 * Work out every measure.
 *
 * Cached for half a minute: the badge board and the ping both want the whole set, and
 * without it a page load would run twenty aggregations twice. Short enough that a
 * badge earned by the action you just took still appears when the page reloads.
 */
export async function allMeasures(todayIso: string, force = false): Promise<{ measures: Measures; facts: DayFact[] }> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return { measures: cache.measures, facts: cache.facts };

  const facts = await dailyFacts(todayIso);
  const usage = await streakSummary(todayIso);

  const [
    tasks,
    journals,
    nights,
    sessions,
    setLogs,
    incomes,
    expenses,
    movements,
    subscriptions,
    foods,
    recipes,
    shopping,
    kitchen,
    goals,
    checkpoints,
    weights,
    calorieEntries,
    waters,
  ] = await Promise.all([
    Task.find().select({ date: 1, done: 1, isDefault: 1 }),
    JournalEntry.find().select({ date: 1, body: 1, mood: 1, tags: 1 }),
    SleepEntry.find().select({ date: 1, minutes: 1, quality: 1 }),
    WorkoutSession.find().select({ date: 1, type: 1, completedAt: 1 }),
    SetLog.aggregate<{ sets: number; volume: number }>([
      { $match: { done: true } },
      { $group: { _id: null, sets: { $sum: 1 }, volume: { $sum: { $multiply: [{ $ifNull: ["$weight", 0] }, { $ifNull: ["$reps", 0] }] } } } },
    ]),
    IncomeEntry.find({ deletedAt: null }).select({ date: 1, amount: 1, minutes: 1 }),
    Expense.find({ deletedAt: null }).select({ date: 1, amount: 1 }),
    MoneyMovement.find({ deletedAt: null }).select({ date: 1 }),
    Subscription.find().select({ paidThrough: 1 }),
    Food.find().select({ archived: 1 }),
    Recipe.find().select({ _id: 1 }),
    ShoppingItem.find().select({ done: 1 }),
    KitchenItem.find().select({ _id: 1 }),
    Goal2.find().select({ status: 1 }),
    GoalCheckpoint.find().select({ date: 1, comments: 1 }),
    WeightEntry.find({ deletedAt: null }).select({ date: 1, ...Object.fromEntries(BODY_METRICS.map((m) => [m.key, 1])) }),
    CalorieEntry.aggregate<{ _id: null; entries: number; days: string[] }>([
      { $match: { deletedAt: null } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, n: { $sum: 1 } } },
      { $group: { _id: null, entries: { $sum: "$n" }, days: { $push: "$_id" } } },
    ]),
    WaterEntry.aggregate<{ ml: number }>([{ $match: { deletedAt: null } }, { $group: { _id: null, ml: { $sum: "$ml" } } }]),
  ]);

  const completedSessions = sessions.filter((s) => !isRestType(s.type) && s.completedAt);
  const lifting = setLogs[0] ?? { sets: 0, volume: 0 };
  const eating = calorieEntries[0] ?? { entries: 0, days: [] };
  const drunkMl = waters[0]?.ml ?? 0;
  const journalWords = journals.reduce((total, j) => {
    const body = (j.body ?? "").trim();
    return total + (body === "" ? 0 : body.split(/\s+/).length);
  }, 0);

  // How many different body measurements have ever been filled in, which is the
  // honest way to reward measuring more than the scale.
  const measuredKinds = new Set<string>();
  for (const row of weights) {
    for (const metric of BODY_METRICS) {
      if (typeof (row.get(metric.key) as number | null) === "number") measuredKinds.add(metric.key);
    }
  }

  const measures: Measures = {
    // ---- using the app at all ----
    streak: usage.longest,
    daysUsed: usage.daysUsed,
    usageActions: (await UsageDay.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: "$actions" } } }]))[0]?.total ?? 0,

    // ---- the dashboard grid ----
    perfectDays: countWhere(facts, (d) => d.perfectDay),
    perfectStreak: longestRun(facts, (d) => d.perfectDay),
    habitDaysDone: sumOf(facts, (d) => d.habitsDone),

    // ---- tasks ----
    // The anchor task the app adds to every day is not something you chose to do.
    tasksDone: tasks.filter((t) => t.done && !t.isDefault).length,
    taskCleanDays: countWhere(facts, (d) => d.tasksClean),
    taskCleanStreak: longestRun(facts, (d) => d.tasksClean),

    // ---- journal ----
    journalEntries: journals.length,
    journalWords,
    journalStreak: runOfDays(journals),
    journalTagged: journals.filter((j) => (j.tags?.length ?? 0) > 0).length,
    moodsLogged: journals.filter((j) => Boolean(j.mood)).length,

    // ---- sleep ----
    sleepNights: nights.length,
    sleepInBandNights: countWhere(facts, (d) => d.sleepInBand),
    sleepInBandStreak: longestRun(facts, (d) => d.sleepInBand),
    sleepLoggedStreak: runOfDays(nights),
    sleepHours: Math.round(nights.reduce((total, n) => total + n.minutes, 0) / 60),

    // ---- calories ----
    calorieDaysLogged: eating.days.length,
    calorieEntries: eating.entries,
    calorieTargetDays: countWhere(facts, (d) => d.caloriesHit === true),
    calorieTargetStreak: longestRun(facts, (d) => d.caloriesHit === true),

    // ---- protein ----
    proteinDays: countWhere(facts, (d) => d.proteinHit === true),
    proteinStreak: longestRun(facts, (d) => d.proteinHit === true),
    proteinKg: Math.round(sumOf(facts, (d) => d.protein) / 1000),

    // ---- water ----
    waterDays: countWhere(facts, (d) => d.waterHit === true),
    waterStreak: longestRun(facts, (d) => d.waterHit === true),
    waterLitres: Math.round(drunkMl / 1000),

    // ---- steps ----
    stepsTargetDays: countWhere(facts, (d) => d.stepsHit === true),
    stepsTargetStreak: longestRun(facts, (d) => d.stepsHit === true),
    stepsTotal: sumOf(facts, (d) => d.steps ?? 0),
    stepsBestDay: facts.reduce((best, d) => Math.max(best, d.steps ?? 0), 0),

    // ---- workout ----
    workoutSessions: completedSessions.length,
    workoutSets: lifting.sets,
    workoutVolume: Math.round(lifting.volume),
    workoutWeeks: new Set(completedSessions.map((s) => weekKey(s.date))).size,
    workoutBestWeek: bestPerWeek(completedSessions.map((s) => s.date)),

    // ---- body ----
    bodyReadings: weights.length,
    bodyMeasureKinds: measuredKinds.size,

    // ---- food catalogue and kitchen ----
    foodsCreated: foods.filter((f) => !f.archived).length,
    recipesCreated: recipes.length,
    kitchenItems: kitchen.length,
    shoppingCleared: shopping.filter((s) => s.done).length,

    // ---- goals ----
    goalsCompleted: goals.filter((g) => g.status === "done").length,
    checkpointsLogged: checkpoints.length,
    checkpointComments: checkpoints.reduce((total, c) => total + (c.comments?.length ?? 0), 0),

    // ---- income ----
    incomeDays: distinctDays(incomes),
    incomeTotal: Math.round(incomes.reduce((total, i) => total + i.amount, 0)),
    incomeHours: Math.round(incomes.reduce((total, i) => total + i.minutes, 0) / 60),

    // ---- payments ----
    expensesLogged: expenses.length,
    movementsLogged: movements.length,
    subscriptionsSettled: subscriptions.filter((s) => s.paidThrough).length,
    moneyMonths: new Set([...expenses, ...movements].map((r) => iso(r.date).slice(0, 7))).size,
  };

  cache = { at: Date.now(), measures, facts };
  return { measures, facts };
}

/** The Monday-keyed week a date belongs to. */
function weekKey(date: Date): string {
  const d = new Date(date);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return iso(d);
}

/** The most sessions ever done inside one week. */
function bestPerWeek(dates: Date[]): number {
  const byWeek = new Map<string, number>();
  for (const date of dates) {
    const key = weekKey(date);
    byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
  }
  return [...byWeek.values()].reduce((best, n) => Math.max(best, n), 0);
}

/** Drops the cache so the next read is fresh. Called after anything is written. */
export function invalidateMeasures(): void {
  cache = null;
}
