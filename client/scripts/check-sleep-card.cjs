/**
 * The sleep card must not change the day you are looking at.
 *
 * Its 14-night strip used to be a row of buttons that moved the whole Today page to
 * whichever bar you touched, which reads as the date jumping at random. This clicks
 * across the card and asserts the heading never moves.
 *
 * Non-destructive by construction: it reads any night already logged on the dates it
 * needs, and puts every one of them back before it exits, including on failure. An
 * earlier version of this script simply wrote and deleted, and destroyed a real
 * entry. Never let a test own live data it did not create.
 *
 * Needs the API on :5000 and a current `npm run build`.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../dist");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));
const PORT = 4326;
const API = "http://localhost:5000/api";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://l");
  let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, "index.html");
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  r.end(fs.readFileSync(f));
});

/**
 * The local calendar day, not the UTC one.
 *
 * Between local midnight and the UTC offset the two disagree, and everything the app
 * labels "today" comes from the browser's clock. A script that asks UTC tests the
 * wrong day for the first few hours of every day, and passes for the other twenty.
 */
const localDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = localDay(new Date());
const shift = (iso, by) => new Date(Date.parse(iso + "T00:00:00Z") + by * 86400000).toISOString().slice(0, 10);
const DATES = [today, shift(today, -1), shift(today, -2)];

const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const read = (date) => fetch(`${API}/sleep/day?date=${date}`).then((r) => r.json());
const write = (body) => fetch(`${API}/sleep/day`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const remove = (date) => fetch(`${API}/sleep/day?date=${date}`, { method: "DELETE" });

async function restore(original) {
  for (const [date, night] of original) {
    if (night) await write({ date, bedTime: clock(night.bedMinutes), wakeTime: clock(night.wakeMinutes), quality: night.quality, note: night.note });
    else await remove(date);
  }
}

(async () => {
  // Remember exactly what was there, so it can be put back byte for byte.
  const original = new Map();
  for (const d of DATES) original.set(d, await read(d));
  const existing = [...original.values()].filter(Boolean).length;
  console.log(`borrowing ${DATES.length} dates, ${existing} already had a night logged`);

  let ok = false;
  try {
    for (const d of DATES) await write({ date: d, bedTime: "23:30", wakeTime: "07:00" });

    await new Promise((r) => server.listen(PORT, r));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
    await page.goto(`http://localhost:${PORT}/today`, { waitUntil: "load" });
    await page.waitForTimeout(2500);

    const heading = () => page.locator("h1").first().textContent();
    const before = await heading();
    console.log("day shown:", before);

    const card = page.locator("h2", { hasText: "Sleep" }).locator("xpath=ancestor::*[contains(@class,'rounded-xl')][1]");
    const box = await card.boundingBox();
    if (!box) throw new Error("sleep card not found");

    for (const frac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      await page.mouse.click(box.x + box.width * frac, box.y + box.height * 0.78);
      await page.waitForTimeout(300);
    }
    const afterStrip = await heading();
    console.log("after 5 clicks on the strip:", afterStrip, afterStrip === before ? "(unchanged)" : "*** DAY MOVED ***");

    await page.mouse.click(box.x + 60, box.y + box.height * 0.35);
    await page.waitForTimeout(300);
    const afterBody = await heading();
    console.log("after clicking the reading:", afterBody, afterBody === before ? "(unchanged)" : "*** DAY MOVED ***");

    ok = afterStrip === before && afterBody === before;
    await browser.close();
  } finally {
    server.close();
    await restore(original);
    console.log("dates restored to how they were");
  }

  console.log(ok ? "\nPASS: the sleep card does not change the day" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
