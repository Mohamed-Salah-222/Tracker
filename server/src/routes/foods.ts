import { Router } from "express";
import { Food, FOOD_CATEGORIES, ENTRY_MODES } from "../models/Food";

const router = Router();

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

function perGramFromNutrition(n: PerGramNutrition) {
  const divisor = n.unit === "per100g" ? 100 : 1;
  return {
    caloriesPerGram: n.calories / divisor,
    proteinPerGram: n.protein / divisor,
    carbsPerGram: n.carbs / divisor,
    fatPerGram: n.fat / divisor,
  };
}

router.get("/", async (req, res) => {
  const { category, search } = req.query;
  const filter: Record<string, unknown> = { archived: false };
  if (category && category !== "all") filter.category = category;
  if (search) filter.name = { $regex: search as string, $options: "i" };
  const foods = await Food.find(filter).sort({ category: 1, name: 1 });
  res.json(foods);
});

router.post("/", async (req, res) => {
  const { name, category, nutrition, trackInFridge } = req.body as {
    name: string;
    category: string;
    nutrition: NutritionInput;
    trackInFridge?: boolean;
  };

  if (!name?.trim() || !category || !nutrition?.mode) {
    return res.status(400).json({ error: "missing fields" });
  }
  if (!isValidCategory(category)) {
    return res.status(400).json({ error: "invalid category" });
  }
  if (!isValidEntryMode(nutrition.mode)) {
    return res.status(400).json({ error: "invalid entry mode" });
  }

  const tif = !!trackInFridge;
  if (tif && nutrition.mode !== "perUnit") {
    return res.status(400).json({ error: "fridge tracking only valid for per-unit foods" });
  }

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
      name: name.trim(),
      category,
      entryMode: "perGram",
      trackInFridge: false,
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
      name: name.trim(),
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
  const food = await Food.findById(req.params.id);
  if (!food || food.archived) return res.status(404).json({ error: "not found" });

  const { name, category, nutrition, trackInFridge } = req.body as {
    name?: string;
    category?: string;
    nutrition?: NutritionInput;
    trackInFridge?: boolean;
  };

  if (typeof name === "string") food.name = name.trim();

  if (category) {
    if (!isValidCategory(category)) {
      return res.status(400).json({ error: "invalid category" });
    }
    food.set("category", category);
  }

  if (nutrition) {
    if (!isValidEntryMode(nutrition.mode)) {
      return res.status(400).json({ error: "invalid entry mode" });
    }

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
      food.trackInFridge = false; // can't fridge-track per-gram
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

  if (typeof trackInFridge === "boolean") {
    if (trackInFridge && food.entryMode !== "perUnit") {
      return res.status(400).json({ error: "fridge tracking only valid for per-unit foods" });
    }
    food.trackInFridge = trackInFridge;
  }

  await food.save();
  res.json(food);
});

router.delete("/:id", async (req, res) => {
  const food = await Food.findById(req.params.id);
  if (!food) return res.status(404).json({ error: "not found" });
  food.archived = true;
  await food.save();
  res.json({ ok: true });
});

router.get("/categories", (_req, res) => {
  res.json(FOOD_CATEGORIES);
});

export default router;
