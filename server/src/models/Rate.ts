import { Schema, model } from "mongoose";

const rateSchema = new Schema(
  {
    ratePerMinute: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Rate = model("Rate", rateSchema);
