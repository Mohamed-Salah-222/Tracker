import { Schema, model } from "mongoose";

const timelineDaySchema = new Schema(
  {
    date: { type: Date, required: true, unique: true, index: true },
    templateId: { type: String, required: true, trim: true },
    checkedEventIds: { type: [String], default: [] },
    optionChoices: { type: Map, of: String, default: {} },
  },
  { timestamps: true },
);

export const TimelineDay = model("TimelineDay", timelineDaySchema);
