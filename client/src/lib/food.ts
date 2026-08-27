import { AxiosError } from "axios";

// =====================================================================
// Shared food vocabulary for the Calories and Foods pages, which previously
// carried their own copies of every type and formatter.
// =====================================================================

export type EntryMode = "perGram" | "perUnit";
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const FOOD_CATEGORIES = ["protein", "carbs", "fats", "vegetables", "snacks", "drinks", "prepared", "other"] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

export type Food = {
  _id: string;
  name: string;
  category: string;
  entryMode: EntryMode;
  /** Stored field name predates the Fridge -> Kitchen rename. */
  trackInFridge: boolean;
  caloriesPerGram: number;
  proteinPerGram: number;
  carbsPerGram: number;
  fatPerGram: number;
  defaultServingGrams: number | null;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  carbsPerUnit: number;
  fatPerUnit: number;
  unitLabel: string;
};

export type Entry = {
  _id: string;
  date: string;
  foodId: string;
  foodNameSnapshot: string;
  meal: Meal;
  entryMode: EntryMode;
  grams: number | null;
  units: number | null;
  caloriesPerGramSnapshot: number;
  proteinPerGramSnapshot: number;
  carbsPerGramSnapshot: number;
  fatPerGramSnapshot: number;
  caloriesPerUnitSnapshot: number;
  proteinPerUnitSnapshot: number;
  carbsPerUnitSnapshot: number;
  fatPerUnitSnapshot: number;
  unitLabelSnapshot: string;
};

export type Macros = { cal: number; p: number; c: number; f: number };

export const round = (n: number) => Math.round(n);
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

export function shiftDay(iso: string, by: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export function dayShortLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function entryTotals(e: Entry): Macros {
  if (e.entryMode === "perUnit") {
    const n = e.units ?? 0;
    return { cal: n * e.caloriesPerUnitSnapshot, p: n * e.proteinPerUnitSnapshot, c: n * e.carbsPerUnitSnapshot, f: n * e.fatPerUnitSnapshot };
  }
  const g = e.grams ?? 0;
  return { cal: g * e.caloriesPerGramSnapshot, p: g * e.proteinPerGramSnapshot, c: g * e.carbsPerGramSnapshot, f: g * e.fatPerGramSnapshot };
}

/** What one serving of this food costs, for previews and tiles. */
export function foodMacros(food: Food, amount: number): Macros {
  if (food.entryMode === "perUnit") {
    return { cal: amount * food.caloriesPerUnit, p: amount * food.proteinPerUnit, c: amount * food.carbsPerUnit, f: amount * food.fatPerUnit };
  }
  return { cal: amount * food.caloriesPerGram, p: amount * food.proteinPerGram, c: amount * food.carbsPerGram, f: amount * food.fatPerGram };
}

export function foodHeadlineCalories(food: Food): number {
  return food.entryMode === "perUnit" ? round1(food.caloriesPerUnit) : round1(food.caloriesPerGram * 100);
}

export function foodHeadlineUnit(food: Food): string {
  return food.entryMode === "perUnit" ? `per ${food.unitLabel || "unit"}` : "per 100g";
}

export function unitWord(food: Food, n = 1): string {
  const label = food.unitLabel || "unit";
  return n === 1 ? label : `${label}s`;
}

/**
 * The amount a one-tap log would use, or null when the food cannot be logged
 * without asking. Per-gram foods with no default serving fall in the second
 * group, which is most of them, so the UI has to say so rather than fail quietly.
 */
export function quickLogAmount(food: Food): number | null {
  if (food.entryMode === "perUnit") return 1;
  return food.defaultServingGrams && food.defaultServingGrams > 0 ? food.defaultServingGrams : null;
}

export function servingLabel(food: Food): string {
  const amount = quickLogAmount(food);
  if (food.entryMode === "perUnit") return `1 ${unitWord(food)}`;
  return amount ? `${amount}g` : "set a serving";
}

/** Sensible meal for a one-tap log, so a tile does not always land in Breakfast. */
export function mealForNow(now = new Date()): Meal {
  const h = now.getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}
