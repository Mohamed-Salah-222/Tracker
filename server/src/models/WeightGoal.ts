import { Schema, model } from "mongoose";
import { enforceSingleton } from "../lib/schema-guards";

// Singleton-style: exactly one target weight for the whole app.
const weightGoalSchema = new Schema(
  {
    targetKg: { type: Number, required: true, default: 100 },
  },
  { timestamps: true },
);

enforceSingleton(weightGoalSchema, "WeightGoal");

export const WeightGoal = model("WeightGoal", weightGoalSchema);
