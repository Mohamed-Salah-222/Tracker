import { Habit } from "../models/Habit";
import { DashboardTracker } from "../models/DashboardTracker";
import { dailyFacts, type DayFact } from "./daily-facts";
import { eachDay, expectedCount, isOffDay, isPaused, shiftDay, streakUnit, weeksIn, type Schedule } from "./habit-schedule";

/**
 * One habit's whole history.
 *
 * The app could show you every habit for one day and one month of every habit, and
 * never one habit over time. A streak with no page behind it explains nothing, which
 * is why the number was worth removing from the dashboard and is worth having here.
 *
 * Nothing about what counts as a good day is decided in this file. Tracked habits read
 * their rows, derived ones read `dailyFacts`, which is the same table the dashboard and
 * the badges use, so a rate here cannot disagree with the grid.
 */
export type DayState = "done" | "excused" | "missed" | "unknown" | "off" | "paused" | "future";

export type HabitDay = {
  date: string;
  state: DayState;
  amount: number | null;
  note: string;
};

export type HabitWeek = { start: string; done: number; target: number; kept: boolean };

export type HabitStats = {
  key: string;
  label: string;
  since: string | null;
  from: string;
  to: string;
  unit: "day" | "week";
  /** The run still going. Days, or weeks for a habit counted by the week. */
  current: number;
  best: number;
  done: number;
  excused: number;
  missed: number;
  expected: number;
  /** Kept out of the days that were meant to happen, as a percentage. */
  rate: number;
  last30: number;
  days: HabitDay[];
  weeks: HabitWeek[];
  notes: { date: string; note: string }[];
};

/** A day that counts towards the run. Skipping is a decision, not a failure. */
const kept = (s: DayState) => s === "done" || s === "excused";
/** A day the habit was meant to happen and is answerable for. */
const judged = (s: DayState) => s !== "off" && s !== "paused" && s !== "future";

/**
 * What a derived habit's day looks like.
 *
 * `null` where the source has nothing to say. A day with no food logged is not a day
 * the calorie target was missed, and counting it as one turns every gap in the record
 * into a failure.
 */
function derivedState(source: string, fact: DayFact | undefined): DayState {
  if (!fact) return "unknown";
  switch (source) {
    case "workout":
      return fact.trained ? "done" : fact.restDay ? "excused" : "missed";
    case "tasks":
      // Nothing planned is not a day you failed to finish your plan.
      return fact.tasksTotal === 0 ? "excused" : fact.tasksClean ? "done" : "missed";
    case "calories":
      return fact.cheat ? "excused" : fact.caloriesHit === null ? "unknown" : fact.caloriesHit ? "done" : "missed";
    case "protein":
      return fact.proteinHit === null ? "unknown" : fact.proteinHit ? "done" : "missed";
    case "water":
      return fact.waterHit === null ? "unknown" : fact.waterHit ? "done" : "missed";
    case "sleep":
      return fact.sleepMinutes === null ? "unknown" : fact.sleepInBand ? "done" : "missed";
    default:
      return "unknown";
  }
}

/**
 * The run still going, counting back from the most recent day that can be answered for.
 *
 * Today is left out of the reckoning when it has not been done yet: a habit is not
 * broken at breakfast because you have not got to it. Once it is done, it counts.
 */
function currentRun(days: HabitDay[], todayIso: string): number {
  const answerable = days.filter((d) => judged(d.state) && d.date <= todayIso);
  let run = 0;
  for (let i = answerable.length - 1; i >= 0; i--) {
    const day = answerable[i];
    if (kept(day.state)) {
      run++;
      continue;
    }
    // The one forgiven break: today, not done yet.
    if (day.date === todayIso && run === 0) continue;
    break;
  }
  return run;
}

