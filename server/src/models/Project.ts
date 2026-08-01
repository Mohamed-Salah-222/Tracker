import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

export const PROJECT_TICKET_STATUSES = ["todo", "working", "done"] as const;
export type ProjectTicketStatus = (typeof PROJECT_TICKET_STATUSES)[number];

const projectTicketSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: { type: String, enum: PROJECT_TICKET_STATUSES, required: true, default: "todo" },
    threadCount: { type: Number, required: true, default: 0, min: 0 },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    seedKey: { type: String, default: null, index: true },
    order: { type: Number, required: true, default: 0 },
    archived: { type: Boolean, required: true, default: false },
    tickets: { type: [projectTicketSchema], default: [] },
  },
  { timestamps: true },
);

projectSchema.index({ seedKey: 1 }, { unique: true, sparse: true });

export type ProjectDocument = HydratedDocument<InferSchemaType<typeof projectSchema>>;

export const Project = model("Project", projectSchema);
