/**
 * Does the app actually survive a dead zone?
 *
 * Serves the built client, loads it once online so the worker installs, then kills
 * the network and reloads. A pass means the shell still renders from cache.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));

const ROOT = path.resolve(__dirname, "../dist");
const PORT = 4319;

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
  const body = fs.readFileSync(file);
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(body);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const base = `http://localhost:${PORT}`;

  await page.goto(base + "/today", { waitUntil: "load" });

  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: reg.active?.state ?? null };
  });
  console.log("worker:", state);

  // Give the precache a moment to finish writing before the network disappears.
  await page.waitForTimeout(2500);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const counts = {};
    for (const name of names) counts[name] = (await (await caches.open(name)).keys()).length;
    return counts;
  });
  console.log("caches:", cached);

  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  const offlineTitle = await page.title();
  const rendered = await page.evaluate(() => document.querySelector("#root")?.children.length ?? 0);
  const text = (await page.textContent("body")) ?? "";
  console.log("offline reload -> title:", JSON.stringify(offlineTitle), "| root children:", rendered);
  console.log("offline reload -> shows app chrome:", /Dashboard|Today|Journal|Tasks/.test(text));

  await page.goto(base + "/workout", { waitUntil: "load" }).catch((e) => console.log("deep link failed:", String(e).slice(0, 80)));
  const deepText = (await page.textContent("body")) ?? "";
  console.log("offline deep link -> renders:", deepText.trim().length > 0, "|", deepText.trim().slice(0, 60).replace(/\s+/g, " "));

  // Does the data survive the dead zone too, or only the shell?
  const apiOffline = await page.evaluate(async () => {
    // Found rather than named: this check hardcoded a cache version once and quietly
    // stopped testing anything the day the worker bumped it.
    const name = (await caches.keys()).find((k) => k.includes("api"));
    if (!name) return { ok: false, error: "no api cache at all" };
    const keys = (await (await caches.open(name)).keys()).map((r) => r.url);
    if (keys.length === 0) return { ok: false, error: "nothing cached" };
    try {
      const r = await fetch(keys[0]);
      const body = await r.json();
      return { url: keys[0].replace("http://localhost:5000", ""), ok: r.ok, servedFromCache: Boolean(r.headers.get("x-cached-at")), shape: body === null ? "null, a day with nothing logged" : Array.isArray(body) ? body.length + " rows" : Object.keys(body).slice(0, 4).join(",") };
    } catch (e) {
      return { ok: false, error: String(e).slice(0, 70) };
    }
  });
  console.log("offline API read ->", apiOffline);

  await context.setOffline(false);
  await browser.close();
  server.close();
})();
