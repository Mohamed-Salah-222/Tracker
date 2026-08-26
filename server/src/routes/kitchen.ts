import { Router } from "express";
import { KitchenItem, kitchenStatus } from "../models/KitchenItem";
import { Food } from "../models/Food";
import { isFiniteNumber, isNonNegativeNumber, isObjectId, objectIdParam } from "../lib/validation";
import { pageOf, parsePageParams } from "../lib/pagination";

const router = Router();

router.param("id", objectIdParam);

/**
 * Restock-first ordering. The previous sort was `count: -1`, which put the fullest
 * items on page 1 and buried everything at zero on the last page — exactly backwards
 * for a list whose whole job is telling you what to buy.
 */
const RESTOCK_SORT = { count: 1 as const, foodNameSnapshot: 1 as const };

router.get("/", async (req, res) => {
  const page = parsePageParams(req.query);
  const [items, total] = await Promise.all([KitchenItem.find().sort(RESTOCK_SORT).skip(page.offset).limit(page.limit), KitchenItem.countDocuments()]);
  res.json(pageOf(items, total, page));
});

// =====================================================================
// GET /kitchen/low
// Everything at or below its restock line. Feeds the dashboard shopping ring.
// =====================================================================
router.get("/low", async (_req, res) => {
  const items = await KitchenItem.find().sort(RESTOCK_SORT);
  const needing = items.filter((i) => kitchenStatus(i.count, i.lowThreshold) !== "ok");
  res.json({
    tracked: items.length,
    out: needing.filter((i) => i.count <= 0).length,
    low: needing.filter((i) => i.count > 0).length,
    // `name`, matching the shape the dashboard returns, so both consumers read alike.
    items: needing.map((i) => ({
      id: String(i._id),
      name: i.foodNameSnapshot,
      count: i.count,
      lowThreshold: i.lowThreshold,
      status: kitchenStatus(i.count, i.lowThreshold),
    })),
  });
});

// Add an item
router.post("/", async (req, res) => {
  const { foodId, count, lowThreshold, note } = req.body;
  if (!isObjectId(foodId)) return res.status(400).json({ error: "invalid foodId" });
  if (!isNonNegativeNumber(count)) return res.status(400).json({ error: "count must be a non-negative number" });
  if (lowThreshold !== undefined && !isNonNegativeNumber(lowThreshold)) {
    return res.status(400).json({ error: "lowThreshold must be a non-negative number" });
  }
  if (note !== undefined && typeof note !== "string") return res.status(400).json({ error: "note must be a string" });

  const food = await Food.findById(foodId);
  if (!food || food.archived) return res.status(404).json({ error: "food not found" });
  if (!food.trackInFridge) return res.status(400).json({ error: "this food is not marked for kitchen tracking" });

  // Previously an upsert, which silently overwrote the count of an item already
  // being tracked. Adding something you already have is a mistake worth reporting.
  const existing = await KitchenItem.findOne({ foodId: food._id });
  if (existing) return res.status(409).json({ error: `${food.name} is already in your kitchen` });

  const item = await KitchenItem.create({
    foodId: food._id,
    foodNameSnapshot: food.name,
    count,
    lowThreshold: lowThreshold ?? 1,
    note: typeof note === "string" ? note : "",
  });
  res.json(item);
});

// Update count, restock line and/or note
router.patch("/:id", async (req, res) => {
  const { count, lowThreshold, note } = req.body;
  if (count !== undefined && !isNonNegativeNumber(count)) return res.status(400).json({ error: "count must be a non-negative number" });
  if (lowThreshold !== undefined && !isNonNegativeNumber(lowThreshold)) {
    return res.status(400).json({ error: "lowThreshold must be a non-negative number" });
  }
  if (note !== undefined && typeof note !== "string") return res.status(400).json({ error: "note must be a string" });

  const item = await KitchenItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  if (count !== undefined) item.count = count;
  if (lowThreshold !== undefined) item.lowThreshold = lowThreshold;
  if (typeof note === "string") item.note = note;
  await item.save();
  res.json(item);
});

// Increment / decrement
router.post("/:id/adjust", async (req, res) => {
  const { delta } = req.body;
  if (!isFiniteNumber(delta)) return res.status(400).json({ error: "delta must be a finite number" });

  // Atomic, and guarded in the same query: the old read-modify-write could lose an
  // update when the +/- buttons were tapped quickly.
  const filter = delta < 0 ? { _id: req.params.id, count: { $gte: -delta } } : { _id: req.params.id };
  const item = await KitchenItem.findOneAndUpdate(filter, { $inc: { count: delta } }, { returnDocument: "after" });

  if (!item) {
    const exists = await KitchenItem.exists({ _id: req.params.id });
    return exists ? res.status(400).json({ error: "would go below 0" }) : res.status(404).json({ error: "not found" });
  }
  res.json(item);
});

router.delete("/:id", async (req, res) => {
  const item = await KitchenItem.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

export default router;
