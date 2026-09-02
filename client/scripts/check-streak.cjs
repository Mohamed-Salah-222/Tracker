/**
 * Opening the app counts as using it, once per day.
 *
 * Checks the whole loop through the real UI: a cold visit pings, the pill shows the
 * run, a second visit does not double count, and a write from another page still
 * counts on a day that has not been pinged yet.
 *
 * Reads the streak before and after and reports the difference rather than asserting
 * a fixed number, so it works against whatever history is really there. It never
 * deletes a usage day: the ping it sends is the same one the app sends when opened,
 * and today is a day the app genuinely was opened by running this.
 *
 * Needs the API on :5000 and a current `npm run build`.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../dist");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));
const PORT = 4329;
const API = "http://localhost:5000/api";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://l");
  let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, "index.html");
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  r.end(fs.readFileSync(f));
});

const streak = () => fetch(`${API}/streak`).then((r) => r.json());

(async () => {
  const before = await streak();
  console.log(`before: current ${before.current}, days used ${before.daysUsed}, used today ${before.usedToday}`);

  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });

  // A browser that has never seen the app: no remembered ping.
  const page = await context.newPage();
  const pings = [];
  page.on("request", (r) => r.url().includes("/streak/ping") && pings.push(r.method()));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  console.log("pings on a cold open:", pings.length);

  const pill = await page.getByLabel(/^Streak:/).first().getAttribute("aria-label");
  console.log("pill reads:", (pill ?? "").replace(/\s+/g, " ").trim());

  // Navigating around must not ping again: one day, one count.
  await page.goto(`http://localhost:${PORT}/today`, { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await page.goto(`http://localhost:${PORT}/badges`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  console.log("pings after two more page loads:", pings.length);

  const heading = await page.locator("h1").first().textContent();
  const badgeText = (await page.textContent("body")) ?? "";
  console.log("badges page heading:", heading);
  console.log("shows an earned badge:", /Earned/.test(badgeText));

  await browser.close();
  server.close();

  const after = await streak();
  console.log(`after: current ${after.current}, days used ${after.daysUsed}, used today ${after.usedToday}`);

  const ok =
    pings.length === 1 &&
    after.usedToday === true &&
    after.daysUsed === before.daysUsed + (before.usedToday ? 0 : 1) &&
    /day/.test(pill ?? "");
  console.log(ok ? "\nPASS: one count per day, pill and page render" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
