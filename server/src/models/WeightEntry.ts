import { Schema, model } from "mongoose";

const weightEntrySchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    weightKg: { type: Number, required: true, min: 0 },

    // Optional InBody body-composition readings. Null on a plain scale weigh-in,
    // which is why the weight goal board reuses this collection instead of keeping
    // a second, parallel log of the same weights.
    fatPct: { type: Number, default: null, min: 0, max: 100 },
    musclePct: { type: Number, default: null, min: 0, max: 100 },
    waterPct: { type: Number, default: null, min: 0, max: 100 },
    boneKg: { type: Number, default: null, min: 0 },

    note: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const WeightEntry = model("WeightEntry", weightEntrySchema);
