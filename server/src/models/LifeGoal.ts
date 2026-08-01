import { Schema, model } from "mongoose";

// Named LifeGoal, not Goal: `Goal` is already taken by the singleton nutrition
// targets document. These are the long-horizon goals shown on the Goals board.
export const GOAL_KINDS = ["project", "money", "weight"] as const;
export const GOAL_TASK_STATUSES = ["planning", "working", "completed"] as const;
// Icon names the client maps to lucide components; kept as a closed list so a
// goal can never render with a missing icon.
export const GOAL_ICONS = ["target", "globe", "dumbbell", "banknote", "scale"] as const;

export type GoalKind = (typeof GOAL_KINDS)[number];
export type GoalTaskStatus = (typeof GOAL_TASK_STATUSES)[number];
export type GoalIcon = (typeof GOAL_ICONS)[number];

const goalTaskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    section: { type: String, default: "" },
    status: { type: String, enum: GOAL_TASK_STATUSES, required: true, default: "planning" },
    done: { type: Boolean, required: true, default: false },
    threadCount: { type: Number, required: true, default: 0, min: 0 },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

// `done` and `status` are two spellings of the same fact and the board reads both.
// Deriving one from the other means they can never disagree.
goalTaskSchema.pre("validate", function () {
  this.done = this.status === "completed";
});

const moneyConfigSchema = new Schema(
  {
    target: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "LE", trim: true },
    // Balance already in the account before any contribution was logged here.
    startingAmount: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

// Deliberately thin: the target weight lives in WeightGoal and the measurements
// live in WeightEntry. This only holds the framing the board needs on top of them.
const weightConfigSchema = new Schema(
  {
    unit: { type: String, required: true, default: "kg" },
    start: { type: Number, default: null, min: 0 },
    targetMin: { type: Number, default: null, min: 0 },
    targetMax: { type: Number, default: null, min: 0 },
    startFat: { type: Number, default: null, min: 0 },
    targetFatMin: { type: Number, default: null, min: 0 },
    targetFatMax: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const lifeGoalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },
    kind: { type: String, enum: GOAL_KINDS, required: true },
    color: { type: String, required: true, default: "#18181b" },
    icon: { type: String, enum: GOAL_ICONS, required: true, default: "target" },
    order: { type: Number, required: true, default: 0 },
    archived: { type: Boolean, required: true, default: false },

    // Only one of these is populated, chosen by `kind`.
    tasks: { type: [goalTaskSchema], default: [] },
    money: { type: moneyConfigSchema, default: null },
    weight: { type: weightConfigSchema, default: null },
  },
  { timestamps: true },
);

// `kind` decides which payload is meaningful. Letting a money goal carry tasks (or
// a project goal carry a target amount) would make every consumer guess which
// branch to render, so the irrelevant payloads must stay empty.
lifeGoalSchema.pre("validate", function () {
  if (this.kind === "money") {
    if (!this.money) this.invalidate("money", "money config is required when kind is money", this.money);
    if (this.weight) this.invalidate("weight", "weight config must be empty when kind is money", this.weight);
    if (this.tasks.length) this.invalidate("tasks", "tasks must be empty when kind is money", this.tasks.length);
  } else if (this.kind === "weight") {
    if (!this.weight) this.invalidate("weight", "weight config is required when kind is weight", this.weight);
    if (this.money) this.invalidate("money", "money config must be empty when kind is weight", this.money);
    if (this.tasks.length) this.invalidate("tasks", "tasks must be empty when kind is weight", this.tasks.length);
  } else if (this.kind === "project") {
    if (this.money) this.invalidate("money", "money config must be empty when kind is project", this.money);
    if (this.weight) this.invalidate("weight", "weight config must be empty when kind is project", this.weight);
  }

  // A target band only means something in order, same rule as the water band on Goal.
  const w = this.weight;
  if (w) {
    if (w.targetMin != null && w.targetMax != null && w.targetMin > w.targetMax) {
      this.invalidate("weight.targetMin", "targetMin must be less than or equal to targetMax", w.targetMin);
    }
    if (w.targetFatMin != null && w.targetFatMax != null && w.targetFatMin > w.targetFatMax) {
      this.invalidate("weight.targetFatMin", "targetFatMin must be less than or equal to targetFatMax", w.targetFatMin);
    }
  }
});

export const LifeGoal = model("LifeGoal", lifeGoalSchema);
