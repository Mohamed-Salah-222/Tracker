// Writing a calorie entry, in one place.
//
// Logging a food does two things at once: it records what was eaten and it takes
// the amount off the kitchen shelf. Recipes log several foods in one go and have to
// do exactly the same two things, so the logic lives here instead of being copied.
import type { Types } from "mongoose";
import { CalorieEntry, MEAL_SLOTS } from "../models/CalorieEntry";
import { KitchenItem } from "../models/KitchenItem";

/** Spelled out rather than inferred from the model: Mongoose's document type does
 *  not survive ReturnType, and a hydrated Food satisfies this structurally. */
export type FoodDoc = {
  _id: Types.ObjectId;
  name: string;
  entryMode: "perGram" | "perUnit";
  trackInFridge: boolean;
  caloriesPerGram: number;
  proteinPerGram: number;
  carbsPerGram: number;
  fatPerGram: number;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  carbsPerUnit: number;
  fatPerUnit: number;
  unitLabel: string;
};

/**
 * Take an amount off the shelf. Amount means pieces for a per-unit food and grams
 * for a per-gram one. The shortfall is returned rather than swallowed: quietly
 * taking whatever was there left the count wrong with nothing said about it.
 */
export async function deductFromKitchen(food: FoodDoc, amount: number): Promise<{ deducted: number; shortfall: number }> {
  if (!food.trackInFridge) return { deducted: 0, shortfall: 0 };
  const item = await KitchenItem.findOne({ foodId: food._id });
  if (!item) return { deducted: 0, shortfall: 0 };
  const deducted = Math.min(amount, item.count);
  if (deducted > 0) {
    item.count -= deducted;
    await item.save();
  }
  return { deducted, shortfall: Math.max(0, amount - deducted) };
}

type EntryDoc = InstanceType<typeof CalorieEntry>;
export type LoggedResult = { entry: EntryDoc; shortfall: number };

/** One entry for one food. `amount` is units or grams, matching the food's mode. */
export type Meal = (typeof MEAL_SLOTS)[number];

export async function logFood(day: Date, food: FoodDoc, meal: Meal, amount: number): Promise<LoggedResult> {
  const { deducted, shortfall } = await deductFromKitchen(food, amount);

  const common = { date: day, foodId: food._id, foodNameSnapshot: food.name, meal, fridgeDeductedAtLog: deducted };
  const entry =
    food.entryMode === "perUnit"
      ? await CalorieEntry.create({
          ...common,
          entryMode: "perUnit",
          units: amount,
          caloriesPerUnitSnapshot: food.caloriesPerUnit,
          proteinPerUnitSnapshot: food.proteinPerUnit,
          carbsPerUnitSnapshot: food.carbsPerUnit,
          fatPerUnitSnapshot: food.fatPerUnit,
          unitLabelSnapshot: food.unitLabel,
        })
      : await CalorieEntry.create({
          ...common,
          entryMode: "perGram",
          grams: amount,
          caloriesPerGramSnapshot: food.caloriesPerGram,
          proteinPerGramSnapshot: food.proteinPerGram,
          carbsPerGramSnapshot: food.carbsPerGram,
          fatPerGramSnapshot: food.fatPerGram,
        });

  return { entry, shortfall };
}

/** What one amount of a food contributes, for showing a recipe's totals. */
export function nutritionFor(food: FoodDoc, amount: number) {
  const per = food.entryMode === "perUnit";
  return {
    calories: (per ? food.caloriesPerUnit : food.caloriesPerGram) * amount,
    protein: (per ? food.proteinPerUnit : food.proteinPerGram) * amount,
    carbs: (per ? food.carbsPerUnit : food.carbsPerGram) * amount,
    fat: (per ? food.fatPerUnit : food.fatPerGram) * amount,
  };
}
