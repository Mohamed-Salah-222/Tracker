import { Schema, model } from "mongoose";

const cheatDaySchema = new Schema(
  {
    date: { type: Date, required: true, unique: true, index: true },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export const CheatDay = model("CheatDay", cheatDaySchema);
