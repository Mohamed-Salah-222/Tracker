import { Schema, model } from "mongoose";

// A day gets a flag when the user logged an entry below that day's minimum.
// The flag is computed live (not stored). What IS stored is the dismissed state —
// the user clicking "I've made it up, hide the flag."
const dayFlagSchema = new Schema(
  {
    date: { type: Date, required: true, unique: true },
    dismissed: { type: Boolean, default: false },
    dismissedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const DayFlag = model("DayFlag", dayFlagSchema);
