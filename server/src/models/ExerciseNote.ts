import { Schema, model } from "mongoose";

/**
 * The user's own note about a movement: machine settings, a grip that works, a
 * niggle to watch. Keyed by movement id, so it follows the exercise across every
 * split and day it appears in.
 */
const exerciseNoteSchema = new Schema(
  {
    movementId: { type: String, required: true, unique: true, trim: true },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export const ExerciseNote = model("ExerciseNote", exerciseNoteSchema);
