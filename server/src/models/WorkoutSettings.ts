import { Schema, model } from "mongoose";
import { enforceSingleton } from "../lib/schema-guards";

/** Which split the user follows. One document, created on first read. */
const workoutSettingsSchema = new Schema(
  {
    splitId: { type: String, required: true, default: "UPPER_LOWER_2", trim: true },

    /**
     * Sessions with no progress at all before the app says something. Two tiers so
     * noticing and prescribing are separate events: the first is information, the
     * second suggests backing off. Both configurable because the right number
     * depends on how often a movement is trained.
     */
    stallNoticeSessions: { type: Number, required: true, default: 3, min: 2, max: 12 },
    stallDeloadSessions: { type: Number, required: true, default: 5, min: 2, max: 20 },
    /** Set once the user has actually chosen, so the page knows to show the picker. */
    chosenAt: { type: Date, default: null },
  },
  { timestamps: true },
);

enforceSingleton(workoutSettingsSchema, "WorkoutSettings");

export const WorkoutSettings = model("WorkoutSettings", workoutSettingsSchema);

export async function loadWorkoutSettings() {
  return (await WorkoutSettings.findOne()) ?? (await WorkoutSettings.create({}));
}
