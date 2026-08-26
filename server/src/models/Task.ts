import { Schema, model } from "mongoose";

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    done: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },

    // The anchor task every day starts with. Flagged rather than matched on its
    // title so renaming or translating it later cannot orphan the record, and so
    // exactly one can exist per day.
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One anchor task per day, enforced by the database rather than by a read-then-write
// race in the route.
taskSchema.index({ date: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

export const DAILY_TASK_TITLE = "Finish all today's Tasks";

export const Task = model("Task", taskSchema);
