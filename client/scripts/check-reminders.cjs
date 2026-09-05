/**
 * Do reminders work?
 *
 * Two halves, because one of them cannot be tested honestly in a headless browser:
 * subscribing to a real push service needs a browser signed in to the vendor's
 * messaging network, and headless Chromium is not. So instead of faking the whole
 * chain and calling it a pass, each half is exercised for real:
 *
 *  1. The service worker's push handler, driven through CDP's deliverPushMessage.
 *     This is the actual worker, the actual payload, and the actual notification, in
 *     a real browser window: headless Chromium has notifications switched off.
 *  2. The scheduler, driven through the API: due-time matching in the subscription's
 *     own timezone, skipping when the thing is already done, and firing once a day
 *     however often the loop runs.
 *
 * What is not covered: the hop between this server and Google's or Apple's push
 * service. That needs a real device, and the Test button in Settings is how you
 * check it.
 *
 * Cleans up its reminders and its stub subscription, including on failure.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../dist");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));
const PORT = 4350;
const API = "http://localhost:5000/api";
const ZONE = "Africa/Cairo";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://l");
  let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, "index.html");
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  r.end(fs.readFileSync(f));
});

const json = (url, options) => fetch(API + url, options).then((r) => r.json());
const post = (url, body) => json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

/**
 * A stub subscription for the scheduler to aim at.
 *
 * Real key material, so web-push actually encrypts and posts it. The endpoint is an
 * FCM address that was never issued, so the push service answers 404 and the server
 * gets to prove it prunes a dead subscription rather than retrying it forever.
 */
const crypto = require("crypto");
const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
const STUB = "https://fcm.googleapis.com/fcm/send/lifetracker-probe-" + crypto.randomBytes(8).toString("hex");
const STUB_KEYS = { p256dh: ecdh.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") };

(async () => {
  let ok = true;
  const created = [];
  const check = (label, pass, detail = "") => {
    console.log((pass ? "  ok   " : "  FAIL ") + label + (detail ? " " + detail : ""));
    if (!pass) ok = false;
  };

  await new Promise((r) => server.listen(PORT, r));
  /**
   * Headed on purpose. In headless Chromium the notification platform is switched
   * off: permissions.query answers "granted" while Notification.permission answers
   * "denied", and showNotification throws. A window opens for a couple of seconds so
   * this half is a real test rather than an assertion about an error message.
   */
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  // Notification permission is granted per origin. Without the origin the context
  // grants it to nothing, and the worker throws when it tries to show anything.
  await context.grantPermissions(["notifications"], { origin: `http://localhost:${PORT}` });

  try {
    const config = await json("/reminders/config");
    check("server has push keys", config.ready === true);

    // ---- 1. the worker's push handler ----
    console.log("\nthe service worker:");
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("ServiceWorker.enable");

    const registrations = [];
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => registrations.push(...e.registrations));
    // A worker that throws inside its push handler should fail this check loudly
    // rather than quietly showing nothing.
    const workerErrors = [];
    cdp.on("ServiceWorker.workerErrorReported", (e) => workerErrors.push(String(e.errorMessage?.errorMessage ?? e.errorMessage)));

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(1500);

    const registration = registrations.find((r) => r.scopeURL.includes(String(PORT)));
    check("worker registered", Boolean(registration), registration ? `(${registration.scopeURL})` : "");

    if (registration) {
      await cdp.send("ServiceWorker.deliverPushMessage", {
        origin: `http://localhost:${PORT}`,
        registrationId: registration.registrationId,
        data: JSON.stringify({ title: "__probe__ push", body: "arrived", url: "/today", tag: "probe" }),
      });
      await page.waitForTimeout(2000);
      // getNotifications asks the registration what it is actually displaying, which
      // is the only view of the worker the page legitimately has.
      const shown = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        const list = await reg.getNotifications();
        return list.map((notification) => ({ title: notification.title, body: notification.body, tag: notification.tag, url: notification.data && notification.data.url }));
      });
      const got = shown.find((notification) => notification.title === "__probe__ push");
      check("the worker handled it without throwing", workerErrors.length === 0, workerErrors.join(" | ").slice(0, 120));
      check("push raises a notification", Boolean(got), `(${shown.length} shown)`);
      if (got) check("with its body, destination and tag", got.body === "arrived" && got.url === "/today" && got.tag === "probe");
    }

    // ---- 2. the scheduler ----
    console.log("\nthe scheduler:");
    await post("/reminders/subscribe", { endpoint: STUB, keys: STUB_KEYS, timezone: ZONE, userAgent: "check-reminders" });

    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const now = `${parts.find((p) => p.type === "hour").value}:${parts.find((p) => p.type === "minute").value}`;
    const later = `${String((Number(now.slice(0, 2)) + 3) % 24).padStart(2, "0")}:${now.slice(3)}`;

    const due = await post("/reminders", { label: "__probe__ due now", body: "b", time: now, condition: null, url: "/today" });
    const notYet = await post("/reminders", { label: "__probe__ hours away", body: "b", time: later, condition: null, url: "/" });
    const satisfied = await post("/reminders", { label: "__probe__ already done", body: "b", time: now, condition: "usage", url: "/" });
    created.push(due._id, notYet._id, satisfied._id);

    const first = await post("/reminders/run", {});
    check("fires the one due this minute", first.sent.includes("__probe__ due now"), `(sent: ${first.sent.join(", ") || "none"})`);
    check("leaves the one due later alone", !first.sent.includes("__probe__ hours away") && !first.skipped.includes("__probe__ hours away"));
    check("skips the one already done", first.skipped.includes("__probe__ already done"), `(skipped: ${first.skipped.join(", ") || "none"})`);

    const second = await post("/reminders/run", {});
    check("a second pass sends nothing again", second.sent.length === 0, `(sent: ${second.sent.join(", ") || "none"})`);

    const stored = (await json("/reminders")).find((r) => r._id === due._id);
    check("the day it went out is recorded", Boolean(stored && stored.lastSentOn));

    const dead = await json("/reminders/config");
    check("the unreachable stub was pruned", dead.devices === 0, `(${dead.devices} left)`);
  } catch (e) {
    ok = false;
    console.log("  FAIL threw:", String(e).slice(0, 160));
  } finally {
    for (const id of created) await fetch(`${API}/reminders/${id}`, { method: "DELETE" }).catch(() => {});
    await post("/reminders/unsubscribe", { endpoint: STUB }).catch(() => {});
    await browser.close();
    server.close();
    console.log("\ncleaned up");
  }

  console.log(ok ? "PASS: the worker shows pushes, and the scheduler fires once, on time, and not when done" : "FAIL");
  process.exit(ok ? 0 : 1);
})();
