import { Schema, model } from "mongoose";

const careerTopicSchema = new Schema(
  {
    topicId: { type: String, required: true, unique: true, index: true },
    done: { type: Boolean, default: false },
    notes: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const CareerTopic = model("CareerTopic", careerTopicSchema);
