import { Schema, model } from "mongoose";

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    done: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Task = model("Task", taskSchema);
