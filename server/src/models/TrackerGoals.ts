import { Schema, model } from "mongoose";
import { enforceSingleton } from "../lib/schema-guards";

/**
 * The targets the dashboard measures you against. These used to be hardcoded
 * constants in the route, so changing one meant a code edit and a deploy.
 *
 * Two kinds of target:
 *  - Daily amounts: what counts as hitting it on a given day (steps, calories…).
 *  - Monthly counts: how many days in the month you mean to do it at all, keyed by
 *    tracker kind. A kind with no entry means "every day of the month".
 */
const trackerGoalsSchema = new Schema(
  {
    caloriesTarget: { type: Number, required: true, default: 2000, min: 0 },
    proteinTarget: { type: Number, required: true, default: 180, min: 0 },
    waterTargetMl: { type: Number, required: true, default: 5000, min: 0 },
    stepsTarget: { type: Number, required: true, default: 10000, min: 0 },
    workDayMoney: { type: Number, required: true, default: 40, min: 0 },

    monthlyByKind: {
      type: Map,
      of: Number,
      default: () => new Map(Object.entries(DEFAULT_MONTHLY)),
    },
  },
  { timestamps: true },
);

/** Seeded so the previous hardcoded behaviour is preserved and now visible. */
export const DEFAULT_MONTHLY: Record<string, number> = {
  gym: 20,
  english: 20,
  projects: 25,
  projectGym: 25,
  calories: 26,
  protein: 26,
  water: 26,
};

enforceSingleton(trackerGoalsSchema, "TrackerGoals");

export const TrackerGoals = model("TrackerGoals", trackerGoalsSchema);

export type TrackerGoalValues = {
  caloriesTarget: number;
  proteinTarget: number;
  waterTargetMl: number;
  stepsTarget: number;
  workDayMoney: number;
  monthlyByKind: Record<string, number>;
};

/** Reads the singleton, creating it with defaults the first time. */
export async function loadTrackerGoals(): Promise<TrackerGoalValues> {
  const doc = (await TrackerGoals.findOne()) ?? (await TrackerGoals.create({}));
  return {
    caloriesTarget: doc.caloriesTarget,
    proteinTarget: doc.proteinTarget,
    waterTargetMl: doc.waterTargetMl,
    stepsTarget: doc.stepsTarget,
    workDayMoney: doc.workDayMoney,
    monthlyByKind: Object.fromEntries(doc.monthlyByKind ?? new Map()),
  };
}
