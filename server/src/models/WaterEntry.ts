import { Schema, model } from "mongoose";

const waterEntrySchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    ml: { type: Number, required: true, min: 0 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const WaterEntry = model("WaterEntry", waterEntrySchema);
