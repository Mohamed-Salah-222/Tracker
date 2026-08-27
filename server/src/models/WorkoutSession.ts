import { Schema, model } from "mongoose";

export const REST_DAY = "rest";

/**
 * Retired split values. The programme used to be a fixed four-day
 * upperA/lowerA/upperB/lowerB rotation, then a plain upper/lower one. Old documents
 * still carry those values, so they are folded into current day keys on read.
 */
const LEGACY_TYPE_MAP: Record<string, string> = {
  upperA: "upper",
  upperB: "upper",
  lowerA: "lower",
  lowerB: "lower",
};

/**
 * A session's `type` is a day-template key from the split catalogue
 * (client/src/lib/workoutSplits.ts): "push", "legsB", "chestBack", or "rest".
 *
 * It is deliberately not an enum here. The catalogue has 60+ day templates and
 * grows whenever a split is added; mirroring that list server-side would mean two
 * copies drifting apart. Nothing on the server branches on the value except the
 * "rest" sentinel, so a slug check is the honest amount of validation.
 */
export function isValidDayKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(value);
}

export function normalizeWorkoutType(type: string): string {
  return LEGACY_TYPE_MAP[type] ?? type;
}

export function isRestType(type: string): boolean {
  return normalizeWorkoutType(type) === REST_DAY;
}

const workoutSessionSchema = new Schema(
  {
    date: { type: Date, required: true, unique: true, index: true },
    type: { type: String, required: true, trim: true },

    /** Which split this session came from, so history stays readable after a change. */
    splitId: { type: String, default: "" },
    /** Position in that split's cycle, used to suggest the next day. */
    cycleIndex: { type: Number, default: null },

    // Legacy cardio bookend fields kept for existing documents.
    warmupMinutes: { type: Number, default: 0, min: 0 },
    warmupDone: { type: Boolean, default: false },
    finisherMinutes: { type: Number, default: 0, min: 0 },
    finisherDone: { type: Boolean, default: false },

    // Rest day walk (retained for historical rows).
    walkMinutes: { type: Number, default: 0, min: 0 },
    walkDistanceKm: { type: Number, default: 0, min: 0 },

    completedAt: { type: Date, default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export const WorkoutSession = model("WorkoutSession", workoutSessionSchema);
