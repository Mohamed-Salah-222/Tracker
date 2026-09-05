import { AsyncLocalStorage } from "node:async_hooks";
import mongoose, { type Schema } from "mongoose";
import type { NextFunction, Request, Response } from "express";
import { TrashItem } from "../models/TrashItem";

/**
 * Undo, done once instead of twenty seven times.
 *
 * Every delete in this app went straight through to the database, and every dialog
 * said so. Rather than teaching each of those places to keep a copy, the copy is
 * taken underneath them: a Mongoose plugin catches deletes on every model, and a
 * piece of request context ties the rows removed by one request into one batch.
 *
 * The request then answers with the batch id in a header, which is all the client
 * needs to offer an Undo without any page knowing this exists.
 */
type DeleteContext = { batch: string; count: number; label: string; context: string };

const store = new AsyncLocalStorage<DeleteContext>();

/**
 * Collections that are their own bookkeeping, or churn constantly. Keeping deleted
 * copies of these would fill the bin with things nobody would ever restore.
 */
const NEVER_TRASHED = new Set(["trashitems", "idempotencykeys", "pushsubscriptions", "usagedays", "appsettings"]);

/** More than this in one request is a sweep, not a mistake, and is not worth keeping. */
const MAX_PER_REQUEST = 500;

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** A human-readable name for whatever this document is. */
function labelFor(doc: Record<string, unknown>): string {
  for (const field of ["name", "title", "label", "foodNameSnapshot", "key"]) {
    const value = doc[field];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  if (doc.date instanceof Date) return doc.date.toISOString().slice(0, 10);
  return "";
}

async function keep(collectionName: string, doc: Record<string, unknown> | null | undefined) {
  if (!doc || !doc._id) return;
  if (NEVER_TRASHED.has(collectionName)) return;

  const ctx = store.getStore();
  // Deletes that happen outside a request are migrations and cleanups, not mistakes.
  if (!ctx) return;
  if (ctx.count >= MAX_PER_REQUEST) return;
  ctx.count += 1;

  await TrashItem.create({
    collectionName,
    documentId: doc._id,
    document: doc,
    label: labelFor(doc),
    context: ctx.context,
    batch: ctx.batch,
  }).catch(() => {
    /* the bin failing must never stop the delete the user asked for */
  });
}

/**
 * Applied to every schema before any model is compiled.
 *
 * `findOneAndDelete` hands the document to its post hook. `deleteOne` and `deleteMany`
 * as queries do not, so the matching documents are read in the pre hook while they
 * still exist.
 */
export function trashPlugin(schema: Schema) {
  schema.post("findOneAndDelete", async function (doc: Record<string, unknown> | null) {
    await keep(this.model.collection.collectionName, doc);
  });

  for (const op of ["deleteOne", "deleteMany"] as const) {
    schema.pre(op, { query: true, document: false }, async function () {
      const collectionName = this.model.collection.collectionName;
      if (NEVER_TRASHED.has(collectionName) || !store.getStore()) return;
      const docs = await this.model.find(this.getFilter()).limit(MAX_PER_REQUEST).lean();
      for (const doc of docs) await keep(collectionName, doc as Record<string, unknown>);
    });
  }
}

/** Installed before the models are imported, or their schemas miss the hooks. */
export function installTrash(): void {
  mongoose.plugin(trashPlugin);
}

/**
 * Wraps one request so anything it deletes belongs to one undoable batch.
 *
 * The header goes out with the response, so the client can offer Undo without the
 * page it happened on knowing anything about any of this.
 */
export function trashScope(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "DELETE" && !(req.method === "POST" && req.path.includes("permanent"))) return next();

  const ctx: DeleteContext = { batch: newId(), count: 0, label: "", context: `${req.method} ${req.path}`.slice(0, 120) };

  const finish = <T>(send: (body: T) => Response, body: T) => {
    if (ctx.count > 0 && !res.headersSent) {
      res.setHeader("x-trash-batch", ctx.batch);
      res.setHeader("x-trash-count", String(ctx.count));
    }
    return send(body);
  };

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => finish(originalJson, body);

  store.run(ctx, () => next());
}

export type RestoreResult = { restored: number; skipped: number; collections: string[] };

/**
 * Put a batch back.
 *
 * Reinserted through the driver rather than a model: the document is being returned
 * exactly as it was, and running it back through validation would reject anything
 * saved before a schema changed, which is precisely the history most worth keeping.
 */
export async function restoreBatch(batch: string): Promise<RestoreResult> {
  const items = await TrashItem.find({ batch, restoredAt: null });
  const result: RestoreResult = { restored: 0, skipped: 0, collections: [] };
  const db = mongoose.connection.db;
  if (!db || items.length === 0) return result;

  for (const item of items) {
    try {
      const collection = db.collection(item.collectionName);
      const exists = await collection.findOne({ _id: item.documentId });
      if (exists) {
        result.skipped++;
      } else {
        await collection.insertOne(item.document as never);
        result.restored++;
        if (!result.collections.includes(item.collectionName)) result.collections.push(item.collectionName);
      }
      item.restoredAt = new Date();
      await item.save();
    } catch {
      result.skipped++;
    }
  }

  return result;
}
