import type { NextFunction, Request, Response } from "express";
import { Schema, model } from "mongoose";

/**
 * Replay protection for writes that were queued offline.
 *
 * A request that leaves the phone in a dead zone can succeed on the server and still
 * look like a failure to the client, because the answer never made it back. The
 * client then retries, and without this the retry creates a second calorie entry, a
 * second expense, a second everything.
 *
 * So every queued write carries a key it generated once. The first time a key is
 * seen the real response is stored against it; a repeat gets that stored response
 * back without the handler running again.
 *
 * Only requests that opt in by sending the header pay for any of this.
 */
const idempotencyKeySchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    status: { type: Number, required: true },
    /** The response body, replayed verbatim. */
    body: { type: Schema.Types.Mixed, default: null },
    /** Swept after a day: a queue older than that has bigger problems. */
    createdAt: { type: Date, default: () => new Date(), expires: 86_400 },
  },
  { versionKey: false },
);

export const IdempotencyKey = model("IdempotencyKey", idempotencyKeySchema, "idempotencykeys");

const HEADER = "x-idempotency-key";
const VALID = /^[A-Za-z0-9_-]{8,80}$/;

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.header(HEADER);
  if (!key || req.method === "GET") return next();
  if (!VALID.test(key)) return res.status(400).json({ error: "malformed idempotency key" });

  const seen = await IdempotencyKey.findOne({ key });
  if (seen) {
    res.setHeader("x-idempotent-replay", "true");
    return res.status(seen.status).json(seen.body);
  }

  // Capture whatever the handler answers, then remember it against the key.
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    // Only successful writes are worth replaying. A 400 should be re-evaluated,
    // not frozen: the data behind it may since have changed.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void IdempotencyKey.create({ key, method: req.method, path: req.path, status: res.statusCode, body }).catch(() => {
        /* a race means another copy of this request won, which is the same outcome */
      });
    }
    return originalJson(body);
  };

  next();
}
