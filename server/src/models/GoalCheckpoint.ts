import { Schema, model } from "mongoose";

/**
 * One entry on a goal's timeline.
 *
 * Deliberately one shape for two uses. A checkpoint on an open goal is "here is what
 * I did"; a weekly review is "here is what I did, and here is what should have gone
 * better". The second field is simply left empty in the first case, which is cheaper
 * than two entities that render the same way.
 */
/**
 * A remark added to a checkpoint after the fact.
 *
 * Embedded rather than its own collection: comments only ever exist inside one
 * checkpoint, are read with it, and there will be a handful, not thousands.
 */
const commentSchema = new Schema(
  {
    body: { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);

const goalCheckpointSchema = new Schema(
  {
    goalId: { type: Schema.Types.ObjectId, ref: "Goal2", required: true, index: true },
    date: { type: Date, required: true },
    /** What happened. */
    note: { type: String, default: "", trim: true, maxlength: 2000 },
    /** What should have gone better. Blank unless it is a review. */
    improve: { type: String, default: "", trim: true, maxlength: 2000 },
    /** Where the number stood, for a measurable goal. */
    value: { type: Number, default: null },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true },
);

goalCheckpointSchema.index({ goalId: 1, date: -1 });

goalCheckpointSchema.pre("validate", function () {
  // An entry with nothing in it is noise on the timeline.
  if (!this.note && !this.improve && this.value === null) {
    this.invalidate("note", "write something, or record a number");
  }
});

export const GoalCheckpoint = model("GoalCheckpoint", goalCheckpointSchema);
