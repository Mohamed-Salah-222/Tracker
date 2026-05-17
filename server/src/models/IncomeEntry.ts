import { Schema, model } from "mongoose";

const incomeEntrySchema = new Schema(
  {
    date: { type: Date, required: true, index: true },
    minutes: { type: Number, required: true, min: 0 },
    ratePerMinute: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const IncomeEntry = model("IncomeEntry", incomeEntrySchema);
