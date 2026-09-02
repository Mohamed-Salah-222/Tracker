import { Schema, model } from "mongoose";

/**
 * A badge that has been earned, and when.
 *
 * Only earned badges are stored. What badges exist lives in code (lib/badges.ts), so
 * the catalogue can grow without a migration and a badge nobody has reached yet costs
 * nothing to describe.
 *
 * Earning is permanent. A month-long run that later breaks still happened, and taking
 * the badge back would make the whole idea worthless: the point is the record of what
 * you did, not a display of what you are currently doing.
 */
const earnedBadgeSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    earnedAt: { type: Date, required: true, default: () => new Date() },

    /** The local day it was earned on, for showing it against the timeline. */
    earnedOn: { type: String, required: true, trim: true },

    /** What the number was at the moment it was reached, for the wording on the card. */
    value: { type: Number, default: null },
  },
  { timestamps: true },
);

export const EarnedBadge = model("EarnedBadge", earnedBadgeSchema);
