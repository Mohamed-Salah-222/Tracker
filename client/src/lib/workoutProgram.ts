// =====================================================================
// Workout program — single source of truth.
//
// Both the Workout page and the History modal read this file. They used to keep
// separate hardcoded lists that had drifted apart, which meant History could not
// resolve names for exercises the page actually logged.
//
// Exercise ids are stable storage keys: `SetLog.exerciseId` references them, so
// renaming an id orphans its history. Change `name` freely, `id` never.
// =====================================================================

export const WORKOUT_TYPES = ["upper", "lower", "rest"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export type Exercise = {
  id: string;
  name: string;
  /** How many set rows to render. */
  sets: number;
  /** Rep target shown as a hint. What was actually done is entered per set. */
  targetReps: number;
};

/** Every exercise runs three sets. */
export const SETS_PER_EXERCISE = 3;

export const UPPER_EXERCISES: Exercise[] = [
  { id: "chest-press", name: "Machine Chest Press", sets: SETS_PER_EXERCISE, targetReps: 10 },
  { id: "flat-bar-chest-press", name: "Flat Bar Chest Press", sets: SETS_PER_EXERCISE, targetReps: 8 },
  { id: "chest-fly", name: "Chest Fly", sets: SETS_PER_EXERCISE, targetReps: 12 },
  { id: "shoulder-press", name: "Shoulder Press", sets: SETS_PER_EXERCISE, targetReps: 10 },
  { id: "lat-pulldown", name: "Lat Pulldown", sets: SETS_PER_EXERCISE, targetReps: 12 },
  { id: "bicep-curl", name: "Cable Bicep Curl", sets: SETS_PER_EXERCISE, targetReps: 12 },
  { id: "triceps-pushdown", name: "Cable Tricep Pushdown", sets: SETS_PER_EXERCISE, targetReps: 12 },
];

export const LOWER_EXERCISES: Exercise[] = [
  { id: "leg-press", name: "Leg Press Machine", sets: SETS_PER_EXERCISE, targetReps: 12 },
  { id: "hack-squat", name: "Hack Squats", sets: SETS_PER_EXERCISE, targetReps: 10 },
  { id: "leg-extension", name: "Leg Extension", sets: SETS_PER_EXERCISE, targetReps: 12 },
  { id: "seated-leg-curl", name: "Seated Leg Curl", sets: SETS_PER_EXERCISE, targetReps: 12 },
  { id: "romanian-deadlift", name: "Romanian Deadlift", sets: SETS_PER_EXERCISE, targetReps: 10 },
];

export const PROGRAM: Record<Exclude<WorkoutType, "rest">, Exercise[]> = {
  upper: UPPER_EXERCISES,
  lower: LOWER_EXERCISES,
};

export const ALL_EXERCISES: Exercise[] = [...UPPER_EXERCISES, ...LOWER_EXERCISES];

export const EXERCISE_NAME_BY_ID: Record<string, string> = Object.fromEntries(ALL_EXERCISES.map((e) => [e.id, e.name]));

export function exerciseName(id: string): string {
  return EXERCISE_NAME_BY_ID[id] ?? id;
}

export function exercisesFor(type: WorkoutType): Exercise[] {
  return type === "rest" ? [] : PROGRAM[type];
}

export function workoutLabel(type: WorkoutType): string {
  if (type === "upper") return "Upper";
  if (type === "lower") return "Lower";
  return "Rest day";
}

/** Planned set target, e.g. "4 x 10". */
export function exerciseTarget(exercise: Exercise): string {
  return `${exercise.sets} × ${exercise.targetReps}`;
}

/**
 * Monochrome by design. The three types read apart by weight — filled, outlined,
 * ghost — rather than by hue, so the page stays black and white.
 */
export const WORKOUT_TYPE_STYLE: Record<WorkoutType, { label: string; fg: string; bg: string; border: string }> = {
  upper: { label: "Upper", fg: "var(--color-workout-upper-fg)", bg: "var(--color-workout-upper-bg)", border: "var(--color-workout-upper)" },
  lower: { label: "Lower", fg: "var(--color-workout-lower-fg)", bg: "var(--color-workout-lower-bg)", border: "var(--color-border-strong)" },
  rest: { label: "Rest", fg: "var(--color-workout-rest-fg)", bg: "var(--color-workout-rest-bg)", border: "transparent" },
};

/** Single-colour fills for charts, as a light-to-dark grey ladder. */
export const WORKOUT_TYPE_CHART: Record<WorkoutType, string> = {
  upper: "var(--color-workout-upper)",
  lower: "var(--color-workout-lower)",
  rest: "var(--color-workout-rest)",
};
