import { Reminder, type ReminderCondition } from "../models/Reminder";
import { PushSubscription } from "../models/PushSubscription";
import { pushReady, pushToAll } from "./push";
import { dailyFacts } from "./daily-facts";
import { UsageDay } from "../models/UsageDay";
import { dueObjectReminders } from "./object-reminders";
import { loadSettings, type SettingsValues } from "../models/Settings";

/**
 * The clock behind the reminders.
 *
 * Wakes every minute, works out the local time on the devices that are subscribed,
 * and sends whatever is due. Deliberately small: no queue, no worker, no cron
 * expression language. A minute of drift on a reminder to drink water is not a
 * problem worth a scheduler for.
 *
 * Two things keep it honest:
 *  - A reminder records the local date it last went out, so it fires once a day
 *    however many times this loop runs inside its minute, and a restart cannot
 *    double-send.
 *  - A reminder attached to something you have already done today is skipped. A nudge
 *    that arrives after the fact teaches you to ignore the next one.
 */
const EVERY_MS = 60_000;

/** What the clock says in a given IANA zone, as { date: "YYYY-MM-DD", time: "HH:MM", weekday }. */
export function localNow(timezone: string, at = new Date()) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    // An unknown zone must not stop every other reminder from going out.
    return localNow("UTC", at);
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    weekday: weekdays.indexOf(get("weekday")),
  };
}

/**
 * Is `time` inside the window, given that a window may cross midnight?
 *
 * 22:00 to 07:00 is the shape people actually want, and it is the one a naive
 * `from <= t && t < to` gets exactly backwards.
 */
export function inWindow(time: string, from: string, to: string): boolean {
  if (from === to) return false;
  return from < to ? time >= from && time < to : time >= from || time < to;
}

/**
 * Quiet on every device, or not quiet at all.
 *
 * A laptop left in another timezone should not silence the phone in your pocket, so
 * a nudge is only held when it would be the middle of the night everywhere.
 */
async function quietNow(settings: SettingsValues, at: Date): Promise<boolean> {
  if (!settings.quietHours.enabled) return false;
  const subs = await PushSubscription.find().select({ timezone: 1 });
  const zones = [...new Set(subs.map((s) => s.timezone || "UTC"))];
  if (zones.length === 0) return false;
  return zones.every((zone) => inWindow(localNow(zone, at).time, settings.quietHours.from, settings.quietHours.to));
}

/**
 * Has today's version of this already happened?
 *
 * Reads the same day table the dashboard and the badges are built from, so "you have
 * already logged your water" means exactly what it means everywhere else.
 */
export async function conditionMet(condition: ReminderCondition, todayIso: string): Promise<boolean> {
  if (condition === "usage") {
    return Boolean(await UsageDay.findOne({ date: new Date(todayIso + "T00:00:00Z") }));
  }

  const facts = await dailyFacts(todayIso);
  const today = facts.find((f) => f.date === todayIso);
  if (!today) return false;

  switch (condition) {
    case "tasks":
      return today.tasksClean;
    case "water":
      return today.waterHit === true;
    case "calories":
      return today.caloriesHit === true;
    case "protein":
      return today.proteinHit === true;
    case "sleep":
      return today.sleepMinutes !== null;
    case "journal":
      return today.journalWords !== null;
    case "workout":
      return today.trained || today.restDay;
    case "steps":
      return today.stepsHit === true;
    default:
      return false;
  }
}

