/**
 * Quiet hours and the digest.
 *
 * Aggressive notifications are the most common complaint about this kind of app, and
 * four separate buzzes in one second is how an app teaches you to mute it. Two rules
 * answer that: several worked-out nudges arrive as one, and during the hours you are
 * asleep they are held rather than sent.
 *
 * Held, not dropped, is the part worth proving. A bill due at seven in the morning
 * that quiet hours swallow entirely is worse than the buzz it saved you.
 *
 * The settings are read first and restored in a finally, along with every probe
 * record and the probe device.
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
const status = (url, options) => fetch(API + url, options).then(async (r) => ({ status: r.status, body: await r.json() }));
const post = (url, payload) => json(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) });
const patchStatus = (url, payload) => status(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload ?? {}) });
const del = (url) => fetch(API + url, { method: "DELETE" }).catch(() => {});

/**
 * A UTC instant on a given day at a given hour, so the window under test is exact.
 *
 * The days are in the future because the derived nudges remember what they announced
 * today, and the server has been running: a pass dated today may find that everything
 * has already had its turn, which would make this whole file pass by saying nothing.
 */
const at = (dayOffset, hour) => new Date(Date.parse(today + "T00:00:00Z") + dayOffset * 86400000 + hour * 3600000 + 1800000).toISOString();

const PROBE_ENDPOINT = "https://example.invalid/probe-quiet-hours";

(async () => {
  let ok = true;
  const cleanup = [];
  let before = null;
  const check = (label, pass, detail = "") => {
    console.log((pass ? "  ok   " : "  FAIL ") + label + (detail ? " " + detail : ""));
    if (!pass) ok = false;
  };
  const lines = (result) => [...result.sent, ...result.skipped];
  const fired = (result, needle) => lines(result).some((line) => line.includes(needle));

  try {
    before = await json("/settings");

    // A device with a known timezone. Without one the runner has no clock to read,
    // and quiet hours cannot mean anything.
    await post("/reminders/subscribe", {
      endpoint: PROBE_ENDPOINT,
      keys: { p256dh: "probe-p256dh-value", auth: "probe-auth-value" },
      timezone: "UTC",
      userAgent: "check-quiet-digest",
    });
    cleanup.push(() => post("/reminders/unsubscribe", { endpoint: PROBE_ENDPOINT }));

    // ----- The settings refuse nonsense -----
    const badTime = await patchStatus("/settings", { quietHours: { from: "25:00" } });
    check("a time that is not a time is refused", badTime.status === 400, `(${badTime.body.error})`);
    const sameEdges = await patchStatus("/settings", { quietHours: { from: "09:00", to: "09:00" } });
    check("a window with no width is refused", sameEdges.status === 400, `(${sameEdges.body.error})`);
    const badDigest = await patchStatus("/settings", { digestAuto: "yes" });
    check("the digest switch takes a boolean", badDigest.status === 400, `(${badDigest.body.error})`);

    // ----- Something for it to say -----
    for (const label of ["__probe__ milk", "__probe__ eggs"]) {
      const item = await post("/kitchen/shopping", { label });
      if (item._id) cleanup.push(() => del(`/kitchen/shopping/${item._id}`));
    }
    for (let i = 0; i < 3; i++) {
      const task = await post("/tasks", { title: `__probe__ behind ${i}`, date: shift(-2 - i) });
      cleanup.push(() => del(`/tasks/${task._id}`));
    }

    // ----- Quiet hours hold them -----
    await patchStatus("/settings", { quietHours: { enabled: true, from: "22:00", to: "07:00" }, digestAuto: true });
    const night = await post("/reminders/run", { at: at(1, 3) });
    check("nothing is announced in the middle of the night", lines(night).every((l) => l.includes("quiet hours")) || lines(night).length === 0, `(${lines(night).join(", ") || "nothing"})`);
    check("and it says why", fired(night, "quiet hours"), `(${lines(night).join(", ")})`);

    // ----- Held, not dropped -----
    const morning = await post("/reminders/run", { at: at(1, 12) });
    check("what was held goes out once the window closes", fired(morning, "things to buy") || fired(morning, "digest"), `(${lines(morning).join(", ")})`);

    // ----- One buzz, not four -----
    check("several at once arrive as one", lines(morning).some((l) => l.startsWith("digest:")), `(${lines(morning).join(" | ")})`);
    const digestLine = lines(morning).find((l) => l.startsWith("digest:")) ?? "";
    check("the digest names each of them", digestLine.includes("to buy") && digestLine.includes("left behind"), `("${digestLine}")`);

    // ----- Turned off, they arrive separately -----
    await patchStatus("/settings", { digestAuto: false });
    // New conditions, because the earlier ones have already had their turn today.
    const later = await post("/tasks", { title: "__probe__ behind again", date: shift(-9) });
    cleanup.push(() => del(`/tasks/${later._id}`));
    const item = await post("/kitchen/shopping", { label: "__probe__ rice" });
    if (item._id) cleanup.push(() => del(`/kitchen/shopping/${item._id}`));

    // A fresh day, because the ones above have already had their turn.
    const separate = await post("/reminders/run", { at: at(2, 12) });
    check("with grouping off they arrive one by one", !lines(separate).some((l) => l.startsWith("digest:")) && lines(separate).length > 1, `(${lines(separate).join(" | ")})`);

    // ----- A reminder you set yourself is not held -----
    await patchStatus("/settings", { quietHours: { enabled: true, from: "22:00", to: "07:00" } });
    const alarm = await post("/tasks", { title: "__probe__ take the medicine", date: today, time: "03:00", remindAt: at(3, 3) });
    cleanup.push(() => del(`/tasks/${alarm._id}`));
    const nightAlarm = await post("/reminders/run", { at: at(3, 4) });
    check("an alarm you set yourself still goes off at night", fired(nightAlarm, "take the medicine"), `(${lines(nightAlarm).join(", ") || "nothing"})`);
  } catch (e) {
    check("ran without throwing", false, String(e).slice(0, 200));
  } finally {
    for (const undo of cleanup.reverse()) await undo();
    const shopping = await json("/kitchen/shopping").catch(() => []);
    for (const line of Array.isArray(shopping) ? shopping : []) {
      if (line.label && line.label.startsWith("__probe__")) await del(`/kitchen/shopping/${line._id}`);
    }
    if (before) {
      await patchStatus("/settings", { quietHours: before.quietHours, digestAuto: before.digestAuto });
      const after = await json("/settings");
      check(
        "the settings are back as they were",
        after.digestAuto === before.digestAuto && after.quietHours.enabled === before.quietHours.enabled && after.quietHours.from === before.quietHours.from && after.quietHours.to === before.quietHours.to,
        JSON.stringify(after.quietHours),
      );
    }
    const devices = (await json("/reminders/config").catch(() => ({ devices: -1 }))).devices;
    check("the probe device is gone", devices === 0, `(${devices} left)`);
  }

  console.log(ok ? "\nPASS" : "\nFAIL");
  process.exit(ok ? 0 : 1);
})();
