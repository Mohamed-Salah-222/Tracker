import type { Model, Schema } from "mongoose";

// Some collections hold exactly one configuration document. Mongo has no "at most
// one row" constraint, so a duplicate can only be stopped at write time, otherwise
// a second doc appears and every findOne() in the app silently reads whichever one
// Mongo returns first. Registered as a pre-validate hook so a rejected insert comes
// back as a ValidationError (400) like every other schema violation.
export function enforceSingleton(schema: Schema, label: string): void {
  schema.pre("validate", async function () {
    if (!this.isNew) return;
    const rivals = await (this.constructor as Model<unknown>).countDocuments({ _id: { $ne: this._id } }).limit(1);
    if (rivals > 0) {
      this.invalidate("_id", `${label} is a singleton, a second document may not be created`, this._id);
    }
  });
}
