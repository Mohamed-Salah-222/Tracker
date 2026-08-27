// =====================================================================
// Progressive overload.
//
// The catalogue says what to do; this says how heavy. Every suggestion is derived
// from what was actually logged last time for that movement, so it degrades
// gracefully: no history means no suggestion rather than a made-up number.
// =====================================================================

export type LoggedSet = { weight: number | null; reps: number | null; rpe: number | null; done: boolean };

export type ExerciseHistory = {
  weight: number;
  reps: number | null;
  when: string;
  best: number;
  bestE1rm: number;
  lastSets: LoggedSet[];
};

/**
 * Epley. RPE, when given, says how many reps were left in reserve. An RPE 8 set of
 * 5 was really a 7-rep set, so it is folded in before estimating.
 */
export function estimate1RM(weight: number, reps: number, rpe?: number | null): number {
  if (weight <= 0 || reps <= 0) return 0;
  const inReserve = rpe != null && rpe >= 1 && rpe <= 10 ? 10 - rpe : 0;
  const effective = reps + inReserve;
  return effective <= 1 ? weight : weight * (1 + effective / 30);
}

/** Gyms have plates, not real numbers. Barbell work rounds to 2.5kg, the rest to 1kg. */
export function roundLoad(kg: number, step = 2.5): number {
  if (kg <= 0) return 0;
  return Math.round(kg / step) * step;
}

export type ProgressionScheme = "linear" | "double" | "wave531" | "none";

export type Suggestion = {
  /** Load to aim for, already rounded to something loadable. */
  weight: number;
  /** Reps to aim for at that load. */
  reps: number;
  /** Plain-language reason, shown under the exercise so the number is never magic. */
  reason: string;
  /** True when the suggestion is a step up from last time. */
  isIncrease: boolean;
};

/** Upper-body movements move in smaller jumps than lower-body ones. */
const LOWER_BODY = new Set([
  "leg-press",
  "hack-squat",
  "back-squat",
  "front-squat",
  "goblet-squat",
  "leg-extension",
  "seated-leg-curl",
  "lying-leg-curl",
  "romanian-deadlift",
  "deadlift",
  "hip-thrust",
  "bulgarian-split-squat",
  "walking-lunge",
  "calf-raise",
  "seated-calf-raise",
  "good-morning",
  "rack-pull",
  "speed-squat",
]);

export function incrementFor(movementId: string): number {
  return LOWER_BODY.has(movementId) ? 5 : 2.5;
}

/**
 * What to lift today for one movement.
 *
 * `targetReps` is the programme's prescription. `history` is what happened the last
 * time this movement was trained. Returns null when there is nothing to go on.
 */
export function suggestLoad({
  movementId,
  targetSets,
  targetReps,
  targetRepsMin,
  scheme,
  history,
}: {
  movementId: string;
  /** Top of the working range. */
  targetReps: number;
  /** Bottom of the working range; equal to targetReps for a fixed prescription. */
  targetRepsMin?: number;
  targetSets: number;
  scheme: ProgressionScheme;
  history: ExerciseHistory | undefined;
}): Suggestion | null {
  const repsMin = targetRepsMin ?? targetReps;
  if (scheme === "none" || !history) return null;

  const logged = history.lastSets.filter((s) => (s.weight ?? 0) > 0 && (s.reps ?? 0) > 0);
  if (logged.length === 0) return null;

  const step = incrementFor(movementId);
  // The working load is the one used for the most sets, not the heaviest: a single
  // heavy top set would otherwise drag every following session up with it. Ties go
  // to the heavier weight.
  const tally = new Map<number, number>();
  for (const s of logged) tally.set(s.weight!, (tally.get(s.weight!) ?? 0) + 1);
  const lastWeight = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const workingSets = logged.filter((s) => s.weight === lastWeight);
  const minReps = Math.min(...workingSets.map((s) => s.reps ?? 0));

  if (scheme === "wave531") {
    // A percentage of the best estimated max, which is what the 5/3/1 wave keys off.
    const e1rm = history.bestE1rm || estimate1RM(lastWeight, minReps);
    if (e1rm <= 0) return null;
    // Training max is 90% of the estimate; the top set of week one is 85% of that.
    const weight = roundLoad(e1rm * 0.9 * 0.85, step);
    return { weight, reps: targetReps, reason: `85% of a ${Math.round(e1rm * 0.9)}kg training max`, isIncrease: weight > lastWeight };
  }

  const completedEverySet = workingSets.length >= targetSets && workingSets.filter((s) => s.done).length >= targetSets;

  if (scheme === "double") {
    // Double progression on the range: climb from the bottom to the top of the band,
    // then add load and drop back to the bottom.
    if (minReps >= targetReps && completedEverySet) {
      const weight = roundLoad(lastWeight + step, step);
      return { weight, reps: repsMin, reason: `All ${targetSets} sets hit ${targetReps} at ${lastWeight}kg, so go up and reset to ${repsMin}`, isIncrease: true };
    }
    const next = Math.min(targetReps, Math.max(repsMin, minReps + 1));
    return {
      weight: lastWeight,
      reps: next,
      reason: minReps < targetReps ? `Same weight: ${targetReps} on every set earns the jump` : "Finish every set to move up",
      isIncrease: false,
    };
  }

  // linear: add load whenever the prescription was met in full.
  if (completedEverySet && minReps >= targetReps) {
    const weight = roundLoad(lastWeight + step, step);
    return { weight, reps: repsMin, reason: `Cleared ${targetSets}x${targetReps} last time`, isIncrease: true };
  }
  return { weight: lastWeight, reps: targetReps, reason: `Repeat ${lastWeight}kg until all ${targetSets} sets are clean`, isIncrease: false };
}

