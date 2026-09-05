import { Router } from "express";
import { markUsed, nextUp, streakSummary, syncBadges } from "../lib/streak";
import { allMeasures, invalidateMeasures } from "../lib/measures";
import { GROUP_LABELS, GROUP_ORDER } from "../lib/badges";
import { loadSettings } from "../models/Settings";
import { hiddenBadgeGroups } from "../lib/modules";
import { backfillUsage } from "../lib/usage-backfill";
import { parseDayUTC } from "../lib/validation";

const router = Router();

const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayFrom = (v: unknown) => iso(parseDayUTC(v) ?? new Date());

/** Route prefixes only, so a stray string cannot end up in the areas list. */
const AREA = /^[a-z][a-z0-9-]{0,20}$/;

// =====================================================================
// GET /streak?today=
//
// The light one. Just the run, for the pill in the nav, which loads on every page.
// Badges are deliberately not computed here: that walks fifteen collections and the
// nav has no use for the answer.
//
// Read-only. Opening this does not count as using the app, or checking your streak
// would extend it.
// =====================================================================
router.get("/", async (req, res) => {
  const todayIso = todayFrom(req.query.today);
  await backfillUsage();
  res.json(await streakSummary(todayIso));
});

// =====================================================================
// POST /streak/ping
//
// "I used the app today." Sent on open and after anything that writes, with the
// browser's own calendar date. Marking a day twice is the normal case and costs
// nothing: a day joins the streak once however often you come back to it.
//
// This is also where badges are awarded, since it is the one request that happens
// after something changed and at most once a day.
// =====================================================================
router.post("/ping", async (req, res) => {
  const date = parseDayUTC(req.body?.date);
  if (!date) return res.status(400).json({ error: "a date is required" });

  const todayIso = iso(date);
  // A ping for next week would hand out a streak nobody has served yet.
  if (todayIso > iso(new Date(Date.now() + 86_400_000))) return res.status(400).json({ error: "that date is in the future" });

  await backfillUsage();
  const area = typeof req.body?.area === "string" && AREA.test(req.body.area) ? req.body.area : null;
  await markUsed(todayIso, area);
  invalidateMeasures();

  const summary = await streakSummary(todayIso);
  const { measures } = await allMeasures(todayIso, true);
  const { awarded } = await syncBadges(measures, todayIso);

  // Only what was just earned comes back. The pill wants a number, not a catalogue.
  res.json({ ...summary, awarded });
});

// =====================================================================
// GET /streak/badges?today=
// The whole board: every measure, every badge, grouped, with what is next.
// =====================================================================
router.get("/badges", async (req, res) => {
  const todayIso = todayFrom(req.query.today);
  await backfillUsage();

  const summary = await streakSummary(todayIso);
  const { measures } = await allMeasures(todayIso);
  const { badges } = await syncBadges(measures, todayIso);

  // A module that is off keeps its badges earned and out of sight.
  const offGroups = hiddenBadgeGroups((await loadSettings()).modules);
  const groups = GROUP_ORDER.filter((group) => !offGroups.has(group)).map((group) => {
    const inGroup = badges.filter((b) => b.group === group);
    return {
      key: group,
      label: GROUP_LABELS[group],
      badges: inGroup,
      earned: inGroup.filter((b) => b.earned).length,
      total: inGroup.length,
    };
  }).filter((g) => g.total > 0);

  // The headline count follows what is on screen, or it would read 28 of 142 while
  // showing forty.
  const shown = badges.filter((b) => !offGroups.has(b.group));
  res.json({
    ...summary,
    measures,
    groups,
    badges: shown,
    earned: shown.filter((b) => b.earned).length,
    total: shown.length,
    next: nextUp(measures),
  });
});

export default router;
