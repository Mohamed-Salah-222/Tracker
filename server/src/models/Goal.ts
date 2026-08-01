import { Schema, model } from "mongoose";
import { enforceSingleton } from "../lib/schema-guards";

// Singleton-style: only one document expected, but flexible to extend later
const goalSchema = new Schema(
  {
    // Macro daily ceilings
    caloriesTarget: { type: Number, required: true, default: 2000 },
    proteinTarget: { type: Number, required: true, default: 160 },
    carbsTarget: { type: Number, required: true, default: 200 },
    fatTarget: { type: Number, required: true, default: 70 },

    // Water in ml
    waterMin: { type: Number, required: true, default: 2500 },
    waterTarget: { type: Number, required: true, default: 3000 },
    waterMax: { type: Number, required: true, default: 3500 },
  },
  { timestamps: true },
);

enforceSingleton(goalSchema, "Goal");

// The three water numbers describe one band, so they only mean anything in order.
// Out-of-order values would make the dashboard render a target outside its own
// min/max range, so reject them here rather than let a PATCH of one field alone
// leave the band inverted.
goalSchema.pre("validate", function () {
  if (![this.waterMin, this.waterTarget, this.waterMax].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return; // required/cast validators already reported this
  }
  if (this.waterMin > this.waterTarget) {
    this.invalidate("waterMin", "waterMin must be less than or equal to waterTarget", this.waterMin);
  }
  if (this.waterTarget > this.waterMax) {
    this.invalidate("waterMax", "waterMax must be greater than or equal to waterTarget", this.waterMax);
  }
});

export const Goal = model("Goal", goalSchema);
