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

type DashboardTrackerDoc = {
  kind: DashboardTrackerKind;
  date: Date;
  checked: boolean;
  amount: number | null;
  state: "done" | "excused" | null;
};

const dashboardTrackerSchema = new Schema<DashboardTrackerDoc>(
  {
    kind: { type: String, enum: DASHBOARD_TRACKER_KINDS, required: true },
    date: { type: Date, required: true, index: true },
    checked: { type: Boolean, default: false },
    amount: { type: Number, default: null, min: 0 },
    state: { type: String, enum: ["done", "excused", null], default: null },
  },
  { timestamps: true },
);

dashboardTrackerSchema.index({ kind: 1, date: 1 }, { unique: true });

export const DashboardTracker = model<DashboardTrackerDoc>("DashboardTracker", dashboardTrackerSchema);
