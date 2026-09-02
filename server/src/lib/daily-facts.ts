import { CalorieEntry } from "../models/CalorieEntry";
import { WaterEntry } from "../models/WaterEntry";
import { CheatDay } from "../models/CheatDay";
import { Task } from "../models/Task";
import { DashboardTracker } from "../models/DashboardTracker";
import { SleepEntry } from "../models/SleepEntry";
import { JournalEntry } from "../models/JournalEntry";
import { WorkoutSession, isRestType } from "../models/WorkoutSession";
import { SetLog } from "../models/SetLog";
import { Habit } from "../models/Habit";
import { ensureHabits } from "./habit-seed";
import { loadTrackerGoals, type TrackerGoalValues } from "../models/TrackerGoals";
import { inBand } from "./sleep";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Whether a day met a target, stated once.
 *
 * These three rules decide the calorie, protein and water rows on the dashboard and
 * every badge that counts a good day. They lived only inside the dashboard route,
 * which is how the rows once came to disagree with the page they were summarising.
 * The dashboard now calls these too, so there is one answer to "was that a good day"
 * rather than one per feature.
 */
export function caloriesHit(cal: number, goals: TrackerGoalValues, opts: { isToday: boolean; cheat: boolean }): boolean | null {
  if (cal <= 0) return null; // nothing logged is not the same as a bad day
  if (opts.cheat) return null; // excused elsewhere, never counted against you
  if (cal > goals.caloriesTarget) return false;
  // Under the target is the whole test: there is no number to reach, only one not to
  // pass. Today counts as soon as it is under, rather than waiting for the day to end.
  // That means a day can tick in the morning and untick if you go over at dinner,
  // which is the honest reading of a ceiling as the day happens.
  if (goals.caloriesMinTarget > 0 && cal < goals.caloriesMinTarget) return false;
  return true;
}

/** A floor, unlike calories: once it is reached the day cannot un-reach it. */
export function proteinHit(protein: number, goals: TrackerGoalValues): boolean | null {
  if (protein <= 0) return null;
  return protein >= goals.proteinTarget;
}

export function waterHit(ml: number, goals: TrackerGoalValues): boolean | null {
  if (ml <= 0) return null;
  return ml >= goals.waterTargetMl;
}

export type DayFact = {
  date: string;
  calories: number;
  protein: number;
  water: number;
  cheat: boolean;
  caloriesHit: boolean | null;
  proteinHit: boolean | null;
  waterHit: boolean | null;
  steps: number | null;
  stepsHit: boolean | null;
  tasksTotal: number;
  tasksDone: number;
  /** Everything planned that day was finished, and there was something planned. */
  tasksClean: boolean;
  habitsJudged: number;
  habitsDone: number;
  /** Every habit that could be judged that day was done. */
  perfectDay: boolean;
  sleepMinutes: number | null;
  sleepInBand: boolean;
  journalWords: number | null;
  trained: boolean;
  restDay: boolean;
  volume: number;
};

/**
 * Every day the app has ever recorded anything about, as one table.
 *
 * Built once and handed to every measure, because forty badges each running their own
 * query over the same collections would be forty times the work for the same answer.
 */
