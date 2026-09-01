import { Schema, model } from "mongoose";

/**
 * A habit definition.
 *
 * These used to be a hardcoded enum plus three lookup maps plus a defaults table,
 * spread over five files, so adding one meant a code change and a deploy. They are
 * rows now, and the pages render whatever is in here.
 *
 * The tick itself still lives in DashboardTracker keyed by `key`, which is why keys
 * are immutable once created: months of history hang off them.
 */
export const HABIT_TYPES = ["check", "count"] as const;
export type HabitType = (typeof HABIT_TYPES)[number];

/**
 * Habits whose value is worked out from another feature rather than ticked. They
 * cannot be deleted or have their type changed: the Workout, Tasks and Calories
 * pages write the underlying data, and a stray edit here would orphan that.
 */
export const DERIVED_SOURCES = ["workout", "tasks", "calories", "protein", "water", "sleep"] as const;
export type DerivedSource = (typeof DERIVED_SOURCES)[number];

const habitSchema = new Schema(
  {
    /** Stable slug. Immutable, because tracker rows reference it. */
    key: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, default: "", trim: true, maxlength: 160 },
    icon: { type: String, default: "circle-check", trim: true, maxlength: 40 },

    type: { type: String, enum: HABIT_TYPES, required: true, default: "check" },
    /** For a counted habit: the number that means the day is done. */
    dailyTarget: { type: Number, default: 0, min: 0 },
    /** What the number is, for display: "steps", "pages", "glasses", "times". */
    unit: { type: String, default: "", trim: true, maxlength: 20 },

    /**
     * How many days this month you mean to do it. 0 means every day, which is what
     * a missing entry silently meant before and was impossible to tell apart from
     * a target you had actually chosen.
     */
    monthlyTarget: { type: Number, default: 0, min: 0 },

    /** Shown on the Habits page. Some rows are grid-only, like Work. */
    onHabitsPage: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    archived: { type: Boolean, default: false },

    derivedFrom: { type: String, enum: [...DERIVED_SOURCES, null], default: null },
  },
  { timestamps: true },
);

habitSchema.index({ archived: 1, order: 1 });

// A counted habit with no target can never be satisfied, so the day would sit
// permanently unfinished with nothing explaining why.
habitSchema.pre("validate", function () {
  if (this.type === "count" && !(this.dailyTarget > 0)) {
    this.invalidate("dailyTarget", "a counted habit needs a daily target above 0", this.dailyTarget);
  }
});

/**
 * Explicit collection name. A "habits" collection already exists holding six
 * documents from an abandoned earlier attempt at this feature: no key, no label, no
 * tracker rows pointing at them, and nothing in the repo has ever read them. Naming
 * this one separately leaves that alone rather than guessing it is safe to clear.
 */
export const Habit = model("Habit", habitSchema, "habitdefinitions");
