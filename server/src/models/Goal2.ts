import { Schema, model } from "mongoose";

/**
 * A goal, at one of three horizons.
 *
 * The name is Goal2 only because a Goal model already exists for nutrition targets
 * and renaming that would touch live data; the collection below is named plainly.
 *
 *  lifetime  open ended, no period. "Become an AI engineer", "reach 80kg".
 *  monthly   scoped to one month, and any month: September can be planned in August.
 *  weekly    scoped to one week, for the short review cycle.
 *  custom    an explicit start and end, for anything that does not land on a
 *            calendar boundary. "Finish the course between the 10th and the 28th".
 *
 * A goal may also be measurable, which is a separate axis from the horizon: losing
 * weight is a lifetime goal with a number, reading four books is a monthly goal with
 * a number, and "get better at public speaking" has no number at any horizon.
 */
export const HORIZONS = ["lifetime", "monthly", "weekly", "custom"] as const;
export type Horizon = (typeof HORIZONS)[number];

export const GOAL_STATUSES = ["active", "done", "archived"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

const measureSchema = new Schema(
  {
    /** What the number is: kg, books, hours, pages. */
    unit: { type: String, default: "", trim: true, maxlength: 20 },
    startValue: { type: Number, required: true },
    targetValue: { type: Number, required: true },
  },
  { _id: false },
);

const goal2Schema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    /** The reason. Worth writing down, because it is the part you forget. */
    why: { type: String, default: "", trim: true, maxlength: 500 },

    horizon: { type: String, enum: HORIZONS, required: true, default: "lifetime" },
    /**
     * "2026-09" for a month, "2026-09-01" (the Monday) for a week, null for lifetime.
     * A Monday date rather than an ISO week number: unambiguous, sortable, and it
     * renders as a date without a lookup table.
     */
    periodKey: { type: String, default: null },

    /** An optional deadline for a goal that is otherwise open ended. */
    targetDate: { type: Date, default: null },

    /** The explicit range a custom goal runs over, inclusive at both ends. */
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    measure: { type: measureSchema, default: null },

    status: { type: String, enum: GOAL_STATUSES, required: true, default: "active" },
    completedAt: { type: Date, default: null },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

goal2Schema.index({ status: 1, horizon: 1, periodKey: 1, order: 1 });

goal2Schema.pre("validate", function () {
  if (this.horizon === "lifetime") {
    // A period on an open goal would put it in a bucket it can never leave.
    this.periodKey = null;
    this.startDate = null;
    this.endDate = null;
  } else if (this.horizon === "custom") {
    this.periodKey = null;
    if (!this.startDate || !this.endDate) this.invalidate("startDate", "a custom range needs a start and an end");
    else if (this.startDate > this.endDate) this.invalidate("endDate", "the end cannot come before the start");
  } else {
    this.startDate = null;
    this.endDate = null;
    if (!this.periodKey) this.invalidate("periodKey", `a ${this.horizon} goal needs a period`);
  }
  if (this.measure && this.measure.startValue === this.measure.targetValue) {
    this.invalidate("measure", "the start and the target are the same number, so there is nothing to track");
  }
});

/**
 * Explicit collection name, and not either of the two obvious ones. Mongoose would
 * pluralise this to "goals", which the retired nutrition Goal owns, and "lifegoals"
 * still holds 24 documents from the Goals page that was removed earlier: savings
 * targets, a weight goal and a priced wishlist, in a completely different shape.
 * Both are left alone rather than half-adopted.
 */
export const Goal2 = model("Goal2", goal2Schema, "objectives");
