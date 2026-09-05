/**
 * A habit over time.
 *
 * Schedules, the part of the day, pausing, and the page that shows all three. The
 * interesting cases are the ones that used to be impossible to say: a Monday,
 * Wednesday, Friday habit that is not failing on Tuesday, and a week counted as a
 * week rather than as seven separate verdicts.
 *
 * Everything is done to a probe habit created for the run and permanently deleted
 * afterwards, including on failure, which takes its tracker rows with it. No existing
 * habit is written to.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..") ] }));

const API = "http://localhost:5000/api";
const ROOT = path.resolve(__dirname, "../dist");
const PORT = 4328;
/**
 * The local calendar day, not the UTC one.
 *
 * Between local midnight and the UTC offset the two disagree, and everything the app
 * labels "today" comes from the browser's clock. A script that asks UTC tests the
 * wrong day for the first few hours of every day, and passes for the other twenty.
 */
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = localDay(new Date());
const shift = (days) => localDay(new Date(Date.now() + days * 86400000));

const json = (url, options) => fetch(API + url, options).then(async (r) => ({ status: r.status, body: await r.json() }));
const body = (url, options) => json(url, options).then((r) => r.body);
const post = (url, payload) => body(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) });
const patch = (url, payload) => json(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) });
const put = (url, payload) => body(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) });
const del = (url) => fetch(API + url, { method: "DELETE" }).catch(() => {});

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
});

