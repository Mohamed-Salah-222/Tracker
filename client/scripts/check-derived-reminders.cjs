/**
 * The reminders nobody configured.
 *
 * These read what the app already knows: a subscription about to be charged, a goal
 * running out of days, a shopping list piling up, tasks left behind. Nothing here is
 * stored, so the only way to test it is to create the conditions and watch.
 *
 * Every probe record is removed afterwards, including on failure.
 */
const API = "http://localhost:5000/api";
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
const del = (url) => fetch(API + url, { method: "DELETE" }).catch(() => {});

(async () => {
  let ok = true;
  const cleanup = [];
  const check = (label, pass, detail = "") => {
    console.log((pass ? "  ok   " : "  FAIL ") + label + (detail ? " " + detail : ""));
    if (!pass) ok = false;
  };
  const fired = (result, needle) => [...result.sent, ...result.skipped].some((line) => line.includes(needle));

  try {
    // Clear anything already announced this run so the dedupe does not hide a pass.
    await post("/reminders/run", {});

    // ---- a subscription due today ----
    const wallet = (await json("/payments/wallets"))[0];
    const sub = await post("/payments/subscriptions", {
      name: "__probe__ Gym",
      price: 500,
      sourceType: "wallet",
      sourceId: wallet._id,
      cycle: "monthly",
      billingDay: Number(today.slice(8, 10)),
      startDate: today,
      today,
    });
    cleanup.push(() => del(`/payments/subscriptions/${sub._id}`));

    // ---- a goal ending today ----
    const goal = await post("/goals", { title: "__probe__ ends today", horizon: "custom", startDate: shift(-7), endDate: today, today });
    cleanup.push(() => del(`/goals/${goal._id}`));

    // ---- three things to buy ----
    for (const label of ["__probe__ milk", "__probe__ eggs", "__probe__ bread"]) {
      const item = await post("/kitchen/shopping", { label });
      if (item._id) cleanup.push(() => del(`/kitchen/shopping/${item._id}`));
    }

    // ---- three tasks left behind ----
    for (let i = 0; i < 3; i++) {
      const task = await post("/tasks", { title: `__probe__ overdue ${i}`, date: shift(-2 - i) });
      cleanup.push(() => del(`/tasks/${task._id}`));
    }

    const first = await post("/reminders/run", {});
    console.log("  (fired: " + ([...first.sent, ...first.skipped].join(" | ") || "nothing") + ")");

    check("a subscription due today is announced", fired(first, "__probe__ Gym"));
    check("a goal ending today is announced", fired(first, "__probe__ ends today"));
    check("a shopping list of three is announced", fired(first, "things to buy"));
    check("tasks left behind are announced", fired(first, "left behind"));

    const second = await post("/reminders/run", {});
    check("none of them repeat on a second pass", !fired(second, "__probe__ Gym") && !fired(second, "things to buy") && !fired(second, "left behind"), `(${[...second.sent, ...second.skipped].join(", ") || "nothing"})`);
  } catch (e) {
    ok = false;
    console.log("  FAIL threw:", String(e).slice(0, 160));
  } finally {
    for (const remove of cleanup.reverse()) await remove();
    // The shopping list is keyed by label, so sweep anything the run left behind.
    const shopping = await json("/kitchen/shopping").catch(() => []);
    for (const line of Array.isArray(shopping) ? shopping : []) {
      if (line.label && line.label.startsWith("__probe__")) await del(`/kitchen/shopping/${line._id}`);
    }
    console.log("cleaned up");
  }

  console.log(ok ? "\nPASS: the app nudges about what it already knew was coming" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
