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

    /**
     * Tape measurements, all optional and all in centimetres. Weight alone cannot
     * tell a lost kilo from a gained one that moved: the waist and the arm can.
     */
    neckCm: { type: Number, default: null, min: 0 },
    chestCm: { type: Number, default: null, min: 0 },
    waistCm: { type: Number, default: null, min: 0 },
    hipsCm: { type: Number, default: null, min: 0 },
    armCm: { type: Number, default: null, min: 0 },
    thighCm: { type: Number, default: null, min: 0 },
    calfCm: { type: Number, default: null, min: 0 },

    note: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const WeightEntry = model("WeightEntry", weightEntrySchema);
