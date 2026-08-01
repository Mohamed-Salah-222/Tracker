import { Schema, model } from "mongoose";

// One logged movement against a money goal. The goal's current balance is the
// running total of these plus its startingAmount — never a stored figure, so the
// balance and the log can't drift apart. Negative amounts are deductions.
const goalContributionSchema = new Schema(
  {
    goalId: { type: Schema.Types.ObjectId, ref: "LifeGoal", required: true, index: true },
    date: { type: Date, required: true, index: true },
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (v: number) => Number.isFinite(v) && v !== 0,
        message: "amount must be a non-zero finite number",
      },
    },
    note: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const GoalContribution = model("GoalContribution", goalContributionSchema);
