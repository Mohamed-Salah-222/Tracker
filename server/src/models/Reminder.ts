import { Schema, model } from "mongoose";

/**
 * A nudge at a time of day.
 *
 * The app could measure a habit but never ask for one, which is a strange gap in
 * something whose whole job is to be fed every day.
 *
 * Deliberately dumb about scheduling: a time, some days of the week, and a timezone.
 * No snoozing, no escalation, no second attempt. A reminder you did not act on is
 * information; sending it again is nagging.
 */

/**
 * What a reminder can check before it fires.
 *
 * A reminder that goes off after you have already done the thing trains you to ignore
 * it, so every one of these maps to a fact the app already knows about today. Null
 * means always send.
 */
export const REMINDER_CONDITIONS = ["usage", "tasks", "water", "calories", "protein", "sleep", "journal", "workout", "steps"] as const;
export type ReminderCondition = (typeof REMINDER_CONDITIONS)[number];

const reminderSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 60 },
    /** The line that appears under the title. Kept short: notifications truncate. */
    body: { type: String, default: "", trim: true, maxlength: 140 },

    /** Local wall clock, "HH:MM". Matched against the browser's own timezone. */
    time: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    /** 0 is Sunday, matching getUTCDay. Empty means every day. */
    days: { type: [Number], default: [] },

    /** Skipped when this is already true for today. Null sends regardless. */
    condition: { type: String, enum: [...REMINDER_CONDITIONS, null], default: null },

    /** Where tapping it takes you. */
    url: { type: String, default: "/", trim: true, maxlength: 120 },

    enabled: { type: Boolean, default: true },

    /**
     * The local date this last went out, which is what makes the minute-by-minute
     * runner idempotent: a reminder fires once a day however often the loop wakes up
     * inside its minute, and a server restart cannot make it fire twice.
     */
    lastSentOn: { type: String, default: null },
    lastSentAt: { type: Date, default: null },
    /** Counted so the settings page can say whether a reminder is actually working. */
    sentCount: { type: Number, default: 0 },
    lastSkippedReason: { type: String, default: null, maxlength: 80 },
  },
  { timestamps: true },
);

reminderSchema.pre("validate", function () {
  const days = (this.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  this.days = [...new Set(days)].sort();
});

export const Reminder = model("Reminder", reminderSchema);
