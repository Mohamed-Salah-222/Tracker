import { Banknote, Dumbbell, Globe2, Scale, Target } from "lucide-react";

// Shapes returned by /api/goals. The goal board used to render from a hardcoded
// array in this file; everything here is now type + presentation glue, and the
// data comes from the server.
export type GoalKind = "project" | "money" | "weight";
export type GoalTaskStatus = "planning" | "working" | "completed";
export type GoalIconKey = "target" | "globe" | "dumbbell" | "banknote" | "scale";

export const GOAL_KINDS: GoalKind[] = ["project", "money", "weight"];

const ICONS: Record<GoalIconKey, typeof Globe2> = {
  target: Target,
  globe: Globe2,
  dumbbell: Dumbbell,
  banknote: Banknote,
  scale: Scale,
};

// The server only ever sends a key from its own closed list, but a goal seeded by
// hand shouldn't render a blank square either.
export function goalIcon(key: string) {
  return ICONS[key as GoalIconKey] ?? Target;
}

export type GoalTask = {
  id: string;
  title: string;
  done: boolean;
  threadCount: number;
  section: string;
  status: GoalTaskStatus;
  order: number;
};

export type MoneyTransaction = {
  id: string;
  date: string;
  amount: number;
  note: string;
};

// Body-composition numbers are optional: a plain weigh-in logged from the
// Calories page has a weight and nothing else.
export type InBodyEntry = {
  id: string;
  date: string;
  weightKg: number;
  fatPct: number | null;
  musclePct: number | null;
  waterPct: number | null;
  boneKg: number | null;
};

export type Goal = {
  id: string;
  title: string;
  subtitle: string;
  kind: GoalKind;
  color: string;
  icon: string;
  percent: number;
  tasks?: GoalTask[];
  money?: {
    current: number;
    target: number;
    currency: string;
    startingAmount: number;
    transactions?: MoneyTransaction[];
  };
  weight?: {
    current: number | null;
    start: number | null;
    target: number;
    targetMin?: number;
    targetMax?: number;
    unit: string;
    fatPct?: number;
    targetFatMin?: number;
    targetFatMax?: number;
    logs?: InBodyEntry[];
  };
};

export function formatMoney(currency: string, value: number) {
  return currency === "$" ? `$${value.toLocaleString("en-US")}` : `${value.toLocaleString("en-US")} ${currency}`;
}
