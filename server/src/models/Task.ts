import { Schema, model } from "mongoose";

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    done: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },

    /**
     * A time of day, as the clock reads it, or null for "some time today".
     *
     * Separate from the date rather than folded into it: the date is a calendar day
     * the whole app agrees on, and giving it a time would make every existing day
     * comparison depend on when in that day the task happens to sit.
     */
    /**
     * Validated in the route rather than by a `match` here.
     *
     * A pattern in this position has now silently lost its backslashes twice in this
     * codebase, and a broken one either rejects every real value or accepts anything.
     * The route already parses this field and can say what is wrong with it.
     */
    time: { type: String, default: null },

    /**
     * When to be nudged about this one, as an absolute instant.
     *
     * A real moment rather than a wall clock, because the client works it out from
     * the day and time you picked in your own timezone. Nothing downstream has to
     * think about zones, and moving countries cannot shift an alarm you already set.
     */
    remindAt: { type: Date, default: null },
    /** Set once it has gone out, which is what stops it firing every minute after. */
    remindedAt: { type: Date, default: null },

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
