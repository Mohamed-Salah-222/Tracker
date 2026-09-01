import { Router } from "express";
import { KitchenItem, defaultsForUnit, type KitchenUnit } from "../models/KitchenItem";
import { ShoppingItem } from "../models/ShoppingItem";
import { Food } from "../models/Food";
import { RESTOCK_SORT, kitchenSummary } from "../lib/kitchen-summary";
import { isFiniteNumber, isNonNegativeNumber, isObjectId, objectIdParam } from "../lib/validation";
import { pageOf, parsePageParams } from "../lib/pagination";

const router = Router();

router.param("id", objectIdParam);

const isPositive = (v: unknown): v is number => isFiniteNumber(v) && v > 0;

router.get("/", async (req, res) => {
  const page = parsePageParams(req.query);
  const [items, total] = await Promise.all([KitchenItem.find().sort(RESTOCK_SORT).skip(page.offset).limit(page.limit), KitchenItem.countDocuments()]);
  res.json(pageOf(items, total, page));
});

// =====================================================================
// GET /kitchen/summary
// The whole to-buy list plus the counts behind it. The page reads this rather than
// deriving totals from whatever rows it happened to page in.
// =====================================================================
router.get("/summary", async (_req, res) => {
  res.json(await kitchenSummary());
});

// Same payload under the older name.
router.get("/low", async (_req, res) => {
  res.json(await kitchenSummary());
});

// =====================================================================
// Tracked foods
// =====================================================================
router.post("/", async (req, res) => {
  const { foodId, count, lowThreshold, restockTo, stepSize, note } = req.body;
  if (!isObjectId(foodId)) return res.status(400).json({ error: "invalid foodId" });
  if (!isNonNegativeNumber(count)) return res.status(400).json({ error: "count must be a non-negative number" });
  for (const [k, v] of [["lowThreshold", lowThreshold], ["restockTo", restockTo]] as const) {
    if (v !== undefined && !isNonNegativeNumber(v)) return res.status(400).json({ error: `${k} must be a non-negative number` });
  }
  if (stepSize !== undefined && !isPositive(stepSize)) return res.status(400).json({ error: "stepSize must be greater than 0" });
  if (note !== undefined && typeof note !== "string") return res.status(400).json({ error: "note must be a string" });

  const food = await Food.findById(foodId);
  if (!food || food.archived) return res.status(404).json({ error: "food not found" });
  if (!food.trackInFridge) return res.status(400).json({ error: "this food is not marked for kitchen tracking" });

  // Previously an upsert, which silently overwrote the count of an item already
  // being tracked. Adding something you already have is a mistake worth reporting.
  const existing = await KitchenItem.findOne({ foodId: food._id });
  if (existing) return res.status(409).json({ error: `${food.name} is already in your kitchen` });

  const unit: KitchenUnit = food.entryMode === "perGram" ? "g" : "unit";
  const fallback = defaultsForUnit(unit);
  const item = await KitchenItem.create({
    foodId: food._id,
    foodNameSnapshot: food.name,
    count,
    unit,
    unitLabelSnapshot: unit === "unit" ? (food.unitLabel ?? "") : "",
    lowThreshold: lowThreshold ?? fallback.lowThreshold,
    restockTo: restockTo ?? fallback.restockTo,
    stepSize: stepSize ?? fallback.stepSize,
    note: typeof note === "string" ? note : "",
  });
  res.json(item);
});

router.patch("/:id", async (req, res) => {
  const { count, lowThreshold, restockTo, stepSize, note } = req.body;
  for (const [k, v] of [["count", count], ["lowThreshold", lowThreshold], ["restockTo", restockTo]] as const) {
    if (v !== undefined && !isNonNegativeNumber(v)) return res.status(400).json({ error: `${k} must be a non-negative number` });
  }
  if (stepSize !== undefined && !isPositive(stepSize)) return res.status(400).json({ error: "stepSize must be greater than 0" });
  if (note !== undefined && typeof note !== "string") return res.status(400).json({ error: "note must be a string" });

  const item = await KitchenItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  if (count !== undefined) item.count = count;
  if (lowThreshold !== undefined) item.lowThreshold = lowThreshold;
  if (restockTo !== undefined) item.restockTo = restockTo;
  if (stepSize !== undefined) item.stepSize = stepSize;
  if (typeof note === "string") item.note = note;
  await item.save();
  res.json(item);
});

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

// =====================================================================
// POST /kitchen/:id/restock
// One tap for "I bought this": the count jumps to restockTo rather than needing
// twelve presses of + for a dozen eggs.
// =====================================================================
router.post("/:id/restock", async (req, res) => {
  const { to } = req.body;
  if (to !== undefined && !isNonNegativeNumber(to)) return res.status(400).json({ error: "to must be a non-negative number" });

  const item = await KitchenItem.findById(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  const target = to ?? item.restockTo ?? 0;
  // Restocking must never take stock away; you have just come back from the shop.
  item.count = Math.max(item.count, target);
  await item.save();
  res.json(item);
});

router.delete("/:id", async (req, res) => {
  const item = await KitchenItem.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// =====================================================================
// The to-buy list
//
// Only free-text lines live here. Anything low in the kitchen is derived onto the
// list by kitchenSummary rather than copied into it, so restocking an item takes it
// off the list on its own and there is never a stale row to reconcile.
// =====================================================================
const shopping = Router();
shopping.param("sid", objectIdParam);

function readLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t.length <= 120 ? t : null;
}

shopping.get("/", async (_req, res) => {
  res.json(await ShoppingItem.find().sort({ done: 1, createdAt: -1 }));
});

shopping.post("/", async (req, res) => {
  const label = readLabel(req.body?.label);
  if (!label) return res.status(400).json({ error: "label required, up to 120 characters" });
  const qty = typeof req.body?.qty === "string" ? req.body.qty.trim().slice(0, 60) : "";

  // Re-adding something already outstanding should point at the existing line
  // instead of quietly stacking a second "milk". Compared in memory rather than
  // with a Mongo regex so a label full of punctuation cannot become a pattern.
  const open = await ShoppingItem.find({ done: false });
  const clash = open.find((i) => i.label.toLowerCase() === label.toLowerCase());
  if (clash) return res.status(409).json({ error: `"${clash.label}" is already on the list` });

  res.json(await ShoppingItem.create({ label, qty }));
});

shopping.patch("/:sid", async (req, res) => {
  const { label, qty, done } = req.body ?? {};
  if (label !== undefined && readLabel(label) === null) return res.status(400).json({ error: "label required, up to 120 characters" });
  if (qty !== undefined && typeof qty !== "string") return res.status(400).json({ error: "qty must be a string" });
  if (done !== undefined && typeof done !== "boolean") return res.status(400).json({ error: "done must be a boolean" });

  const item = await ShoppingItem.findById(req.params.sid);
  if (!item) return res.status(404).json({ error: "not found" });
  if (label !== undefined) item.label = readLabel(label) as string;
  if (typeof qty === "string") item.qty = qty.trim().slice(0, 60);
  if (typeof done === "boolean") item.done = done;
  await item.save();
  res.json(item);
});

shopping.delete("/:sid", async (req, res) => {
  const item = await ShoppingItem.findByIdAndDelete(req.params.sid);
  if (!item) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

/** Sweep everything already bought off the list in one go. */
shopping.post("/clear-done", async (_req, res) => {
  const r = await ShoppingItem.deleteMany({ done: true });
  res.json({ ok: true, removed: r.deletedCount ?? 0 });
});

router.use("/shopping", shopping);

export default router;
