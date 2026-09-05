/**
 * A reminder set on a task must arrive, once, at the moment it was set for.
 *
 * This is the object-shaped half of reminders: not "nudge me about my habits every
 * evening" but "tell me about this thing on this day at this time". It lives on the
 * task, so it checks the parts that follow from that: it fires when the moment has
 * passed and not before, it fires only once, a task already done is left alone, and
 * moving the reminder makes it eligible again.
 *
 * Removes the tasks it creates, including on failure.
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

const json = (url, options) => fetch(API + url, options).then((r) => r.json());
const post = (url, body) => json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
const patch = (url, body) => json(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

(async () => {
  let ok = true;
  const created = [];
  const check = (label, pass, detail = "") => {
    console.log((pass ? "  ok   " : "  FAIL ") + label + (detail ? " " + detail : ""));
    if (!pass) ok = false;
  };

  try {
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const hourAway = new Date(Date.now() + 3_600_000).toISOString();

    const due = await post("/tasks", { title: "__probe__ remind me now", date: today, time: "15:00", remindAt: minuteAgo });
    const later = await post("/tasks", { title: "__probe__ remind me later", date: today, remindAt: hourAway });
    const finished = await post("/tasks", { title: "__probe__ already done", date: today, remindAt: minuteAgo });
    created.push(due._id, later._id, finished._id);

    check("a task keeps its time", due.time === "15:00", `(got ${due.time})`);
    check("and its reminder", Boolean(due.remindAt));
    check("a bad time is refused", (await post("/tasks", { title: "__probe__ bad", date: today, time: "25:99" })).error !== undefined);

    await patch(`/tasks/${finished._id}`, { done: true });

    const first = await post("/reminders/run", {});
    check("the one whose moment passed fires", [...first.sent, ...first.skipped].includes("__probe__ remind me now"), `(sent: ${first.sent.join(", ") || "none"})`);
    check("the one an hour away does not", ![...first.sent, ...first.skipped].includes("__probe__ remind me later"));
    check("a task already done is left alone", ![...first.sent, ...first.skipped].includes("__probe__ already done"));

    const second = await post("/reminders/run", {});
    check("it does not fire again", ![...second.sent, ...second.skipped].includes("__probe__ remind me now"), `(sent: ${second.sent.join(", ") || "none"})`);

    const afterSend = (await json(`/tasks/day?date=${today}`)).find((t) => t._id === due._id);
    check("the send is recorded on the task", Boolean(afterSend && afterSend.remindedAt));

    // Moving a reminder means it has not happened yet at the new time.
    const moved = await patch(`/tasks/${due._id}`, { remindAt: minuteAgo });
    check("moving it makes it eligible again", moved.remindedAt === null);
    const third = await post("/reminders/run", {});
    check("and it fires at the new time", [...third.sent, ...third.skipped].includes("__probe__ remind me now"));

    const cleared = await patch(`/tasks/${later._id}`, { remindAt: null, time: null });
    check("a reminder can be switched off", cleared.remindAt === null && cleared.time === null);
  } catch (e) {
    ok = false;
    console.log("  FAIL threw:", String(e).slice(0, 160));
  } finally {
    const left = await json(`/tasks/day?date=${today}`).catch(() => []);
    for (const task of (Array.isArray(left) ? left : []).filter((t) => t.title.startsWith("__probe__"))) {
      await fetch(`${API}/tasks/${task._id}`, { method: "DELETE" }).catch(() => {});
    }
    void created;
    console.log("cleaned up");
  }

  console.log(ok ? "\nPASS: a task reminder fires once, on time, and not for a task already done" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
