import { Schema, model } from "mongoose";

/** Types the app creates today. */
export const WORKOUT_TYPES = ["upper", "lower", "rest"] as const;

/**
 * Retired split values. The program used to be a 4-day upperA/lowerA/upperB/lowerB
 * rotation; it is now a simple upper/lower split. Old documents still carry the old
 * values, so they stay in the schema enum (otherwise re-saving a historical session
 * throws a validation error) and are folded into the new types on read via
 * `normalizeWorkoutType`.
 */
export const LEGACY_WORKOUT_TYPES = ["upperA", "lowerA", "upperB", "lowerB"] as const;

const ALL_WORKOUT_TYPES = [...WORKOUT_TYPES, ...LEGACY_WORKOUT_TYPES];

export type WorkoutType = (typeof WORKOUT_TYPES)[number];

export function normalizeWorkoutType(type: string): WorkoutType {
  if (type === "upperA" || type === "upperB") return "upper";
  if (type === "lowerA" || type === "lowerB") return "lower";
  if (type === "upper" || type === "lower" || type === "rest") return type;
  return "rest";
}

const workoutSessionSchema = new Schema(
  {
    date: { type: Date, required: true, unique: true, index: true },
    type: { type: String, enum: ALL_WORKOUT_TYPES, required: true },

    // Legacy cardio bookend fields kept for existing documents.
    warmupMinutes: { type: Number, default: 0, min: 0 },
    warmupDone: { type: Boolean, default: false },
    finisherMinutes: { type: Number, default: 0, min: 0 },
    finisherDone: { type: Boolean, default: false },

    // Rest day walk
    walkMinutes: { type: Number, default: 0, min: 0 },
    walkDistanceKm: { type: Number, default: 0, min: 0 },

    completedAt: { type: Date, default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export const WorkoutSession = model("WorkoutSession", workoutSessionSchema);
