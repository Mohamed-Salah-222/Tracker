import { Schema, model } from "mongoose";

/**
 * One browser that has agreed to be notified.
 *
 * A push subscription belongs to a browser on a device, not to a person: the phone
 * and the laptop each get their own, and installing the app to the home screen makes
 * a third. So reminders fan out to every live subscription rather than to "the user".
 *
 * The endpoint is the identity. It is a long URL at the browser vendor's push service
 * and it is what a re-subscription changes, so it carries the unique index.
 */
const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },

    /** Whatever the browser said about itself, so a stale device can be recognised. */
    userAgent: { type: String, default: "", maxlength: 300 },
    /** The browser's IANA zone, so a 9pm reminder means 9pm where the phone is. */
    timezone: { type: String, default: "UTC", maxlength: 60 },

    lastSeenAt: { type: Date, default: () => new Date() },
    /**
     * Consecutive send failures. A subscription that has gone away answers 404 or 410
     * and is deleted outright; anything else is counted so a run of soft failures can
     * retire it rather than retrying forever.
     */
    failures: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PushSubscription = model("PushSubscription", pushSubscriptionSchema, "pushsubscriptions");
