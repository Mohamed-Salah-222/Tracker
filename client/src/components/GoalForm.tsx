import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";
import { HORIZON_BLURB, addMonths, goalError, mondayOf, monthKeyLabel, shiftDays, weekKeyLabel, type Goal, type Horizon } from "../lib/goals";

const SCOPES: { key: Horizon; label: string }[] = [
  { key: "lifetime", label: "Open" },
  { key: "monthly", label: "Month" },
  { key: "weekly", label: "Week" },
  { key: "custom", label: "Dates" },
];

/** "this one", "next", "3 ahead", "2 back". Planning September in August has to be visible. */
function offsetLabel(n: number): string {
  if (n === 0) return "this one";
  if (n === 1) return "next";
  if (n === -1) return "last";
  return n > 0 ? `${n} ahead` : `${-n} back`;
}

function monthsApart(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Arrows around a label. The period is stepped, not typed, so it is always a real one. */
function PeriodStepper({ label, hint, onStep }: { label: string; hint: string; onStep: (by: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border-strong p-1">
      <button type="button" onClick={() => onStep(-1)} aria-label="Earlier" className="grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted">
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="flex min-w-0 flex-1 flex-col items-center leading-tight">
        <span className="truncate text-sm font-semibold">{label}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{hint}</span>
      </span>
      <button type="button" onClick={() => onStep(1)} aria-label="Later" className="grid h-9 w-9 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted">
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * One form for both making and editing a goal.
 *
 * The number is optional and deliberately separate from the timeframe: losing weight is
 * open ended with a number, reading four books is a month with a number, and getting
 * better at something has no number at any timeframe. The month and the week are stepped
 * freely, so a plan for September can be written in August.
 */
export default function GoalForm({ goal, horizon, today, onClose, onSaved }: { goal: Goal | null; horizon: Horizon; today: string; onClose: () => void; onSaved: () => void }) {
  const thisMonth = today.slice(0, 7);
  const thisWeek = mondayOf(today);

  const [title, setTitle] = useState(goal?.title ?? "");
  const [why, setWhy] = useState(goal?.why ?? "");
  const [scope, setScope] = useState<Horizon>(goal?.horizon ?? horizon);
  const [monthKey, setMonthKey] = useState(goal?.horizon === "monthly" && goal.periodKey ? goal.periodKey : thisMonth);
  const [weekKey, setWeekKey] = useState(goal?.horizon === "weekly" && goal.periodKey ? goal.periodKey : thisWeek);
  const [from, setFrom] = useState(goal?.horizon === "custom" ? (goal.startDate ?? today) : today);
  const [to, setTo] = useState(goal?.horizon === "custom" ? (goal.endDate ?? "") : "");
  const [tracked, setTracked] = useState(!!goal?.measure);
  const [unit, setUnit] = useState(goal?.measure?.unit ?? "");
  const [start, setStart] = useState(goal?.measure ? String(goal.measure.startValue) : "");
  const [target, setTarget] = useState(goal?.measure ? String(goal.measure.targetValue) : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast.error("Give it a name");
    if (scope === "custom") {
      if (!from || !to) return toast.error("Pick a start and an end date");
      if (from > to) return toast.error("The end comes before the start");
    }

    let measure: { unit: string; startValue: number; targetValue: number } | null = null;
    if (tracked) {
      const s = Number(start);
      const t = Number(target);
      if (!Number.isFinite(s) || !Number.isFinite(t)) return toast.error("A tracked goal needs a start and a target number");
      if (s === t) return toast.error("The start and the target are the same number");
      measure = { unit: unit.trim(), startValue: s, targetValue: t };
    }

    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        why: why.trim(),
        horizon: scope,
        periodKey: scope === "monthly" ? monthKey : scope === "weekly" ? weekKey : null,
        startDate: scope === "custom" ? from : null,
        endDate: scope === "custom" ? to : null,
        measure,
        // For a dated range the end is the deadline, so it is not asked for twice.
        targetDate: (scope === "custom" ? to : targetDate) || null,
        today,
      };
      if (goal) await api.patch(`/goals/${goal._id}`, body);
      else await api.post("/goals", body);
      toast.success(goal ? "Saved" : `${title.trim()} added`);
      onSaved();
    } catch (e) {
      toast.error(goalError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[440px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Become an AI engineer" className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Why (optional)</Label>
            <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="The part you forget in three months" className="h-11" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timeframe</Label>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-border-strong p-1">
              {SCOPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setScope(s.key)}
                  aria-pressed={scope === s.key}
                  className={`h-9 rounded-md text-xs font-semibold transition-colors ${scope === s.key ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {scope === "monthly" && <PeriodStepper label={monthKeyLabel(monthKey)} hint={offsetLabel(monthsApart(thisMonth, monthKey))} onStep={(by) => setMonthKey(addMonths(monthKey, by))} />}
            {scope === "weekly" && (
              <PeriodStepper
                label={weekKeyLabel(weekKey)}
                hint={offsetLabel(Math.round((Date.parse(weekKey) - Date.parse(thisWeek)) / (7 * 86_400_000)))}
                onStep={(by) => setWeekKey(shiftDays(weekKey, by * 7))}
              />
            )}
            {scope === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Start</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 font-mono tabular-nums" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">End</Label>
                  <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-11 font-mono tabular-nums" />
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">{HORIZON_BLURB[scope]}</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-3">
            <input type="checkbox" checked={tracked} onChange={(e) => setTracked(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-foreground)]" />
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">Track a number</span>
              <span className="block text-xs text-muted-foreground">Weight, savings, books. Progress is worked out from the numbers you log.</span>
            </span>
          </label>

          {tracked && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From</Label>
                <Input type="number" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} placeholder="95" className="h-11 font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To</Label>
                <Input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="80" className="h-11 font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg" className="h-11" />
              </div>
            </div>
          )}

          {scope !== "custom" && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Deadline (optional)</Label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="h-11 font-mono tabular-nums" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="default" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={save} disabled={saving}>
            {goal ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
