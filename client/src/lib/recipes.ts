// A recipe is a named set of foods logged in one go: "my usual breakfast" as two
// eggs, a slice of toast and 10g of oil.
//
// It stores references and amounts, not a copy of the macros, so correcting a food
// updates every recipe that uses it. The calorie entries it creates take their own
// snapshots at that moment, which is where history belongs.
import { useCallback, useEffect, useState } from "react";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { api } from "./api";

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

export type RecipeItem = {
  foodId: string;
  amount: number;
  missing: boolean;
  name: string;
  entryMode: "perGram" | "perUnit";
  unitLabel: string;
  calories: number;
};

export type Recipe = {
  _id: string;
  name: string;
  defaultMeal: Meal;
  items: RecipeItem[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
};

export type PickerFood = {
  _id: string;
  name: string;
  entryMode: "perGram" | "perUnit";
  unitLabel?: string;
  defaultServingGrams?: number | null;
};

export function recipeError(e: unknown): string {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

/** Grams for a weighed food, pieces for the rest. */
export function amountLabel(item: { amount: number; entryMode: string; unitLabel?: string }): string {
  if (item.entryMode === "perGram") return `${Math.round(item.amount)}g`;
  const n = Number.isInteger(item.amount) ? item.amount : Math.round(item.amount * 10) / 10;
  const label = item.unitLabel || "";
  return label ? `${n} ${label}${n === 1 ? "" : "s"}` : String(n);
}

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const r = await api.get<Recipe[]>("/recipes");
      setRecipes(r.data);
    } catch (e) {
      toast.error(recipeError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { recipes, loading, reload: load };
}
