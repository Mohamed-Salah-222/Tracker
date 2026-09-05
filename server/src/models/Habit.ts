import { Schema, model } from "mongoose";
import { DEFAULT_SCHEDULE, SCHEDULE_TYPES } from "../lib/habit-schedule";

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
/**
 * When in the day it belongs. Purely for grouping: nothing is enforced, and a habit
 * in the evening block can still be ticked at breakfast. The point is that opening
 * the page in the morning shows the morning rather than a wall of everything.
 */
export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "anytime"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const DERIVED_SOURCES = ["workout", "tasks", "calories", "protein", "water", "sleep"] as const;
export type DerivedSource = (typeof DERIVED_SOURCES)[number];

/**
 * Its own schema rather than a nested object, because a plain object whose first key
 * is called "type" is the one shape Mongoose reads as a type declaration instead of a
 * field. A sub-schema removes the ambiguity.
 */
const scheduleSchema = new Schema(
  {
    type: { type: String, enum: SCHEDULE_TYPES, default: DEFAULT_SCHEDULE.type },
    days: { type: [Number], default: () => [] },
    times: { type: Number, default: DEFAULT_SCHEDULE.times, min: 1, max: 7 },
    n: { type: Number, default: DEFAULT_SCHEDULE.n, min: 2, max: 30 },
    anchor: { type: String, default: null },
  },
  { _id: false },
);

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

    /**
     * Which days the habit is meant to happen on. Defaults to every day, which is
     * what every existing row silently was, so nothing already stored changes meaning.
     */
    schedule: { type: scheduleSchema, default: () => ({}) },

    timeOfDay: { type: String, enum: TIMES_OF_DAY, default: "anytime" },

    /**
     * Paused, not retired. Archiving a habit to survive ten days away loses the thread
     * you were keeping; this holds the days harmless and leaves the history intact.
     * The last paused day, inclusive.
     */
    pausedUntil: { type: Date, default: null },

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
