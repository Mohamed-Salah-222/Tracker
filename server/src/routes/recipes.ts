import { Router } from "express";
import { Recipe } from "../models/Recipe";
import { Food } from "../models/Food";
import { MEAL_SLOTS } from "../models/CalorieEntry";
import { logFood, nutritionFor, type FoodDoc, type Meal } from "../lib/log-food";
import { isPositiveNumber, objectIdParam, parseDayUTC, trimmedString } from "../lib/validation";

const router = Router();
router.param("id", objectIdParam);

type ItemInput = { foodId?: unknown; amount?: unknown };

const isMeal = (v: unknown): v is Meal => typeof v === "string" && (MEAL_SLOTS as readonly string[]).includes(v);

/**
 * Ingredients are validated against the live food library, and the response carries
 * each one's current name and macros so the page never has to join them back up.
 */
async function hydrate(recipe: { items: { foodId: unknown; amount: number }[] }) {
  const ids = recipe.items.map((i) => i.foodId);
  const foods = await Food.find({ _id: { $in: ids } });
  const byId = new Map(foods.map((f) => [String(f._id), f as unknown as FoodDoc]));

  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const items = recipe.items.map((i) => {
    const food = byId.get(String(i.foodId));
    if (!food) {
      // The food was archived out from under the recipe. Say so rather than
      // pretending the recipe is still complete.
      return { foodId: String(i.foodId), amount: i.amount, missing: true, name: "Removed food", entryMode: "perGram" as const, unitLabel: "", calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const n = nutritionFor(food, i.amount);
    totals.calories += n.calories;
    totals.protein += n.protein;
    totals.carbs += n.carbs;
    totals.fat += n.fat;
    return { foodId: String(food._id), amount: i.amount, missing: false, name: food.name, entryMode: food.entryMode, unitLabel: food.unitLabel, ...n };
  });

  const round = (v: number) => Math.round(v * 10) / 10;
  return { items, totals: { calories: Math.round(totals.calories), protein: round(totals.protein), carbs: round(totals.carbs), fat: round(totals.fat) } };
}

async function readItems(raw: unknown): Promise<{ items: { foodId: string; amount: number }[] } | { error: string }> {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "a recipe needs at least one food" };
  if (raw.length > 40) return { error: "a recipe can hold at most 40 foods" };

  const items: { foodId: string; amount: number }[] = [];
  for (const entry of raw as ItemInput[]) {
    const foodId = trimmedString(entry?.foodId);
    if (!foodId) return { error: "every ingredient needs a foodId" };
    if (!isPositiveNumber(entry?.amount)) return { error: "every ingredient needs an amount greater than 0" };
    items.push({ foodId, amount: entry.amount as number });
  }

  const found = await Food.countDocuments({ _id: { $in: items.map((i) => i.foodId) }, archived: false });
  if (found !== new Set(items.map((i) => i.foodId)).size) return { error: "one of those foods no longer exists" };
  return { items };
}

router.get("/", async (_req, res) => {
  const recipes = await Recipe.find({ archived: false }).sort({ name: 1 });
  const out = [];
  for (const r of recipes) {
    const { items, totals } = await hydrate(r);
    out.push({ _id: String(r._id), name: r.name, defaultMeal: r.defaultMeal, items, totals });
  }
  res.json(out);
});

router.post("/", async (req, res) => {
  const name = trimmedString(req.body?.name);
  if (!name) return res.status(400).json({ error: "name required" });
  const parsed = await readItems(req.body?.items);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  const defaultMeal = isMeal(req.body?.defaultMeal) ? req.body.defaultMeal : "breakfast";

  const rivals = await Recipe.find({ archived: false }).select({ name: 1 });
  if (rivals.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: `"${name}" already exists` });
  }

  const recipe = await Recipe.create({ name, items: parsed.items, defaultMeal });
  const { items, totals } = await hydrate(recipe);
  res.json({ _id: String(recipe._id), name: recipe.name, defaultMeal: recipe.defaultMeal, items, totals });
});

router.patch("/:id", async (req, res) => {
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return res.status(404).json({ error: "not found" });

  if (req.body?.name !== undefined) {
    const name = trimmedString(req.body.name);
    if (!name) return res.status(400).json({ error: "name required" });
    const rivals = await Recipe.find({ archived: false, _id: { $ne: recipe._id } }).select({ name: 1 });
    if (rivals.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: `"${name}" already exists` });
    }
    recipe.name = name;
  }
  if (req.body?.items !== undefined) {
    const parsed = await readItems(req.body.items);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    recipe.set("items", parsed.items);
  }
  if (req.body?.defaultMeal !== undefined) {
    if (!isMeal(req.body.defaultMeal)) return res.status(400).json({ error: "invalid meal" });
    recipe.defaultMeal = req.body.defaultMeal;
  }

  await recipe.save();
  const { items, totals } = await hydrate(recipe);
  res.json({ _id: String(recipe._id), name: recipe.name, defaultMeal: recipe.defaultMeal, items, totals });
});

router.delete("/:id", async (req, res) => {
  const recipe = await Recipe.findByIdAndDelete(req.params.id);
  if (!recipe) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// =====================================================================
// POST /recipes/:id/log
// The whole point: one tap turns a saved recipe into a calorie entry per food,
// each taking its own macro snapshot and its own bite out of the kitchen.
// =====================================================================
router.post("/:id/log", async (req, res) => {
  const day = parseDayUTC(req.body?.date);
  if (!day) return res.status(400).json({ error: "valid date required" });

  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return res.status(404).json({ error: "not found" });
  const meal: Meal = isMeal(req.body?.meal) ? req.body.meal : recipe.defaultMeal;

  const foods = await Food.find({ _id: { $in: recipe.items.map((i) => i.foodId) }, archived: false });
  const byId = new Map(foods.map((f) => [String(f._id), f as unknown as FoodDoc]));

  const entries = [];
  const shortfalls: { name: string; amount: number; unit: "g" | "unit" }[] = [];
  const skipped: string[] = [];
  for (const item of recipe.items) {
    const food = byId.get(String(item.foodId));
    if (!food) {
      skipped.push(String(item.foodId));
      continue;
    }
    const { entry, shortfall } = await logFood(day, food, meal, item.amount);
    entries.push(entry);
    if (shortfall > 0) shortfalls.push({ name: food.name, amount: shortfall, unit: food.entryMode === "perGram" ? "g" : "unit" });
  }

  if (entries.length === 0) return res.status(400).json({ error: "none of this recipe's foods still exist" });
  res.json({ logged: entries.length, meal, entries, shortfalls, skipped: skipped.length });
});

export default router;
