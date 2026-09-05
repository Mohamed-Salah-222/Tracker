import { Router } from "express";
import { TrashItem } from "../models/TrashItem";
import { restoreBatch } from "../lib/trash";

const router = Router();

const BATCH = /^[a-z0-9]{8,32}$/;

/**
 * GET /trash
 * What has been deleted lately, newest first, grouped the way it was deleted.
 */
router.get("/", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const items = await TrashItem.find({ restoredAt: null }).sort({ deletedAt: -1 }).limit(limit * 8);

  const batches = new Map<string, { batch: string; deletedAt: Date; context: string; count: number; labels: string[]; collections: string[] }>();
  for (const item of items) {
    const found = batches.get(item.batch) ?? { batch: item.batch, deletedAt: item.deletedAt, context: item.context, count: 0, labels: [], collections: [] };
    found.count += 1;
    if (item.label && found.labels.length < 3 && !found.labels.includes(item.label)) found.labels.push(item.label);
    if (!found.collections.includes(item.collectionName)) found.collections.push(item.collectionName);
    batches.set(item.batch, found);
  }

  res.json([...batches.values()].slice(0, limit));
});

/** POST /trash/:batch/restore */
router.post("/:batch/restore", async (req, res) => {
  const batch = req.params.batch;
  if (!BATCH.test(batch)) return res.status(400).json({ error: "that is not a batch" });

  const result = await restoreBatch(batch);
  if (result.restored === 0 && result.skipped === 0) return res.status(404).json({ error: "there is nothing to put back" });
  res.json(result);
});

/** Empty the bin. Only offered where the user can see what is in it. */
router.delete("/", async (_req, res) => {
  const removed = await TrashItem.deleteMany({});
  res.json({ ok: true, removed: removed.deletedCount ?? 0 });
});

export default router;
