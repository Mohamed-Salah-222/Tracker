import { Schema, model } from "mongoose";

// `weight` and `reps` are both user-entered per set. The exercise catalog in
// `client/src/lib/workoutProgram.ts` only supplies *target* sets/reps as a hint;
// what is stored here is what was actually lifted.
const setLogSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "WorkoutSession", required: true, index: true },
    exerciseId: { type: String, required: true, index: true }, // refers to a catalog id like "lat-pulldown"
    setNumber: { type: Number, required: true, min: 1 },
    weight: { type: Number, default: null }, // kg, null = not logged
    reps: { type: Number, default: null }, // null = not logged
    /**
     * Rate of perceived exertion, 1-10. Optional. When present it says how many reps
     * were left in reserve (RPE 8 means two more were possible), which makes a set's
     * true difficulty comparable across days and feeds the load suggestion.
     */
    rpe: { type: Number, default: null, min: 1, max: 10 },
    done: { type: Boolean, default: false },
  },
  { timestamps: true },
);

setLogSchema.index({ sessionId: 1, exerciseId: 1, setNumber: 1 }, { unique: true });

export const SetLog = model("SetLog", setLogSchema);
