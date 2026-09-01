import { Router } from "express";
import { Food, FOOD_CATEGORIES, ENTRY_MODES } from "../models/Food";
import { KitchenItem } from "../models/KitchenItem";
import { Recipe } from "../models/Recipe";
import { buildSearchFilter, isNonNegativeNumber, isPositiveNumber, objectIdParam, trimmedString } from "../lib/validation";
import { pageOf, parsePageParams } from "../lib/pagination";

const router = Router();

router.param("id", objectIdParam);

type FoodCategory = (typeof FOOD_CATEGORIES)[number];
type EntryMode = (typeof ENTRY_MODES)[number];

type PerGramNutrition = {
  mode: "perGram";
  unit: "per100g" | "per1g";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  defaultServingGrams?: number | null;
};

type PerUnitNutrition = {
  mode: "perUnit";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  unitLabel?: string;
};

type NutritionInput = PerGramNutrition | PerUnitNutrition;

function isValidCategory(c: string): c is FoodCategory {
  return (FOOD_CATEGORIES as readonly string[]).includes(c);
}

function isValidEntryMode(m: string): m is EntryMode {
  return (ENTRY_MODES as readonly string[]).includes(m);
}

// Every macro must be a real, non-negative number before it reaches Mongoose:
// NaN/Infinity would otherwise be stored and poison every downstream total.
function validateNutrition(n: NutritionInput): string | null {
  for (const field of ["calories", "protein", "carbs", "fat"] as const) {
    if (!isNonNegativeNumber(n[field])) {
      return `nutrition.${field} must be a non-negative number`;
    }
  }
  if (n.mode === "perGram") {
    if (n.unit !== "per100g" && n.unit !== "per1g") {
      return "nutrition.unit must be per100g or per1g";
    }
    if (n.defaultServingGrams !== undefined && n.defaultServingGrams !== null && !isPositiveNumber(n.defaultServingGrams)) {
      return "nutrition.defaultServingGrams must be a positive number";
    }
  } else if (n.unitLabel !== undefined && typeof n.unitLabel !== "string") {
    return "nutrition.unitLabel must be a string";
  }
  return null;
}

/**
 * Two foods with the same name are indistinguishable in every picker in the app,
 * which sorts by name. Compared in memory rather than with a Mongo regex so a name
 * full of punctuation cannot turn into a pattern.
 */
async function findNameClash(name: string, exceptId?: string) {
  const rivals = await Food.find({ archived: false }).select({ name: 1 });
  const wanted = name.trim().toLowerCase();
  return rivals.find((f) => f.name.trim().toLowerCase() === wanted && String(f._id) !== exceptId) ?? null;
}

function perGramFromNutrition(n: PerGramNutrition) {
  const divisor = n.unit === "per100g" ? 100 : 1;
  return {
    caloriesPerGram: n.calories / divisor,
    proteinPerGram: n.protein / divisor,
    carbsPerGram: n.carbs / divisor,
    fatPerGram: n.fat / divisor,
  };
}

/** Weighed foods with no default serving cannot be logged in one tap. */
const NEEDS_SERVING = { entryMode: "perGram" as const, $or: [{ defaultServingGrams: null }, { defaultServingGrams: 0 }] };

router.get("/", async (req, res) => {
  const { category, search, archived, needsServing } = req.query;
  const filter: Record<string, unknown> = { archived: archived === "1" };
  if (typeof category === "string" && category && category !== "all") filter.category = category;
  const nameFilter = buildSearchFilter(search);
  if (nameFilter) filter.name = nameFilter;
  if (needsServing === "1") Object.assign(filter, NEEDS_SERVING);
  const page = parsePageParams(req.query);
  const [foods, total, byCategory] = await Promise.all([
    Food.find(filter).sort({ category: 1, name: 1 }).skip(page.offset).limit(page.limit),
    Food.countDocuments(filter),
    // The page groups into category sections, so it needs the real size of each one.
    // Counting the rows it happened to load left whole categories reading as empty
    // whenever they fell past the page boundary.
    Food.aggregate<{ _id: string; n: number }>([{ $match: filter }, { $group: { _id: "$category", n: { $sum: 1 } } }]),
  ]);
  const categoryCounts: Record<string, number> = {};
  for (const row of byCategory) categoryCounts[row._id] = row.n;

  // Counted across the whole library, not the current filter, so the chip that
  // offers to fix them can state the real number wherever you are.
  const [needsServingCount, archivedCount] = await Promise.all([
    Food.countDocuments({ archived: false, ...NEEDS_SERVING }),
    Food.countDocuments({ archived: true }),
  ]);
  res.json({ ...pageOf(foods, total, page), categoryCounts, needsServingCount, archivedCount });
});

