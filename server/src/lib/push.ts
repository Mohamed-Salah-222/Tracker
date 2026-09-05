import webpush from "web-push";
import { PushSubscription } from "../models/PushSubscription";

/**
 * Sending a notification to every browser that asked for one.
 *
 * VAPID keys identify this server to the browser vendors' push services. The public
 * half is shipped to the client (it has to be, it is the application server key the
 * browser subscribes with); the private half stays in the environment.
 */
let configured = false;

export function pushReady(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT || "mailto:nobody@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export const publicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

export type Payload = {
  title: string;
  body?: string;
  url?: string;
  /** Groups notifications so a repeat replaces the old one instead of stacking. */
  tag?: string;
};

export type SendResult = { sent: number; removed: number; failed: number };

/**
 * Push to every live subscription.
 *
 * A subscription the browser has thrown away answers 404 or 410, and the only correct
 * response is to delete it: retrying a dead endpoint forever is how a push queue turns
 * into a source of noise and rate limits. Anything else is counted, and a subscription
 * that fails five times in a row is retired the same way.
 */
export async function pushToAll(payload: Payload): Promise<SendResult> {
  if (!pushReady()) return { sent: 0, removed: 0, failed: 0 };

  const subs = await PushSubscription.find();
  const result: SendResult = { sent: 0, removed: 0, failed: 0 };

  await Promise.all(
    subs.map(async (sub) => {
      // Mongoose types a nested object as optional even though the schema requires
      // both halves, and a subscription without keys cannot be encrypted to anyway.
      const keys = sub.keys;
      if (!keys?.p256dh || !keys?.auth) {
        await PushSubscription.deleteOne({ _id: sub._id });
        result.removed++;
        return;
      }
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, JSON.stringify(payload), { TTL: 3600 });
        result.sent++;
        if (sub.failures > 0) {
          sub.failures = 0;
          await sub.save();
        }
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          result.removed++;
          return;
        }
        sub.failures += 1;
        result.failed++;
        if (sub.failures >= 5) {
          await PushSubscription.deleteOne({ _id: sub._id });
          result.removed++;
          return;
        }
        await sub.save();
      }
    }),
  );

  return result;
}
