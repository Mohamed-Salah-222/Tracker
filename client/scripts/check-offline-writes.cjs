/**
 * A write made with no network must not be lost.
 *
 * Goes offline, logs a real task through the real UI, confirms the server has not
 * heard about it, comes back online, and confirms it arrives exactly once.
 *
 * The last part is the one that matters most: a queued write carries an idempotency
 * key so a request that succeeded while its answer was lost cannot be applied twice
 * on replay. That is checked directly by replaying the same key.
 *
 * Removes the task it created, including on failure.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "../dist");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));
const PORT = 4356;
const API = "http://localhost:5000/api";
const TITLE = "__probe__ written offline";

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
const tasksToday = () => fetch(`${API}/tasks/day?date=${today}`).then((r) => r.json());

(async () => {
  let ok = true;
  const check = (label, pass, detail = "") => {
    console.log((pass ? "  ok   " : "  FAIL ") + label + (detail ? " " + detail : ""));
    if (!pass) ok = false;
  };

  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  // The service worker is left out: this is about the write path, and a cached GET
  // would only make it harder to see what reached the server.
  const context = await browser.newContext({ serviceWorkers: "block" });

  try {
    const before = (await tasksToday()).length;

    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/today`, { waitUntil: "load" });
    await page.waitForTimeout(3000);

    // ---- offline ----
    await context.setOffline(true);
    await page.getByPlaceholder("What needs doing today?").fill(TITLE);
    await page.getByRole("button", { name: "Add task" }).click();
    await page.waitForTimeout(1500);

    const onScreen = await page.getByText(TITLE).count();
    check("the task appears on screen while offline", onScreen > 0);

    const duringOutage = await tasksToday();
    check("the server has not heard about it yet", !duringOutage.some((t) => t.title === TITLE), `(${duringOutage.length} tasks)`);

    const pill = await page.getByText(/Offline/).first().textContent();
    check("the pill says something is waiting", /Offline/.test(pill ?? "") && /·\s*1/.test(pill ?? ""), `(reads "${(pill ?? "").trim()}")`);

    // ---- back online ----
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(4000);

    const after = await tasksToday();
    const landed = after.filter((t) => t.title === TITLE);
    check("it arrives once the network is back", landed.length === 1, `(${landed.length} copies, ${after.length} tasks, was ${before})`);

    // ---- the same key twice ----
    const key = "probe" + Math.random().toString(36).slice(2, 12);
    const send = () =>
      fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-idempotency-key": key },
        body: JSON.stringify({ title: "__probe__ idempotent", date: today }),
      });
    const first = await send();
    const second = await send();
    check("a replayed key is answered, not repeated", second.headers.get("x-idempotent-replay") === "true", `(first ${first.status}, second ${second.status})`);

    const finalTasks = await tasksToday();
    check("and it only created one row", finalTasks.filter((t) => t.title === "__probe__ idempotent").length === 1);
  } catch (e) {
    ok = false;
    console.log("  FAIL threw:", String(e).slice(0, 160));
  } finally {
    await browser.close();
    server.close();
    const left = await tasksToday().catch(() => []);
    for (const task of left.filter((t) => t.title.startsWith("__probe__"))) {
      await fetch(`${API}/tasks/${task._id}`, { method: "DELETE" }).catch(() => {});
    }
    console.log("cleaned up");
  }

  console.log(ok ? "\nPASS: offline writes are kept, replayed once, and cannot double up" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
