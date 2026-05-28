import { Schema, model } from "mongoose";

const weightGoalSchema = new Schema(
  {
    targetKg: { type: Number, required: true, default: 100 },
  },
  { timestamps: true },
);

export const WeightGoal = model("WeightGoal", weightGoalSchema);
