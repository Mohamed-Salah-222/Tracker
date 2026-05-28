import { Schema, model } from "mongoose";

const weightEntrySchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    weightKg: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const WeightEntry = model("WeightEntry", weightEntrySchema);
