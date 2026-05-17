import { Schema, model } from "mongoose";

const dayStatusSchema = new Schema(
  {
    date: { type: Date, required: true, unique: true },
    status: {
      type: String,
      enum: ["vacation", "sick", "holiday"],
      required: true,
    },
    note: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const DayStatus = model("DayStatus", dayStatusSchema);
