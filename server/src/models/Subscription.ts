import { Schema, model } from "mongoose";
import { CYCLES } from "../lib/recurrence";
import { EXPENSE_CATEGORIES } from "./Expense";

export const SUBSCRIPTION_SOURCE_TYPES = ["wallet", "bank", "external"] as const;

/**
 * Money that goes out on a schedule.
 *
 * This used to be a name, a price and a day of the month, and nothing ever happened
 * on that day: the record existed, the charge did not. Recurring spending is the most
 * predictable money there is and it was the only kind the app could not see coming.
 *
 * `paidThrough` holds the due date that has been settled, not when it was paid. That
 * is what makes charging idempotent: the next one due is simply the first occurrence
 * after it, so pressing the button twice cannot take the money twice.
 */
const subscriptionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },

    sourceType: { type: String, enum: SUBSCRIPTION_SOURCE_TYPES, required: true },
    sourceId: { type: Schema.Types.ObjectId, required: true },
    sourceNameSnapshot: { type: String, required: true },

    cycle: { type: String, enum: CYCLES, required: true, default: "monthly" },
    /** Monthly and yearly: the day of the month. Clamped to short months on read. */
    billingDay: { type: Number, required: true, min: 1, max: 31, default: 1 },
    /** Weekly only. 0 is Sunday. */
    billingWeekday: { type: Number, default: null, min: 0, max: 6 },
    /** Yearly only. */
    billingMonth: { type: Number, default: null, min: 1, max: 12 },

    /** Nothing is owed before this, so adding an old service does not invoice a year. */
    startDate: { type: Date, required: true, default: () => new Date() },
    /** The latest due date already settled. Null means nothing has been charged yet. */
    paidThrough: { type: Date, default: null },

    /** What the charge is filed as when it becomes an expense. */
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true, default: "bills" },
    note: { type: String, default: "", trim: true, maxlength: 200 },

    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// A cycle only means anything with the field that goes with it, and a missing one
// would otherwise silently fall back to the first of the month or to Sunday.
subscriptionSchema.pre("validate", function () {
  if (this.cycle === "weekly" && (this.billingWeekday === null || this.billingWeekday === undefined)) {
    this.invalidate("billingWeekday", "a weekly subscription needs a day of the week");
  }
  if (this.cycle === "yearly" && (this.billingMonth === null || this.billingMonth === undefined)) {
    this.invalidate("billingMonth", "a yearly subscription needs a month");
  }
});

export const Subscription = model("Subscription", subscriptionSchema);
