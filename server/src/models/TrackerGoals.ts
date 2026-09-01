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

    /**
     * The Calories page used to keep its own copy of all of this in a separate Goal
     * document, and the two drifted: protein read 180 on the dashboard and 160 here
     * for weeks after it was changed in one place. One store, one number.
     */
    /**
     * The bottom of the calorie band. Zero means no floor, which is the default:
     * without one, a day at 900 calories scores exactly the same as a day at 1950,
     * and only one of those is going to plan.
     */
    caloriesMinTarget: { type: Number, required: true, default: 0, min: 0 },
    carbsTarget: { type: Number, required: true, default: 200, min: 0 },
    fatTarget: { type: Number, required: true, default: 70, min: 0 },
    /** Water is a band, not a point: a floor, the figure to aim for, and a sane top. */
    waterMinMl: { type: Number, required: true, default: 3500, min: 0 },
    waterMaxMl: { type: Number, required: true, default: 6000, min: 0 },

    /**
     * The sleep band, in minutes. Sleep was a tick box called "Sleep 6-8h", so the
     * range was written into a label and nothing could read it. These are the same
     * six and eight hours, as numbers.
     */
    sleepMinMinutes: { type: Number, required: true, default: 360, min: 0, max: 1439 },
    sleepMaxMinutes: { type: Number, required: true, default: 480, min: 1, max: 1440 },

    /** Set once the values from the retired Goal document have been folded in. */
    mergedLegacyGoal: { type: Boolean, default: false },

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

// The three water numbers describe one band, so they only mean anything in order.
// Out of order they would render a target outside its own range.
trackerGoalsSchema.pre("validate", function () {
  if (typeof this.caloriesMinTarget === "number" && typeof this.caloriesTarget === "number" && this.caloriesMinTarget > this.caloriesTarget) {
    this.invalidate("caloriesMinTarget", "the calorie floor cannot be above the target", this.caloriesMinTarget);
  }
  if (typeof this.sleepMinMinutes === "number" && typeof this.sleepMaxMinutes === "number" && this.sleepMinMinutes > this.sleepMaxMinutes) {
    this.invalidate("sleepMinMinutes", "the shortest night cannot be longer than the longest", this.sleepMinMinutes);
  }
  const band = [this.waterMinMl, this.waterTargetMl, this.waterMaxMl];
  if (!band.every((v) => typeof v === "number" && Number.isFinite(v))) return;
  if (this.waterMinMl > this.waterTargetMl) {
    this.invalidate("waterMinMl", "the water floor cannot be above the target", this.waterMinMl);
  }
  if (this.waterTargetMl > this.waterMaxMl) {
    this.invalidate("waterMaxMl", "the water ceiling cannot be below the target", this.waterMaxMl);
  }
});

enforceSingleton(trackerGoalsSchema, "TrackerGoals");

export const TrackerGoals = model("TrackerGoals", trackerGoalsSchema);

export type TrackerGoalValues = {
  caloriesTarget: number;
  caloriesMinTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  waterTargetMl: number;
  waterMinMl: number;
  waterMaxMl: number;
  stepsTarget: number;
  workDayMoney: number;
  sleepMinMinutes: number;
  sleepMaxMinutes: number;
  monthlyByKind: Record<string, number>;
};

/** Reads the singleton, creating it with defaults the first time. */
export async function loadTrackerGoals(): Promise<TrackerGoalValues> {
  const doc = (await TrackerGoals.findOne()) ?? (await TrackerGoals.create({}));
  return {
    caloriesTarget: doc.caloriesTarget,
    caloriesMinTarget: doc.caloriesMinTarget,
    proteinTarget: doc.proteinTarget,
    carbsTarget: doc.carbsTarget,
    fatTarget: doc.fatTarget,
    waterTargetMl: doc.waterTargetMl,
    waterMinMl: doc.waterMinMl,
    waterMaxMl: doc.waterMaxMl,
    stepsTarget: doc.stepsTarget,
    workDayMoney: doc.workDayMoney,
    sleepMinMinutes: doc.sleepMinMinutes,
    sleepMaxMinutes: doc.sleepMaxMinutes,
    monthlyByKind: Object.fromEntries(doc.monthlyByKind ?? new Map()),
  };
}

/**
 * Fold the retired Goal document in, once. Only the fields TrackerGoals never had
 * are taken: calories, protein and the water target already live here and are the
 * ones actually edited, so they stay authoritative.
 */
export async function mergeLegacyGoal(legacy: { carbsTarget?: number; fatTarget?: number; waterMin?: number; waterMax?: number } | null): Promise<void> {
  const doc = (await TrackerGoals.findOne()) ?? (await TrackerGoals.create({}));
  if (doc.mergedLegacyGoal) return;
  if (legacy) {
    if (typeof legacy.carbsTarget === "number") doc.carbsTarget = legacy.carbsTarget;
    if (typeof legacy.fatTarget === "number") doc.fatTarget = legacy.fatTarget;
    if (typeof legacy.waterMin === "number") doc.waterMinMl = Math.min(legacy.waterMin, doc.waterTargetMl);
    if (typeof legacy.waterMax === "number") doc.waterMaxMl = Math.max(legacy.waterMax, doc.waterTargetMl);
  }
  doc.mergedLegacyGoal = true;
  await doc.save();
}