export async function dailyFacts(todayIso: string): Promise<DayFact[]> {
  await ensureHabits();
  const goals = await loadTrackerGoals();

  const [calorieRows, waterRows, cheatRows, taskRows, trackerRows, sleepRows, journalRows, sessions, habits] = await Promise.all([
    CalorieEntry.find({ deletedAt: null }).select({ date: 1, entryMode: 1, units: 1, grams: 1, caloriesPerUnitSnapshot: 1, caloriesPerGramSnapshot: 1, proteinPerUnitSnapshot: 1, proteinPerGramSnapshot: 1 }),
    WaterEntry.find({ deletedAt: null }).select({ date: 1, ml: 1 }),
    CheatDay.find().select({ date: 1 }),
    Task.find().select({ date: 1, done: 1 }),
    DashboardTracker.find().select({ kind: 1, date: 1, state: 1, checked: 1, amount: 1 }),
    SleepEntry.find().select({ date: 1, minutes: 1 }),
    JournalEntry.find().select({ date: 1, body: 1 }),
    WorkoutSession.find().select({ date: 1, type: 1, completedAt: 1 }),
    Habit.find({ archived: false }).select({ key: 1, type: 1, dailyTarget: 1 }),
  ]);

  const setLogs = await SetLog.find({ sessionId: { $in: sessions.map((s) => s._id) }, done: true }).select({ sessionId: 1, weight: 1, reps: 1 });
  const sessionDay = new Map(sessions.map((s) => [String(s._id), iso(s.date)]));

  const days = new Map<string, DayFact>();
  const blank = (date: string): DayFact => ({
    date,
    calories: 0,
    protein: 0,
    water: 0,
    cheat: false,
    caloriesHit: null,
    proteinHit: null,
    waterHit: null,
    steps: null,
    stepsHit: null,
    tasksTotal: 0,
    tasksDone: 0,
    tasksClean: false,
    habitsJudged: 0,
    habitsDone: 0,
    perfectDay: false,
    sleepMinutes: null,
    sleepInBand: false,
    journalWords: null,
    trained: false,
    restDay: false,
    volume: 0,
  });
  const at = (date: string) => {
    const found = days.get(date) ?? blank(date);
    days.set(date, found);
    return found;
  };

  for (const e of calorieRows) {
    const day = at(iso(e.date));
    const amount = (e.entryMode === "perUnit" ? e.units : e.grams) ?? 0;
    day.calories += amount * (e.entryMode === "perUnit" ? e.caloriesPerUnitSnapshot : e.caloriesPerGramSnapshot);
    day.protein += amount * (e.entryMode === "perUnit" ? e.proteinPerUnitSnapshot : e.proteinPerGramSnapshot);
  }
  for (const w of waterRows) at(iso(w.date)).water += w.ml;
  for (const c of cheatRows) at(iso(c.date)).cheat = true;

  for (const t of taskRows) {
    const day = at(iso(t.date));
    day.tasksTotal++;
    if (t.done) day.tasksDone++;
  }

  const habitDefs = new Map(habits.map((h) => [h.key, { type: h.type, target: h.dailyTarget }]));
  for (const row of trackerRows) {
    const def = habitDefs.get(row.kind);
    if (!def) continue;
    const day = at(iso(row.date));
    if (row.kind === "steps" && typeof row.amount === "number") {
      day.steps = row.amount;
      day.stepsHit = row.amount >= goals.stepsTarget;
    }
    // An intentional skip is neutral: out of the numerator and the denominator both.
    if (row.state === "excused") continue;
    day.habitsJudged++;
    const hit = def.type === "count" ? (row.amount ?? 0) >= (row.kind === "steps" ? goals.stepsTarget : def.target) : row.state === "done" || row.checked;
    if (hit) day.habitsDone++;
  }

  for (const s of sleepRows) {
    const day = at(iso(s.date));
    day.sleepMinutes = s.minutes;
    day.sleepInBand = inBand(s.minutes, { min: goals.sleepMinMinutes, max: goals.sleepMaxMinutes });
  }

  for (const j of journalRows) {
    const body = (j.body ?? "").trim();
    at(iso(j.date)).journalWords = body === "" ? 0 : body.split(/\s+/).length;
  }

  for (const s of sessions) {
    const day = at(iso(s.date));
    if (isRestType(s.type)) day.restDay = true;
    else if (s.completedAt) day.trained = true;
  }
  for (const log of setLogs) {
    const date = sessionDay.get(String(log.sessionId));
    if (!date || typeof log.weight !== "number" || typeof log.reps !== "number") continue;
    at(date).volume += log.weight * log.reps;
  }

  for (const day of days.values()) {
    day.caloriesHit = caloriesHit(day.calories, goals, { isToday: day.date === todayIso, cheat: day.cheat });
    day.proteinHit = proteinHit(day.protein, goals);
    day.waterHit = waterHit(day.water, goals);
    day.tasksClean = day.tasksTotal > 0 && day.tasksDone === day.tasksTotal;
    day.perfectDay = day.habitsJudged > 0 && day.habitsDone === day.habitsJudged;
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The longest run of consecutive days where a fact held.
 *
 * Days the fact is unknown break the run rather than extending it: a month with no
 * water logged is not a month of hitting the target, and a streak that ignores the
 * gaps is the kind of number that flatters until you look at it.
 */
export function longestRun(facts: DayFact[], holds: (day: DayFact) => boolean): number {
  const good = new Set(facts.filter(holds).map((f) => f.date));
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const date of [...good].sort()) {
    const ms = Date.parse(date + "T00:00:00Z");
    run = previous !== null && ms - previous === 86_400_000 ? run + 1 : 1;
    previous = ms;
    if (run > best) best = run;
  }
  return best;
}

export const countWhere = (facts: DayFact[], holds: (day: DayFact) => boolean) => facts.filter(holds).length;
export const sumOf = (facts: DayFact[], pick: (day: DayFact) => number) => facts.reduce((total, day) => total + pick(day), 0);
