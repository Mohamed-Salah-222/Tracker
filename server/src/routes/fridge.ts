import { Router } from "express";
import { FridgeItem } from "../models/FridgeItem";
import { Food } from "../models/Food";
import { isFiniteNumber, isNonNegativeNumber, isObjectId, objectIdParam } from "../lib/validation";
import { pageOf, parsePageParams } from "../lib/pagination";

const router = Router();

router.param("id", objectIdParam);

router.get("/", async (req, res) => {
  const page = parsePageParams(req.query);
  const [items, total] = await Promise.all([
    FridgeItem.find().sort({ count: -1, foodNameSnapshot: 1 }).skip(page.offset).limit(page.limit),
    FridgeItem.countDocuments(),
  ]);
  res.json(pageOf(items, total, page));
});

// Add a new fridge item (or set count if already exists)
router.post("/", async (req, res) => {
  const { foodId, count, note } = req.body;
  if (!isObjectId(foodId)) return res.status(400).json({ error: "invalid foodId" });
  if (!isNonNegativeNumber(count)) {
    return res.status(400).json({ error: "count must be a non-negative number" });
  }
  if (note !== undefined && typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }
  const food = await Food.findById(foodId);
  if (!food || food.archived) return res.status(404).json({ error: "food not found" });
  if (!food.trackInFridge) {
    return res.status(400).json({ error: "this food is not marked for fridge tracking" });
  }

  const item = await FridgeItem.findOneAndUpdate(
    { foodId: food._id },
    {
      foodId: food._id,
      foodNameSnapshot: food.name,
      count,
      ...(typeof note === "string" ? { note } : {}),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json(item);
});

// Update count and/or note
router.patch("/:id", async (req, res) => {
  const { count, note } = req.body;
  if (count !== undefined && !isNonNegativeNumber(count)) {
    return res.status(400).json({ error: "count must be a non-negative number" });
  }
  if (note !== undefined && typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }

  const item = await FridgeItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  if (count !== undefined) item.count = count;
  if (typeof note === "string") item.note = note;
  await item.save();
  res.json(item);
});

// Increment / decrement by delta
router.post("/:id/adjust", async (req, res) => {
  const { delta } = req.body;
  if (!isFiniteNumber(delta)) return res.status(400).json({ error: "delta must be a finite number" });

  const item = await FridgeItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  const next = item.count + delta;
  if (next < 0) return res.status(400).json({ error: "would go below 0" });
  item.count = next;
  await item.save();
  res.json(item);
});

router.delete("/:id", async (req, res) => {
  const item = await FridgeItem.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Helper used by the calorie route to deduct on log
export async function deductOneByFoodId(foodId: string): Promise<boolean> {
  if (!isObjectId(foodId)) return false;
  const item = await FridgeItem.findOne({ foodId });
  if (!item || item.count <= 0) return false;
  item.count -= 1;
  await item.save();
  return true;
}

export default router;