/** One pass. Exported so a test can run it without waiting for the timer. */
export async function runDueReminders(at = new Date()): Promise<{ checked: number; sent: string[]; skipped: string[] }> {
  const sent: string[] = [];
  const skipped: string[] = [];

  const settings = await loadSettings();
  const objects = await dueObjectReminders(at);

  /**
   * Reminders you set yourself on a record come first, and go out whatever the hour.
   *
   * They are absolute instants, so unlike the scheduled ones they need no timezone and
   * no day-of-week check: the moment has either passed or it has not. Quiet hours do
   * not apply, because you chose the moment.
   */
  for (const item of objects.filter((i) => i.explicit)) {
    const result = await pushToAll({ title: item.title, body: item.body, url: item.url, tag: item.key });
    // Marked either way. A push that could not be delivered is not worth repeating
    // every minute until the end of time.
    await item.markSent();
    if (result.sent > 0) sent.push(item.title);
    else skipped.push(item.title);
  }

  /**
   * The nudges the app worked out for itself.
   *
   * Held rather than dropped during quiet hours: nothing is marked sent, so they go
   * out on the first pass after the window closes. Dropping them would mean a bill due
   * at seven in the morning was silently never mentioned.
   */
  const derivedDue = objects.filter((i) => !i.explicit);
  const quiet = await quietNow(settings, at);
  if (derivedDue.length > 0 && quiet) {
    skipped.push(...derivedDue.map((i) => `${i.title} (quiet hours)`));
  } else if (settings.digestAuto && derivedDue.length > 1) {
    // One buzz rather than four. Four in a second is how an app teaches you to mute it.
    const result = await pushToAll({
      title: `${derivedDue.length} things need you`,
      body: derivedDue.map((i) => i.title).join("\n"),
      url: derivedDue[0].url,
      tag: "digest",
    });
    for (const item of derivedDue) await item.markSent();
    if (result.sent > 0) sent.push(`digest: ${derivedDue.map((i) => i.title).join(", ")}`);
    else skipped.push(`digest: ${derivedDue.map((i) => i.title).join(", ")}`);
  } else {
    for (const item of derivedDue) {
      const result = await pushToAll({ title: item.title, body: item.body, url: item.url, tag: item.key });
      await item.markSent();
      if (result.sent > 0) sent.push(item.title);
      else skipped.push(item.title);
    }
  }

  const reminders = await Reminder.find({ enabled: true });
  if (reminders.length === 0) return { checked: 0, sent, skipped };

  // Every subscribed device votes on what "now" is. In practice they agree, but a
  // laptop left in another timezone should not silence the phone.
  const subs = await PushSubscription.find().select({ timezone: 1 });
  const zones = [...new Set(subs.map((s) => s.timezone || "UTC"))];
  if (zones.length === 0) return { checked: reminders.length, sent, skipped };

  for (const reminder of reminders) {
    const hit = zones.map((zone) => localNow(zone, at)).find((now) => now.time === reminder.time);
    if (!hit) continue;
    if (reminder.days.length > 0 && !reminder.days.includes(hit.weekday)) continue;
    // Already gone out today. This is what makes the minute loop safe to re-enter.
    if (reminder.lastSentOn === hit.date) continue;

    if (reminder.condition) {
      const done = await conditionMet(reminder.condition as ReminderCondition, hit.date);
      if (done) {
        reminder.lastSentOn = hit.date;
        reminder.lastSkippedReason = `already done: ${reminder.condition}`;
        await reminder.save();
        skipped.push(reminder.label);
        continue;
      }
    }

    const result = await pushToAll({
      title: reminder.label,
      body: reminder.body || undefined,
      url: reminder.url || "/",
      tag: `reminder-${String(reminder._id)}`,
    });

    reminder.lastSentOn = hit.date;
    reminder.lastSentAt = new Date();
    reminder.lastSkippedReason = null;
    reminder.sentCount += result.sent;
    await reminder.save();
    sent.push(reminder.label);
  }

  return { checked: reminders.length, sent, skipped };
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startReminderRunner(): void {
  if (timer || !pushReady()) return;
  // Aligned to the top of the minute so a reminder set for 21:00 does not go out at
  // 21:00:47 on one boot and 21:00:03 on the next.
  const delay = 60_000 - (Date.now() % 60_000);
  setTimeout(() => {
    void runDueReminders();
    timer = setInterval(() => {
      void runDueReminders().catch(() => {
        /* one bad pass must not stop the clock */
      });
    }, EVERY_MS);
  }, delay);
}