router.post("/", async (req, res) => {
  const { name, category, nutrition, trackInFridge } = req.body as {
    name: string;
    category: string;
    nutrition: NutritionInput;
    trackInFridge?: boolean;
  };

  const cleanName = trimmedString(name);
  if (!cleanName || !category || !nutrition?.mode) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidCategory(category)) {
    return res.status(400).json({ error: "invalid category" });
  }
  if (!isValidEntryMode(nutrition.mode)) {
    return res.status(400).json({ error: "invalid entry mode" });
  }
  const nutritionError = validateNutrition(nutrition);
  if (nutritionError) {
    return res.status(400).json({ error: nutritionError });
  }

  const clash = await findNameClash(cleanName);
  if (clash) return res.status(409).json({ error: `"${clash.name}" is already in your foods` });

  const tif = !!trackInFridge;

  type FoodDoc = {
    name: string;
    category: FoodCategory;
    entryMode: EntryMode;
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

  let doc: FoodDoc;
  if (nutrition.mode === "perGram") {
    const pg = perGramFromNutrition(nutrition);
    doc = {
      name: cleanName,
      category,
      entryMode: "perGram",
      trackInFridge: tif,
      ...pg,
      defaultServingGrams: nutrition.defaultServingGrams ?? null,
      caloriesPerUnit: 0,
      proteinPerUnit: 0,
      carbsPerUnit: 0,
      fatPerUnit: 0,
      unitLabel: "",
    };
  } else {
    doc = {
      name: cleanName,
      category,
      entryMode: "perUnit",
      trackInFridge: tif,
      caloriesPerGram: 0,
      proteinPerGram: 0,
      carbsPerGram: 0,
      fatPerGram: 0,
      defaultServingGrams: null,
      caloriesPerUnit: nutrition.calories,
      proteinPerUnit: nutrition.protein,
      carbsPerUnit: nutrition.carbs,
      fatPerUnit: nutrition.fat,
      unitLabel: (nutrition.unitLabel ?? "").trim(),
    };
  }

  const food = await Food.create(doc);
  res.json(food);
});

router.patch("/:id", async (req, res) => {
  const { name, category, nutrition, trackInFridge } = req.body as {
    name?: string;
    category?: string;
    nutrition?: NutritionInput;
    trackInFridge?: boolean;
  };

  let cleanName: string | null = null;
  if (name !== undefined) {
    cleanName = trimmedString(name);
    if (!cleanName) return res.status(400).json({ error: "name required" });
    const clash = await findNameClash(cleanName, req.params.id);
    if (clash) return res.status(409).json({ error: `"${clash.name}" is already in your foods` });
  }
  if (category !== undefined && !isValidCategory(category)) {
    return res.status(400).json({ error: "invalid category" });
  }
  if (nutrition) {
    if (!isValidEntryMode(nutrition.mode)) {
      return res.status(400).json({ error: "invalid entry mode" });
    }
    const nutritionError = validateNutrition(nutrition);
    if (nutritionError) {
      return res.status(400).json({ error: nutritionError });
    }
  }

  const food = await Food.findById(req.params.id);
  if (!food || food.archived) return res.status(404).json({ error: "not found" });

  const renamed = !!cleanName && cleanName !== food.name;
  if (cleanName) food.name = cleanName;

  if (category) {
    food.set("category", category);
  }

  if (nutrition) {
    if (nutrition.mode === "perGram") {
      const pg = perGramFromNutrition(nutrition);
      food.set("entryMode", "perGram");
      food.caloriesPerGram = pg.caloriesPerGram;
      food.proteinPerGram = pg.proteinPerGram;
      food.carbsPerGram = pg.carbsPerGram;
      food.fatPerGram = pg.fatPerGram;
      food.defaultServingGrams = nutrition.defaultServingGrams ?? null;
      food.caloriesPerUnit = 0;
      food.proteinPerUnit = 0;
      food.carbsPerUnit = 0;
      food.fatPerUnit = 0;
      food.unitLabel = "";
    } else {
      food.set("entryMode", "perUnit");
      food.caloriesPerUnit = nutrition.calories;
      food.proteinPerUnit = nutrition.protein;
      food.carbsPerUnit = nutrition.carbs;
      food.fatPerUnit = nutrition.fat;
      food.unitLabel = (nutrition.unitLabel ?? "").trim();
      food.caloriesPerGram = 0;
      food.proteinPerGram = 0;
      food.carbsPerGram = 0;
      food.fatPerGram = 0;
      food.defaultServingGrams = null;
    }
  }

  if (typeof trackInFridge === "boolean") food.trackInFridge = trackInFridge;

  await food.save();

  // The kitchen holds a name snapshot so its rows survive a food being archived.
  // A snapshot is right for calorie history, which records what you ate at the time,
  // and wrong for stock, which is a present-tense fact: renaming a food used to
  // leave the shelf labelled with the old name forever.
  if (renamed) await KitchenItem.updateMany({ foodId: food._id }, { $set: { foodNameSnapshot: food.name } });

  res.json(food);
});

