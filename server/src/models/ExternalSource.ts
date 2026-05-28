import { Schema, model } from "mongoose";

const externalSourceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const ExternalSource = model("ExternalSource", externalSourceSchema);
