import { Schema, model } from "mongoose";

export const DASHBOARD_TRACKER_KINDS = [
  "sleep",
  "gym",
  "english",
  "vitamins",
  "steps",
  "work",
  "protein",
  "water",
  "calories",
  "tasks",
  "projects",
  "projectGym",
  "projectMedical",
  "workout",
] as const;
export type DashboardTrackerKind = (typeof DASHBOARD_TRACKER_KINDS)[number];

/**
 * The small day-to-day habits the Habits page focuses on. They are ordinary tracker
 * kinds, so ticking one there and ticking it on the dashboard grid write the same
 * row. There is no second source of truth.
 *
 * `projectMedical` and `projectGym` are Prayer and Books. The keys are leftovers from
 * when those two slots meant something else; they carry months of real history, so
 * the keys stay and only the labels describe what they actually are.
 */
export const HABIT_PAGE_KINDS = ["vitamins", "projectMedical", "sleep", "steps", "projectGym", "projects", "english"] as const;
export type HabitPageKind = (typeof HABIT_PAGE_KINDS)[number];

type DashboardTrackerDoc = {
  kind: DashboardTrackerKind;
  date: Date;
  checked: boolean;
  amount: number | null;
  state: "done" | "excused" | null;
  /** Free text for the day: what happened, or why it was skipped. */
  note: string;
};

const dashboardTrackerSchema = new Schema<DashboardTrackerDoc>(
  {
    kind: { type: String, enum: DASHBOARD_TRACKER_KINDS, required: true },
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
