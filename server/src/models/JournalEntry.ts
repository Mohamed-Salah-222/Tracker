import { Schema, model } from "mongoose";

/**
 * What happened that day, in your own words.
 *
 * Every other thing in here has somewhere to write: habits have a note per day, tasks
 * have titles, workouts have exercise notes, goals have checkpoints and comments. The
 * day itself had nowhere, so "today was rough because of X" could only be filed under
 * whichever tracker happened to be nearest, or not at all.
 *
 * One entry per day. A second thought on the same day is an edit of the same page,
 * not a new one, which is also what makes the entry safe to look up by date alone.
 */
export const MOODS = ["awful", "low", "fine", "good", "great"] as const;
export type Mood = (typeof MOODS)[number];

const journalEntrySchema = new Schema(
  {
    date: { type: Date, required: true, unique: true },
    body: { type: String, default: "", trim: true, maxlength: 20000 },

    /** Optional, and never inferred from the text or from how the day scored. */
    mood: { type: String, enum: [...MOODS, null], default: null },

    /**
     * Free tags, lowercased on the way in so "Work" and "work" are one tag rather
     * than two that never appear together in a search.
     */
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

// An entry with no words, no mood and no tags is a row nobody asked for, usually
// left behind by opening the editor and closing it again.
journalEntrySchema.methods.isEmpty = function (): boolean {
  return (this.body ?? "").trim() === "" && !this.mood && (this.tags?.length ?? 0) === 0;
};

export const JournalEntry = model("JournalEntry", journalEntrySchema);