/**
 * Only the default serving. Setting it through the full PATCH means resending the
 * whole nutrition block, which is a lot of ceremony for the one field that decides
 * whether a food can be logged in a single tap.
 */
router.patch("/:id/serving", async (req, res) => {
  const { defaultServingGrams } = req.body ?? {};
  const value = defaultServingGrams === null ? null : defaultServingGrams;
  if (value !== null && !isPositiveNumber(value)) {
    return res.status(400).json({ error: "defaultServingGrams must be a positive number, or null to clear it" });
  }

  const food = await Food.findById(req.params.id);
  if (!food) return res.status(404).json({ error: "not found" });
  if (food.entryMode !== "perGram") return res.status(400).json({ error: "only weighed foods have a default serving" });
  food.defaultServingGrams = value;
  await food.save();
  res.json(food);
});

/**
 * Permanent, unlike the archive. Without this the archive only ever grows, and there
 * is no way to clear out a food added by mistake.
 *
 * Calorie history survives untouched: every entry carries its own name and macro
 * snapshots precisely so a food disappearing cannot rewrite what you ate.
 */
router.delete("/:id/permanent", async (req, res) => {
  const food = await Food.findById(req.params.id);
  if (!food) return res.status(404).json({ error: "not found" });
  if (!food.archived) return res.status(400).json({ error: "archive it first" });

  // A recipe left with no ingredients is not a recipe, so it goes too.
  await Recipe.updateMany({ "items.foodId": food._id }, { $pull: { items: { foodId: food._id } } });
  const emptied = await Recipe.deleteMany({ items: { $size: 0 } });
  await KitchenItem.deleteMany({ foodId: food._id });
  await Food.deleteOne({ _id: food._id });

  res.json({ ok: true, recipesRemoved: emptied.deletedCount ?? 0 });
});

/** Undo an archive. The row was never deleted, it was just hidden. */
router.post("/:id/restore", async (req, res) => {
  const food = await Food.findById(req.params.id);
  if (!food) return res.status(404).json({ error: "not found" });
  const clash = await findNameClash(food.name, req.params.id);
  if (clash) return res.status(409).json({ error: `"${clash.name}" already uses that name, so this cannot come back yet` });
  food.archived = false;
  await food.save();
  res.json(food);
});

router.delete("/:id", async (req, res) => {
  const food = await Food.findById(req.params.id);
  if (!food) return res.status(404).json({ error: "not found" });
  food.archived = true;
  await food.save();

  // Stop tracking the stock too. An archived food is unreachable in the UI, so its
  // kitchen row used to sit on the shelf and the to-buy list with no way to clear it,
  // and re-adding the food answered 404. Calorie history is untouched: those rows
  // carry their own snapshots and are a record of what happened.
  const dropped = await KitchenItem.deleteMany({ foodId: food._id });
  res.json({ ok: true, untrackedFromKitchen: dropped.deletedCount ?? 0 });
});

router.get("/categories", (_req, res) => {
  res.json(FOOD_CATEGORIES);
});

export default router;
