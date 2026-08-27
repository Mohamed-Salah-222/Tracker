import { Schema, model } from "mongoose";

/**
 * A user's edited version of one day template.
 *
 * The catalogue in client/src/lib/workoutSplits.ts holds the defaults. When a day is
 * customised the whole slot list is stored here and replaces the default outright,
 * rather than storing per-slot patches keyed by position, which would silently
 * corrupt if a default template ever changed shape. Deleting the document is
 * "reset to default", and needs no knowledge of what the default was.
 */
const slotSchema = new Schema(
  {
    id: { type: String, required: true, trim: true },
    sets: { type: Number, required: true, min: 1, max: 20 },
    reps: { type: Number, required: true, min: 1, max: 500 },
  },
  { _id: false },
);

const workoutDayPlanSchema = new Schema(
  {
    dayKey: { type: String, required: true, unique: true, trim: true },
    slots: { type: [slotSchema], required: true },
  },
  { timestamps: true },
);

export const WorkoutDayPlan = model("WorkoutDayPlan", workoutDayPlanSchema);
