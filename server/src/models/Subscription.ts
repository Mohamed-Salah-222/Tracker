import { Schema, model } from "mongoose";

export const SUBSCRIPTION_SOURCE_TYPES = ["wallet", "bank", "external"] as const;

const subscriptionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    sourceType: { type: String, enum: SUBSCRIPTION_SOURCE_TYPES, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    sourceNameSnapshot: { type: String, required: true },
    billingDay: { type: Number, required: true, min: 1, max: 31 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Subscription = model("Subscription", subscriptionSchema);