function bestRun(days: HabitDay[]): number {
  let best = 0;
  let run = 0;
  for (const day of days) {
    if (!judged(day.state)) continue;
    run = kept(day.state) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** For a habit counted by the week, both runs are measured in kept weeks. */
function weekRuns(weeks: HabitWeek[], todayIso: string): { current: number; best: number } {
  let best = 0;
  let run = 0;
  for (const week of weeks) {
    run = week.kept ? run + 1 : 0;
    if (run > best) best = run;
  }
  let current = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const week = weeks[i];
    if (week.kept) {
      current++;
      continue;
    }
    // The week you are standing in still has days left in it.
    const inProgress = i === weeks.length - 1 && weeks[i].start <= todayIso;
    if (inProgress && current === 0) continue;
    break;
  }
  return { current, best };
}

export async function habitStats(habit: InstanceType<typeof Habit>, opts: { todayIso: string; days: number; startsOn: number }): Promise<HabitStats> {
  const { todayIso, days, startsOn } = opts;
  const schedule = (habit.schedule ?? {}) as unknown as Schedule;

  const first = await DashboardTracker.findOne({ kind: habit.key }).sort({ date: 1 });
  const since = first ? first.date.toISOString().slice(0, 10) : null;

  const from = shiftDay(todayIso, -(days - 1));
  const to = todayIso;

  const rows = await DashboardTracker.find({
    kind: habit.key,
    date: { $gte: new Date(from + "T00:00:00Z"), $lte: new Date(to + "T00:00:00Z") },
  });
  const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));

  // Only paid for when the habit is actually filled in from somewhere else.
  const facts = habit.derivedFrom ? new Map((await dailyFacts(todayIso)).map((f) => [f.date, f])) : new Map<string, DayFact>();

  const list: HabitDay[] = eachDay(from, to).map((date) => {
    const row = byDay.get(date);
    const note = row?.note ?? "";
    const amount = row?.amount ?? null;

    if (date > todayIso) return { date, state: "future", amount, note };
    // A pause covers the days it covers, whatever the schedule says about them.
    if (isPaused(habit.pausedUntil, date) && date >= (since ?? date)) return { date, state: "paused", amount, note };
    if (isOffDay(schedule, date)) return { date, state: "off", amount, note };
    // Before the habit existed there is nothing to answer for.
    if (since && date < since) return { date, state: "off", amount, note };

    if (habit.derivedFrom) return { date, state: derivedState(habit.derivedFrom, facts.get(date)), amount, note };
    if (row?.state === "excused") return { date, state: "excused", amount, note };
    if (row?.state === "done" || row?.checked) return { date, state: "done", amount, note };
    if (habit.type === "count" && habit.dailyTarget > 0 && (row?.amount ?? 0) >= habit.dailyTarget) return { date, state: "done", amount, note };
    return { date, state: "missed", amount, note };
  });

  const weeks: HabitWeek[] = weeksIn(from, to, startsOn).map((week) => {
    const inWeek = list.filter((d) => week.days.includes(d.date));
    const doneCount = inWeek.filter((d) => kept(d.state)).length;
    // A partial week at either end cannot be asked for more days than it holds.
    const target = Math.min(schedule.type === "timesPerWeek" ? schedule.times : inWeek.filter((d) => judged(d.state)).length, week.days.length);
    return { start: week.start, done: doneCount, target, kept: target > 0 && doneCount >= target };
  });

  const doneDays = list.filter((d) => d.state === "done").length;
  const excusedDays = list.filter((d) => d.state === "excused").length;
  const missedDays = list.filter((d) => d.state === "missed" || d.state === "unknown").length;

  // Paused and off days are not owed, so they are not in the denominator.
  const notOwed = list.filter((d) => d.state === "paused" || (d.state === "off" && since !== null && d.date >= since)).length;
  const expected = Math.max(expectedCount(schedule, since && since > from ? since : from, to, startsOn) - notOwed, 0);

  const rateOver = (fromIso: string) => {
    const slice = list.filter((d) => d.date >= fromIso && judged(d.state));
    if (slice.length === 0) return 0;
    return Math.round((slice.filter((d) => kept(d.state)).length / slice.length) * 100);
  };

  const runs = streakUnit(schedule) === "week" ? weekRuns(weeks, todayIso) : { current: currentRun(list, todayIso), best: bestRun(list) };

  return {
    key: habit.key,
    label: habit.label,
    since,
    from,
    to,
    unit: streakUnit(schedule),
    current: runs.current,
    best: runs.best,
    done: doneDays,
    excused: excusedDays,
    missed: missedDays,
    expected,
    rate: rateOver(from),
    last30: rateOver(shiftDay(todayIso, -29)),
    days: list,
    weeks,
    notes: list
      .filter((d) => d.note.trim().length > 0)
      .map((d) => ({ date: d.date, note: d.note }))
      .reverse(),
  };
}
