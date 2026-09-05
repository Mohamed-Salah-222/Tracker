import { Router } from "express";
import { Reminder, REMINDER_CONDITIONS } from "../models/Reminder";
import { PushSubscription } from "../models/PushSubscription";
import { publicKey, pushReady, pushToAll } from "../lib/push";
import { runDueReminders } from "../lib/reminder-runner";
import { objectIdParam, trimmedString } from "../lib/validation";

const router = Router();
router.param("id", objectIdParam);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** What the client needs before it can subscribe. */
router.get("/config", async (_req, res) => {
  res.json({
    ready: pushReady(),
    publicKey: publicKey(),
    devices: await PushSubscription.countDocuments(),
    conditions: REMINDER_CONDITIONS,
  });
});

// =====================================================================
// POST /reminders/subscribe
// The browser hands over its push endpoint. Re-subscribing with the same endpoint
// updates it rather than making a second one, which is what happens every time the
// service worker updates.
// =====================================================================
router.post("/subscribe", async (req, res) => {
  const { endpoint, keys, timezone, userAgent } = req.body ?? {};
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) return res.status(400).json({ error: "a push endpoint is required" });
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return res.status(400).json({ error: "the subscription keys are missing" });

  const doc = await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      $set: {
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        timezone: typeof timezone === "string" ? timezone.slice(0, 60) : "UTC",
        userAgent: typeof userAgent === "string" ? userAgent.slice(0, 300) : "",
        lastSeenAt: new Date(),
        failures: 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json({ ok: true, id: String(doc._id), devices: await PushSubscription.countDocuments() });
});

router.post("/unsubscribe", async (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
  if (!endpoint) return res.status(400).json({ error: "a push endpoint is required" });
  await PushSubscription.deleteOne({ endpoint });
  res.json({ ok: true, devices: await PushSubscription.countDocuments() });
});

/** Prove the whole chain works, right now, without waiting for a scheduled time. */
router.post("/test", async (_req, res) => {
  if (!pushReady()) return res.status(503).json({ error: "push is not configured on the server" });
  const result = await pushToAll({ title: "LifeTracker", body: "Reminders are working.", url: "/settings", tag: "test" });
  if (result.sent === 0 && result.removed > 0) return res.status(410).json({ error: "the subscription had expired, allow notifications again" });
  if (result.sent === 0) return res.status(400).json({ error: "no device is subscribed on this browser yet" });
  res.json(result);
});

// =====================================================================
// The reminders themselves
// =====================================================================
router.get("/", async (_req, res) => {
  res.json(await Reminder.find().sort({ time: 1, label: 1 }));
});

function readBody(body: Record<string, unknown>): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const value: Record<string, unknown> = {};

  if (body.label !== undefined) {
    const label = trimmedString(body.label);
    if (!label) return { ok: false, error: "give it a name" };
    value.label = label;
  }
  if (body.body !== undefined) value.body = typeof body.body === "string" ? body.body.trim().slice(0, 140) : "";
  if (body.time !== undefined) {
    if (typeof body.time !== "string" || !TIME.test(body.time)) return { ok: false, error: "the time has to look like 21:00" };
    value.time = body.time;
  }
  if (body.days !== undefined) {
    if (!Array.isArray(body.days) || body.days.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6)) {
      return { ok: false, error: "days must be days of the week" };
    }
    value.days = body.days;
  }
  if (body.condition !== undefined) {
    if (body.condition !== null && !(REMINDER_CONDITIONS as readonly string[]).includes(String(body.condition))) {
      return { ok: false, error: "that is not something the app can check" };
    }
    value.condition = body.condition;
  }
  if (body.url !== undefined) {
    const url = typeof body.url === "string" ? body.url.trim() : "/";
    // Only in-app destinations: a notification is not a place to open the web from.
    value.url = url.startsWith("/") ? url.slice(0, 120) : "/";
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return { ok: false, error: "enabled must be true or false" };
    value.enabled = body.enabled;
  }

  return { ok: true, value };
}

router.post("/", async (req, res) => {
  const read = readBody(req.body ?? {});
  if (!read.ok) return res.status(400).json({ error: read.error });
  if (!read.value.label || !read.value.time) return res.status(400).json({ error: "a name and a time are required" });

  try {
    res.json(await Reminder.create(read.value));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "could not save the reminder" });
  }
});

router.patch("/:id", async (req, res) => {
  const read = readBody(req.body ?? {});
  if (!read.ok) return res.status(400).json({ error: read.error });

  const reminder = await Reminder.findById(req.params.id);
  if (!reminder) return res.status(404).json({ error: "not found" });

  Object.assign(reminder, read.value);
  // Changing the time or the days means today has not happened yet at the new one.
  if (read.value.time !== undefined || read.value.days !== undefined) reminder.lastSentOn = null;

  try {
    await reminder.save();
    res.json(reminder);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "could not save the reminder" });
  }
});

router.delete("/:id", async (req, res) => {
  const reminder = await Reminder.findByIdAndDelete(req.params.id);
  if (!reminder) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

/** Run the scheduler now. Used by the checks, and useful when something looks stuck. */
router.post("/run", async (req, res) => {
  const at = typeof req.body?.at === "string" ? new Date(req.body.at) : new Date();
  if (Number.isNaN(at.getTime())) return res.status(400).json({ error: "that is not a time" });
  res.json(await runDueReminders(at));
});

export default router;
