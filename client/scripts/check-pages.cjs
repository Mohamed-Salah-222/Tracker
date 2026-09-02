/**
 * Click through everything new and fail on any console error.
 *
 * A type check proves the shapes line up; it does not prove a modal opens. This walks
 * the built app the way a person would and reports anything the browser complained
 * about on the way.
 *
 * Needs the API running on :5000.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));

const ROOT = path.resolve(__dirname, "../dist");
const PORT = 4321;

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  // No service worker here: this is about the pages, and a cache would hide a break.
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const base = `http://localhost:${PORT}`;

  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push("console: " + m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => problems.push("pageerror: " + String(e).slice(0, 160)));

  // Unlock the money pages the way the password screen does.
  await page.goto(base + "/", { waitUntil: "load" });
  await page.evaluate(() => localStorage.setItem("private:unlocked-until", String(Date.now() + 600000)));

  const visit = async (url, label, after) => {
    const before = problems.length;
    await page.goto(base + url, { waitUntil: "load" });
    await page.waitForTimeout(1800);
    if (after) await after();
    const found = problems.length - before;
    console.log((found === 0 ? "ok   " : "FAIL ") + label.padEnd(28) + (found === 0 ? "" : found + " error(s)"));
  };

  const click = async (name) => {
    const button = page.getByRole("button", { name, exact: false }).first();
    if ((await button.count()) === 0) {
      problems.push("missing button: " + name);
      return;
    }
    await button.click();
    await page.waitForTimeout(1600);
  };

  await visit("/", "dashboard");
  await visit("/today", "today (sleep + journal)");
  // The sleep card offers "Log this night" only when the night is blank, and an
  // "Edit this night" pencil once it is not. Either opens the same editor.
  await visit("/today", "today, open sleep editor", async () => {
    const log = page.getByRole("button", { name: "Log this night", exact: false }).first();
    if (await log.count()) return click("Log this night");
    return click("Edit this night");
  });
  await visit("/journal", "journal archive");
  await visit("/calories", "calories");
  await visit("/calories", "calories + body modal", () => click("Body"));
  await visit("/payments", "payments");
  await visit("/payments", "payments + subscriptions", () => click("Subscriptions"));
  await visit("/goals", "goals");
  await visit("/goals", "goals + new goal form", () => click("New goal"));
  await visit("/habits", "habits");
  await visit("/tasks", "tasks");
  await visit("/kitchen", "kitchen");
  await visit("/foods", "foods");
  await visit("/workout", "workout");

  console.log("");
  if (problems.length === 0) console.log("no console errors anywhere");
  else for (const p of [...new Set(problems)]) console.log("  " + p);

  await browser.close();
  server.close();
  process.exit(problems.length === 0 ? 0 : 1);
})();
