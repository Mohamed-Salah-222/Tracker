import { Schema, model, type Model } from "mongoose";

const rateSchema = new Schema(
  {
    ratePerMinute: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// effectiveTo: null means "this is the rate in force right now", and income is
// priced off whichever one of those the lookup happens to return. Two open rates
// would make every logged amount depend on Mongo's sort order, so a new rate can
// only be opened once the previous one has been closed.
rateSchema.pre("validate", async function () {
  if (this.effectiveTo !== null && this.effectiveTo !== undefined) return;
  if (!this.isNew && !this.isModified("effectiveTo")) return;

  const openRates = await (this.constructor as Model<unknown>)
    .countDocuments({ _id: { $ne: this._id }, effectiveTo: null })
    .limit(1);
  if (openRates > 0) {
    this.invalidate("effectiveTo", "another rate is still active — close it before opening a new one", this.effectiveTo);
  }
});

export const Rate = model("Rate", rateSchema);
