import { Schema, model } from "mongoose";

/**
 * One night's sleep.
 *
 * Filed under the morning you woke up, which is the only reading that does not move
 * when you go to bed after midnight. Times are minutes from midnight rather than
 * timestamps: the question is what the clock said, not which instant it was, so a
 * wall-clock number cannot be shifted by a timezone the way a Date can.
 *
 * Duration is stored as well as derived. It is the field every query sorts, averages
 * and charts, and recomputing (wake - bed + 1440) % 1440 in the aggregation pipeline
 * for every one of those is arithmetic the database should not have to repeat.
 */
export const SLEEP_QUALITIES = [1, 2, 3, 4, 5] as const;

const sleepEntrySchema = new Schema(
  {
    /** The morning of the wake-up, at UTC midnight, like every other date in the app. */
    date: { type: Date, required: true, unique: true },

    /** Minutes past midnight. 23:30 is 1410, 00:30 is 30. */
    bedMinutes: { type: Number, required: true, min: 0, max: 1439 },
    wakeMinutes: { type: Number, required: true, min: 0, max: 1439 },
    /** Wake minus bed, wrapping past midnight. Kept in step by the hook below. */
    minutes: { type: Number, required: true, min: 1, max: 1439 },

    /** 1 to 5, or null when you did not say. Never guessed from the duration. */
    quality: { type: Number, default: null, min: 1, max: 5 },
    note: { type: String, default: "", trim: true, maxlength: 400 },
  },
  { timestamps: true },
);

/** The wrap-around length of a night, in minutes. */
export function nightMinutes(bedMinutes: number, wakeMinutes: number): number {
  return (wakeMinutes - bedMinutes + 1440) % 1440;
}

// Derived from the two times, always, so no write path can leave a length that
// disagrees with the clock it came from.
sleepEntrySchema.pre("validate", function () {
  if (typeof this.bedMinutes === "number" && typeof this.wakeMinutes === "number") {
    const length = nightMinutes(this.bedMinutes, this.wakeMinutes);
    if (length === 0) this.invalidate("wakeMinutes", "the wake time cannot be the same as the bed time");
    else this.minutes = length;
  }
});

export const SleepEntry = model("SleepEntry", sleepEntrySchema);