// =====================================================================
// Stall detection
// =====================================================================

export type SessionPoint = { date: string; weight: number; reps: number | null; e1rm: number };

export type TrendStatus = "progressing" | "flat" | "notice" | "deload" | "regressed" | "unknown";

export type Trend = {
  status: TrendStatus;
  /** Consecutive most-recent sessions where nothing improved. */
  flatSessions: number;
  message: string;
  /** Only set for "deload": the load to drop back to. */
  deloadTo?: number;
};

/**
 * Progress is any of: more weight, more reps at the same weight, or a better
 * estimated max. Climbing a rep range at a fixed load is progress, and that is the
 * whole point of double progression, and treating it as a stall would flag a
 * perfectly healthy block.
 */
function improved(newer: SessionPoint, older: SessionPoint): boolean {
  if (newer.weight > older.weight) return true;
  if (newer.weight === older.weight && (newer.reps ?? 0) > (older.reps ?? 0)) return true;
  return newer.e1rm > older.e1rm + 0.01;
}

function wentBackwards(newer: SessionPoint, older: SessionPoint): boolean {
  if (newer.weight < older.weight) return true;
  if (newer.weight === older.weight && (newer.reps ?? 0) < (older.reps ?? 0)) return true;
  return false;
}

/**
 * `recent` is newest-first, one entry per session. Needs at least two sessions to
 * say anything; a single data point is not a trend.
 */
export function analyseTrend(recent: SessionPoint[] | undefined, noticeAt: number, deloadAt: number): Trend {
  if (!recent || recent.length < 2) {
    return { status: "unknown", flatSessions: 0, message: "" };
  }

  // Regression is its own signal and beats any stall count: losing ground is a
  // different problem from standing still.
  if (wentBackwards(recent[0], recent[1])) {
    return { status: "regressed", flatSessions: 0, message: `Down from ${recent[1].weight}kg × ${recent[1].reps ?? "?"} last time. Worth checking sleep, food and warm-up before pushing on.` };
  }

  let flat = 0;
  for (let i = 0; i + 1 < recent.length; i++) {
    if (improved(recent[i], recent[i + 1])) break;
    flat++;
  }

  if (flat === 0) return { status: "progressing", flatSessions: 0, message: "" };

  if (flat >= deloadAt) {
    const deloadTo = roundLoad(recent[0].weight * 0.9, 2.5);
    return {
      status: "deload",
      flatSessions: flat,
      deloadTo,
      message: `Stuck for ${flat} sessions. Drop to about ${deloadTo}kg and build back up; that usually breaks it.`,
    };
  }
  if (flat >= noticeAt) {
    return { status: "notice", flatSessions: flat, message: `No progress for ${flat} sessions. Give it one or two more, then consider backing off.` };
  }
  return { status: "flat", flatSessions: flat, message: "" };
}
