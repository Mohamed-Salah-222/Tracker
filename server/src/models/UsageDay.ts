import { Schema, model } from "mongoose";

/**
 * A day the app was actually used.
 *
 * Keeping a tracker is itself a habit, and it was the one habit nothing measured. This
 * is the record behind that: one document per day, created the first time the app is
 * opened or written to on that day and touched again on every later action.
 *
 * The date is the user's local calendar day, sent by the client, not the server's UTC
 * day. A streak is about days as people live them, and marking a Cairo evening as the
 * following day would break a run that never actually broke.
 */
const usageDaySchema = new Schema(
  {
    date: { type: Date, required: true, unique: true },

    /** How many actions landed that day. A rough measure of a light day against a busy one. */
    actions: { type: Number, default: 0, min: 0 },

    /**
     * Which parts of the app were touched, as route prefixes. Kept for the
     * page-specific badges that come later, so that history exists by the time they
     * are built rather than starting from the day they ship.
     */
    areas: { type: [String], default: [] },

    /** Set when the day was recorded by the one-time backfill rather than lived through. */
    backfilled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const UsageDay = model("UsageDay", usageDaySchema);