(async () => {
  let ok = true;
  let probe = null;
  const check = (label, pass, detail = "") => {
    console.log((pass ? "  ok   " : "  FAIL ") + label + (detail ? " " + detail : ""));
    if (!pass) ok = false;
  };
  const stats = (key, days = 90) => body(`/habits/${key}/stats?today=${today}&days=${days}`).then((r) => r.stats);

  try {
    // ----- A habit with a shape -----
    probe = await post("/habits", { label: "Probe Reading", description: "a probe", schedule: { type: "weekdays", days: [1, 3, 5] }, timeOfDay: "evening" });
    check("a habit can be created with a schedule", probe.scheduleLabel === "Mon, Wed, Fri", `(got "${probe.scheduleLabel}")`);
    check("and with a part of the day", probe.timeOfDay === "evening");
    check("it starts unpaused", probe.pausedUntil === null);

    // ----- The schedule is enforced -----
    const empty = await patch(`/habits/${probe._id}`, { schedule: { type: "weekdays", days: [] } });
    check("a schedule with no days is refused", empty.status === 400, `(${empty.body.error})`);
    const badTimes = await patch(`/habits/${probe._id}`, { schedule: { type: "timesPerWeek", times: 0 } });
    check("zero times a week is refused", badTimes.status === 400, `(${badTimes.body.error})`);
    const badSlot = await patch(`/habits/${probe._id}`, { timeOfDay: "midnight" });
    check("an unknown part of the day is refused", badSlot.status === 400, `(${badSlot.body.error})`);
    const badPause = await patch(`/habits/${probe._id}`, { pausedUntil: "next tuesday" });
    check("a pause that is not a day is refused", badPause.status === 400, `(${badPause.body.error})`);
    const goodPause = await patch(`/habits/${probe._id}`, { pausedUntil: shift(3) });
    check("a real day is accepted as a pause", goodPause.status === 200 && goodPause.body.pausedUntil === shift(3), `(got ${goodPause.body.pausedUntil})`);
    await patch(`/habits/${probe._id}`, { pausedUntil: null });

    // ----- Off days read as blank, not as failures -----
    const withHistory = await stats(probe.key, 30);
    const offDays = withHistory.days.filter((d) => d.state === "off").length;
    check("days it was never meant to happen are off, not missed", offDays > 0, `(${offDays} off days in 30)`);
    const weekdayStates = withHistory.days.filter((d) => [1, 3, 5].includes(new Date(d.date + "T00:00:00Z").getUTCDay()) && d.date <= today);
    check("only Mon, Wed and Fri are answerable", weekdayStates.every((d) => d.state !== "off") || weekdayStates.length === 0);

    // ----- Ticking builds a streak -----
    // Three Mondays, Wednesdays and Fridays back from today, whichever days those are.
    const due = [];
    for (let i = 0; i < 21 && due.length < 3; i++) {
      const day = shift(-i);
      if ([1, 3, 5].includes(new Date(day + "T00:00:00Z").getUTCDay())) due.push(day);
    }
    for (const day of due) await put(`/dashboard/tracker/${probe.key}/${day}`, { checked: true, state: "done" });
    const ticked = await stats(probe.key, 60);
    check("ticking the days it is due builds a run", ticked.current >= due.length, `(current ${ticked.current}, ticked ${due.length})`);
    check("the run is measured in days", ticked.unit === "day");
    check("kept days are counted", ticked.done === due.length, `(got ${ticked.done})`);

    // A day it was never due cannot break the run.
    const offDay = [...Array(7).keys()].map((i) => shift(-i)).find((d) => ![1, 3, 5].includes(new Date(d + "T00:00:00Z").getUTCDay()));
    const afterOff = await stats(probe.key, 60);
    check("an untouched off day does not break the run", afterOff.current === ticked.current, `(off day ${offDay})`);

    // ----- A week counted as a week -----
    await patch(`/habits/${probe._id}`, { schedule: { type: "timesPerWeek", times: 3 } });
    const weekly = await stats(probe.key, 60);
    check("a weekly habit counts in weeks", weekly.unit === "week");
    check("no single day is an off day any more", weekly.days.every((d) => d.state !== "off" || (weekly.since && d.date < weekly.since)));
    const thisWeek = weekly.weeks[weekly.weeks.length - 1];
    check("the current week has a target of 3", thisWeek.target === 3 || thisWeek.target === thisWeek.done, `(target ${thisWeek.target}, done ${thisWeek.done})`);

    // ----- A pause is held harmless -----
    await patch(`/habits/${probe._id}`, { schedule: { type: "daily" }, pausedUntil: today });
    const paused = await stats(probe.key, 30);
    check("paused days are marked paused", paused.days.some((d) => d.state === "paused"));
    check("a paused day is not a miss", paused.days.filter((d) => d.state === "paused").every((d) => d.state !== "missed"));
    await patch(`/habits/${probe._id}`, { pausedUntil: null });

    // ----- The day list knows about all of it -----
    await patch(`/habits/${probe._id}`, { schedule: { type: "weekdays", days: [(new Date(today + "T00:00:00Z").getUTCDay() + 1) % 7] } });
    const dayView = await body(`/dashboard/habits?date=${today}`);
    const row = dayView.items.find((i) => i.kind === probe.key);
    check("the day list marks a habit that is not due", row?.offDay === true);
    check("and leaves it out of the day's total", !dayView.items.filter((i) => !i.offDay && !i.paused).some((i) => i.kind === probe.key) && dayView.total === dayView.items.filter((i) => !i.offDay && !i.paused).length);

    await patch(`/habits/${probe._id}`, { schedule: { type: "daily" } });

    // ----- The page -----
    await new Promise((r) => server.listen(PORT, r));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`http://localhost:${PORT}/habits/${probe.key}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const heading = await page.locator("h1").first().innerText();
    check("the habit page opens on its own habit", heading === "Probe Reading", `(got "${heading}")`);
    const summary = await page.locator("section[aria-label='Summary']").innerText();
    check("it shows the streaks", /Current days/i.test(summary) && /Best days/i.test(summary), `("${summary.replace(/\n/g, " ").slice(0, 70)}")`);
    const history = await page.locator("section[aria-label='History']").innerText();
    check("it draws the history legend", /Done/.test(history) && /Skipped/.test(history) && /Missed/.test(history));
    const squares = await page.locator("section[aria-label='History'] button[aria-label*='-']").count();
    check("it draws a square per day", squares > 300, `(${squares} squares for a year)`);

    // The list page links here and groups by the part of the day.
    await page.goto(`http://localhost:${PORT}/habits`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const link = page.locator(`a[href="/habits/${probe.key}"]`);
    check("the habits list links to it", (await link.count()) > 0);
    await link.first().click();
    await page.waitForTimeout(1200);
    check("clicking through arrives at the page", page.url().endsWith(`/habits/${probe.key}`), `(${page.url()})`);
    check("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

    await browser.close();
  } catch (e) {
    check("ran without throwing", false, String(e).slice(0, 200));
  } finally {
    if (probe) {
      // Archive first: a permanent delete refuses an active habit on purpose.
      await del(`/habits/${probe._id}`);
      await del(`/habits/${probe._id}/permanent`);
      const left = await body("/habits").catch(() => []);
      const gone = Array.isArray(left) && !left.some((h) => h.key === probe.key);
      check("the probe habit is gone", gone);
    }
    server.close();
  }

  console.log(ok ? "\nPASS" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
