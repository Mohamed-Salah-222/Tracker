import { Schema, model } from "mongoose";

/**
 * What was deleted, kept for a while in case it was a mistake.
 *
 * Almost everything in this app says "this cannot be undone" and means it, which is
 * the wrong answer for a thing you touch on a phone every day. A misplaced tap should
 * cost a second, not a night's sleep log.
 *
 * The whole document is kept, including its original `_id`, so a restore puts back
 * exactly what was there rather than a copy that has lost its references.
 */
const trashItemSchema = new Schema(
  {
    /** The collection it came out of, so it can go back to the same place. */
    collectionName: { type: String, required: true },
    documentId: { type: Schema.Types.Mixed, required: true },
    document: { type: Schema.Types.Mixed, required: true },

    /** Something a person can read: "Small Tortilla", "Tuesday's session". */
    label: { type: String, default: "", maxlength: 120 },
    /** What the request was doing, for the list in settings. */
    context: { type: String, default: "", maxlength: 120 },

    /**
     * One delete can remove many rows. They share a batch so undo puts back the whole
     * thing rather than one row of it.
     */
    batch: { type: String, required: true, index: true },

    restoredAt: { type: Date, default: null },
    /** Swept after thirty days. A bin that keeps everything forever is a database. */
    deletedAt: { type: Date, default: () => new Date(), expires: 2_592_000 },
  },
  { versionKey: false },
);

export const TrashItem = model("TrashItem", trashItemSchema, "trashitems");
