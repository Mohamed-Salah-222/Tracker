// =====================================================================
// Adapter over the split catalogue.
//
// The page used to be hardwired to a single upper/lower programme. It now runs on
// whichever of the 34 splits the user picked, so a "workout type" is any day-template
// key: "push", "legsB", "chestBack", "rest". This file keeps the names the page
// already used and points them at the catalogue.
// =====================================================================
import { DAY_TEMPLATES, REST, dayLabelOf, exerciseTarget, exercisesForDay, getDay, isRestDay, type Exercise } from "./workoutSplits";

export type WorkoutType = string;
export type { Exercise };
export { REST, exerciseTarget, isRestDay };

export const workoutLabel = dayLabelOf;
export const exercisesFor = exercisesForDay;

/** Muscle groups a day targets, shown under the title. */
export function dayFocus(key: WorkoutType): string {
  return getDay(key).focus;
}

export function exerciseCount(key: WorkoutType): number {
  return DAY_TEMPLATES[key]?.slots.length ?? 0;
}

/**
 * Monochrome by design: a rest day is a ghost pill, a training day is filled.
 * With 60+ possible day keys, hue-per-day was never going to scale anyway.
 */
export function workoutTypeStyle(key: WorkoutType): { label: string; fg: string; bg: string; border: string } {
  if (isRestDay(key)) {
    return { label: "Rest", fg: "var(--color-workout-rest-fg)", bg: "var(--color-workout-rest-bg)", border: "transparent" };
  }
  return { label: dayLabelOf(key), fg: "var(--color-workout-upper-fg)", bg: "var(--color-workout-upper-bg)", border: "var(--color-workout-upper)" };
}
