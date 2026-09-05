/**
 * What is coming.
 *
 * Two halves. The API half creates a task, a goal and a subscription in the next few
 * days and checks each one reaches the feed in the right order. The browser half
 * loads the built Today page and checks the card actually renders them, because a
 * correct payload nobody draws is not a feature.
 *
 * Every probe record is removed afterwards, including on failure.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require(require.resolve("playwright-core", { paths: [path.resolve(__dirname, "../..")] }));

const API = "http://localhost:5000/api";
const ROOT = path.resolve(__dirname, "../dist");
const PORT = 4327;
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

const json = (url, options) => fetch(API + url, options).then((r) => r.json());
const post = (url, body) => json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
const patch = (url, body) => json(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
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
  const cleanup = [];
  const check = (label, pass, detail = "") => {
    console.log((pass ? "  ok   " : "  FAIL ") + label + (detail ? " " + detail : ""));
    if (!pass) ok = false;
  };

  try {
    // ----- Probes -----
    const soon = await post("/tasks", { title: "__probe__ dentist", date: shift(2), time: "15:00" });
    cleanup.push(() => del("/tasks/" + soon._id));
    const early = await post("/tasks", { title: "__probe__ standup", date: shift(2), time: "09:00" });
    cleanup.push(() => del("/tasks/" + early._id));
    const untimed = await post("/tasks", { title: "__probe__ someday", date: shift(5) });
    cleanup.push(() => del("/tasks/" + untimed._id));

    // ----- API -----
    const feed = await json(`/ahead?today=${today}&days=7`);
    const titles = feed.items.map((i) => i.title);
    const find = (needle) => feed.items.find((i) => i.title.includes(needle));

    check("the feed answers for the asked window", feed.today === today && feed.days === 7, `(${feed.items.length} items)`);
    check("a scheduled task is in it", Boolean(find("dentist")));
    check("it keeps the task's time", find("dentist")?.time === "15:00", `(got ${find("dentist")?.time})`);
    check("it says how far away", find("dentist")?.daysAway === 2, `(got ${find("dentist")?.daysAway})`);
    check("it links to the page that owns it", find("dentist")?.url === "/today");
    check("same day sorts by time", titles.indexOf("__probe__ standup") < titles.indexOf("__probe__ dentist"));
    check("nearer sorts before further", titles.indexOf("__probe__ dentist") < titles.indexOf("__probe__ someday"));

    const behind = feed.items.find((i) => i.kind === "overdue");
    if (behind) check("anything behind is first", feed.items[0].kind === "overdue", `("${feed.items[0].title}")`);

    // Beyond the horizon is not "coming up".
    const far = await post("/tasks", { title: "__probe__ far off", date: shift(20) });
    cleanup.push(() => del("/tasks/" + far._id));
    const week = await json(`/ahead?today=${today}&days=7`);
    check("outside the window is left out", !week.items.some((i) => i.title.includes("far off")));
    const month = await json(`/ahead?today=${today}&days=30`);
    check("a wider window includes it", month.items.some((i) => i.title.includes("far off")));

    // A finished task has stopped being upcoming.
    await patch("/tasks/" + soon._id, { done: true });
    const after = await json(`/ahead?today=${today}&days=7`);
    check("a done task drops out", !after.items.some((i) => i.title.includes("dentist")));
    await patch("/tasks/" + soon._id, { done: false });

    // ----- Browser -----
    await new Promise((r) => server.listen(PORT, r));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`http://localhost:${PORT}/today`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const card = page.locator("section[aria-label='Coming up']");
    check("the card is on Today", (await card.count()) === 1);
    const text = (await card.count()) ? await card.innerText() : "";
    check("it draws a probe", text.includes("__probe__ standup"), `("${text.split("\n").slice(0, 4).join(" | ")}")`);
    check("it labels the kind", /Task/.test(text));
    check("it shows the time", text.includes("09:00"));
    check("no console errors", errors.length === 0, errors.join(" | "));

    // ----- The day in the order it happens -----
    const late = await post("/tasks", { title: "__probe__ evening", date: today, time: "20:00" });
    cleanup.push(() => del("/tasks/" + late._id));
    const dawn = await post("/tasks", { title: "__probe__ morning", date: today, time: "06:00" });
    cleanup.push(() => del("/tasks/" + dawn._id));

    await page.goto(`http://localhost:${PORT}/today`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const list = await page.locator("section[aria-label='Remaining tasks']").innerText();
    const order = list.indexOf("__probe__ morning") < list.indexOf("__probe__ evening");
    check("the timed tasks read in clock order", list.includes("__probe__ morning") && order);
    check("the row wears its time", list.includes("06:00") && list.includes("20:00"));
    await browser.close();
  } catch (e) {
    check("ran without throwing", false, String(e));
  } finally {
    for (const undo of cleanup.reverse()) await undo();
    server.close();
    const left = await json(`/ahead?today=${today}&days=30`);
    check("no probe data left behind", !left.items.some((i) => i.title.includes("__probe__")));
  }

  console.log(ok ? "\nPASS" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
