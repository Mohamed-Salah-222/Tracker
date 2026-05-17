import { Schema, model } from "mongoose";

export const WORKOUT_TYPES = ["A", "B", "rest"] as const;

const workoutSessionSchema = new Schema(
  {
    date: { type: Date, required: true, unique: true, index: true },
    type: { type: String, enum: WORKOUT_TYPES, required: true },

    // Cardio bookends (only for A/B)
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
