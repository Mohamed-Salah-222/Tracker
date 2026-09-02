/**
 * Adding a food with a calorie figure must save.
 *
 * A stripped-out regex in parseMacro made the form reject every number that was typed
 * into it, so no food could be added or edited at all. This drives the real form and
 * then removes the food it created, and nothing else.
 *
 * Needs the API on :5000 and a current `npm run build`.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../dist");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));
const PORT = 4328;
const API = "http://localhost:5000/api";
const NAME = "__probe__ form check";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://l");
  let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, "index.html");
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  r.end(fs.readFileSync(f));
});

/** Only ever removes the probe this run created, found by its exact name. */
async function cleanUp() {
  const page = await fetch(`${API}/foods?limit=200`).then((r) => r.json());
  const mine = (page.items ?? []).filter((f) => f.name === NAME);
  for (const food of mine) {
    await fetch(`${API}/foods/${food._id}/permanent`, { method: "DELETE" }).catch(() => {});
    await fetch(`${API}/foods/${food._id}`, { method: "DELETE" }).catch(() => {});
  }
  return mine.length;
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 120)));

  await page.goto(`http://localhost:${PORT}/foods`, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  await page.getByRole("button", { name: "Add food", exact: false }).first().click();
  await page.waitForTimeout(900);

  const dialog = page.locator('[role="dialog"]').last();
  await dialog.getByLabel("Name", { exact: false }).first().fill(NAME).catch(async () => {
    await dialog.locator("input").first().fill(NAME);
  });

  // Each box by its own label, so a field added above them cannot shift the fill.
  // Located through the label text rather than a Tailwind class: the class names are
  // styling and change freely, the labels are what the form actually promises.
  const field = (label) => dialog.locator(`xpath=.//label[starts-with(normalize-space(.), "${label}")]/following::input[1]`).first();
  await field("Calories").fill("250");
  await field("Protein").fill("20");
  await field("Carbs").fill("30");
  await field("Fat").fill("8");
  console.log("filled calories 250, protein 20, carbs 30, fat 8 (per 100g)");

  await dialog.getByRole("button", { name: /^(Add|Save)$/ }).last().click();
  await page.waitForTimeout(1800);

  const toast = (await page.locator("[data-sonner-toast]").allTextContents()).join(" | ");
  console.log("toast:", toast || "(none)");

  const saved = await fetch(`${API}/foods?search=__probe__&limit=50`).then((r) => r.json());
  const found = (saved.items ?? []).find((f) => f.name === NAME);
  const per100 = found ? Math.round(found.caloriesPerGram * 100 * 10) / 10 : null;
  console.log("saved to the API:", found ? `yes, ${per100} cal per 100g, ${Math.round(found.proteinPerGram * 100)}g protein` : "NO");

  await browser.close();
  server.close();
  const removed = await cleanUp();
  console.log(`cleaned up ${removed} probe food(s)`);

  const ok = Boolean(found) && per100 === 250 && !/must be a number/i.test(toast);
  console.log(ok ? "\nPASS: a food with a calorie figure saves" : "\nFAIL");
  if (errors.length) console.log("console errors:", errors.join(" / "));
  process.exit(ok ? 0 : 1);
})();
