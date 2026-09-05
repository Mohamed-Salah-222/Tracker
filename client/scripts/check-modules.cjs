/**
 * Switching a module off has to remove it everywhere, not just from the nav.
 *
 * Turns Calories off, then checks the nav link is gone, the page redirects, its three
 * dashboard rows are gone and its badge groups are gone. Then turns it back on and
 * checks everything returns, because "off never deletes" is the other half of the
 * promise.
 *
 * Restores whatever the settings were before it ran, including on failure.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../dist");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));
const PORT = 4334;
const API = "http://localhost:5000/api";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const server = http.createServer((q, r) => {
  const u = new URL(q.url, "http://l");
  let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, "index.html");
  r.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  r.end(fs.readFileSync(f));
});

const getSettings = () => fetch(`${API}/settings`).then((r) => r.json());
const patch = (body) => fetch(`${API}/settings`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const dashboardRows = () => fetch(`${API}/dashboard?today=2026-09-02`).then((r) => r.json()).then((d) => d.rows.map((r) => r.id));
const badgeGroups = () => fetch(`${API}/streak/badges?today=2026-09-02`).then((r) => r.json()).then((b) => b.groups.map((g) => g.key));

(async () => {
  const before = await getSettings();
  console.log("saving current modules to put back afterwards");

  let ok = true;
  const check = (label, pass, detail = "") => {
    console.log((pass ? "  ok   " : "  FAIL ") + label + (detail ? " " + detail : ""));
    if (!pass) ok = false;
  };

  try {
    await new Promise((r) => server.listen(PORT, r));
    const browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();

    // ---- off ----
    await patch({ modules: { calories: false } });
    console.log("\ncalories off:");
    const offRows = await dashboardRows();
    check("calorie rows gone from the dashboard", !offRows.some((r) => ["calories", "protein", "water"].includes(r)), `(rows: ${offRows.join(",")})`);
    const offGroups = await badgeGroups();
    check("calorie badge groups gone", !offGroups.some((g) => ["calories", "protein", "water"].includes(g)));

    await page.goto(`http://localhost:${PORT}/today`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const navText = (await page.locator("nav, aside, [data-sidebar]").first().textContent().catch(() => "")) || (await page.textContent("body"));
    check("nav link gone", !/Calories/.test(await page.locator("a[href='/calories']").count().then((c) => (c > 0 ? "Calories" : ""))));

    await page.goto(`http://localhost:${PORT}/calories`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    check("page redirects away", !page.url().endsWith("/calories"), `(landed on ${page.url().replace(`http://localhost:${PORT}`, "") || "/"})`);

    // ---- back on ----
    await patch({ modules: { calories: true } });
    console.log("\ncalories back on:");
    const onRows = await dashboardRows();
    check("rows restored", ["calories", "protein", "water"].every((r) => onRows.includes(r)));
    const onGroups = await badgeGroups();
    check("badge groups restored", ["calories", "protein", "water"].every((g) => onGroups.includes(g)));

    await page.goto(`http://localhost:${PORT}/calories`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    check("page reachable again", page.url().endsWith("/calories"));
    void navText;

    await browser.close();
  } finally {
    server.close();
    await patch({ modules: before.modules });
    console.log("\nmodules restored");
  }

  console.log(ok ? "\nPASS: off removes it everywhere, on brings it all back" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
