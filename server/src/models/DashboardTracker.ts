import { Schema, model } from "mongoose";

/**
 * One habit's record for one day.
 *
 * `kind` used to be a fixed enum, which made the database the reason a new habit
 * needed a deploy. It is now a free slug validated against the Habit collection at
 * the route layer, so definitions can be created without a schema change. Rows are
 * keyed by it and carry months of history, so a habit's key never changes once made.
 */
type DashboardTrackerDoc = {
  kind: string;
  date: Date;
  checked: boolean;
  amount: number | null;
  state: "done" | "excused" | null;
  /** Free text for the day: what happened, or why it was skipped. */
  note: string;
};

const dashboardTrackerSchema = new Schema<DashboardTrackerDoc>(
  {
    kind: { type: String, required: true, trim: true },
    date: { type: Date, required: true, index: true },
    checked: { type: Boolean, default: false },
    amount: { type: Number, default: null, min: 0 },
    state: { type: String, enum: ["done", "excused", null], default: null },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

dashboardTrackerSchema.index({ kind: 1, date: 1 }, { unique: true });

export const DashboardTracker = model<DashboardTrackerDoc>("DashboardTracker", dashboardTrackerSchema);
