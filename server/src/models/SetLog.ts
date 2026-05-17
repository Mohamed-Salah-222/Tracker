import { Schema, model } from "mongoose";

const setLogSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "WorkoutSession", required: true, index: true },
    exerciseId: { type: String, required: true, index: true }, // refers to hardcoded id like "lat-pulldown"
    setNumber: { type: Number, required: true, min: 1 },
    weight: { type: Number, default: null }, // kg, null = not logged
    reps: { type: Number, default: null }, // null = not logged
    done: { type: Boolean, default: false },
  },
  { timestamps: true },
);

setLogSchema.index({ sessionId: 1, exerciseId: 1, setNumber: 1 }, { unique: true });

export const SetLog = model("SetLog", setLogSchema);
