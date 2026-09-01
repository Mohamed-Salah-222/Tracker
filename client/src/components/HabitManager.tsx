import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Lock, RotateCcw, Trash2 } from "lucide-react";
import { HABIT_ICONS, habitError, listHabits, monthlyLabel, type HabitDef, type HabitType } from "../lib/habits";
import { HabitGlyph } from "./HabitGlyph";

// =====================================================================
// HabitManager
//
// Reordering, editing and retiring what already exists. Creating a habit is its own
// button on the page, so this dialog is not two jobs wearing one hat.
// =====================================================================
export default function HabitManager({ open, onOpenChange, onChanged }: { open: boolean; onOpenChange: (b: boolean) => void; onChanged: () => void }) {
  const [habits, setHabits] = useState<HabitDef[]>([]);
  const [archived, setArchived] = useState<HabitDef[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<HabitDef | null>(null);
  const [pendingPurge, setPendingPurge] = useState<HabitDef | null>(null);

  const load = useCallback(async () => {
    try {
      const [live, gone] = await Promise.all([listHabits(false), listHabits(true)]);
      setHabits(live);
      setArchived(gone);
    } catch (e) {
      toast.error(habitError(e));
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const refresh = async () => {
    await load();
    onChanged();
  };

  const move = async (index: number, by: number) => {
    const next = [...habits];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setHabits(next);
    try {
      await api.put("/habits/order", { ids: next.map((h) => h._id) });
      onChanged();
    } catch (e) {
      toast.error(habitError(e));
      void load();
    }
  };

  const archive = async (habit: HabitDef) => {
    try {
      const r = await api.delete<{ keptDays: number }>(`/habits/${habit._id}`);
      toast.success(r.data.keptDays > 0 ? `${habit.label} archived. Its ${r.data.keptDays} days are kept.` : `${habit.label} archived`);
      await refresh();
    } catch (e) {
      toast.error(habitError(e));
    }
  };

  const restore = async (habit: HabitDef) => {
    try {
      await api.post(`/habits/${habit._id}/restore`);
      await refresh();
    } catch (e) {
      toast.error(habitError(e));
    }
  };

  const purge = async () => {
    const habit = pendingPurge;
    setPendingPurge(null);
    if (!habit) return;
    try {
      const r = await api.delete<{ daysRemoved: number }>(`/habits/${habit._id}/permanent`);
      toast.success(`${habit.label} deleted, along with ${r.data.daysRemoved} days of history`);
      await refresh();
    } catch (e) {
      toast.error(habitError(e));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[560px] max-h-[92svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your habits</DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5">
            {habits.map((habit, i) => (
              <div key={habit._id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
                <HabitGlyph name={habit.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button type="button" onClick={() => setEditing(habit)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{habit.label}</span>
                    {habit.derivedFrom && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Filled in from another page" />}
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {habit.type === "count" ? `${habit.dailyTarget}${habit.unit ? " " + habit.unit : ""} a day` : "Tick"} · {monthlyLabel(habit.monthlyTarget)}
                    {habit.onHabitsPage ? "" : " · grid only"}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => void move(i, -1)} disabled={i === 0} aria-label={`Move ${habit.label} up`} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30">
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button type="button" onClick={() => void move(i, 1)} disabled={i === habits.length - 1} aria-label={`Move ${habit.label} down`} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30">
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {!habit.derivedFrom && (
                    <button type="button" onClick={() => void archive(habit)} aria-label={`Archive ${habit.label}`} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {archived.length > 0 && (
            <div className="border-t border-border pt-3">
              <button type="button" onClick={() => setShowArchived((v) => !v)} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                {showArchived ? "Hide" : "Show"} archived ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-2 space-y-1.5">
                  {archived.map((habit) => (
                    <div key={habit._id} className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong px-2 py-1.5 opacity-70">
                      <span className="min-w-0 flex-1 truncate text-sm">{habit.label}</span>
                      <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => void restore(habit)}>
                        <RotateCcw className="h-3 w-3 mr-1" aria-hidden />
                        Restore
                      </Button>
                      <button type="button" onClick={() => setPendingPurge(habit)} aria-label={`Delete ${habit.label} for good`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">A locked habit is filled in from another page, so its name and target can change here but not how it is measured.</p>
        </DialogContent>
      </Dialog>

      {editing && (
        <HabitForm
          habit={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <AlertDialog open={!!pendingPurge} onOpenChange={(o) => !o && setPendingPurge(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingPurge?.label}” for good?</AlertDialogTitle>
            <AlertDialogDescription>Every day you ever recorded for it goes too. Archiving is the reversible option; this one is not.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={() => void purge()}>
              Delete for good
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// =====================================================================
// HabitForm
// =====================================================================
export function HabitForm({ habit, onClose, onSaved }: { habit: HabitDef | null; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(habit?.label ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? "circle-check");
  const [type, setType] = useState<HabitType>(habit?.type ?? "check");
  const [dailyTarget, setDailyTarget] = useState(String(habit?.dailyTarget || ""));
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [monthly, setMonthly] = useState(String(habit?.monthlyTarget || ""));
  const [onPage, setOnPage] = useState(habit?.onHabitsPage ?? true);
  const [saving, setSaving] = useState(false);

  const locked = !!habit?.derivedFrom;

  const save = async () => {
    if (!label.trim()) return toast.error("Give it a name");
    const target = dailyTarget.trim() === "" ? 0 : Number(dailyTarget);
    if (type === "count" && (!Number.isFinite(target) || target <= 0)) return toast.error("A counted habit needs a daily target above 0");
    const monthlyNum = monthly.trim() === "" ? 0 : Number(monthly);
    if (!Number.isFinite(monthlyNum) || monthlyNum < 0) return toast.error("Monthly target must be zero or more");
    if (monthlyNum > 31) return toast.error("A month has at most 31 days");

    setSaving(true);
    try {
      const body = { label: label.trim(), description: description.trim(), icon, type, dailyTarget: target, unit: unit.trim(), monthlyTarget: monthlyNum, onHabitsPage: onPage };
      if (habit) await api.patch(`/habits/${habit._id}`, body);
      else await api.post("/habits", body);
      toast.success(habit ? "Saved" : `${label.trim()} added`);
      onSaved();
    } catch (e) {
      toast.error(habitError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[440px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{habit ? habit.label : "New habit"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Stretching, Meditate, Water the plants" className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">How to track it</Label>
            <Select value={type} onValueChange={(v) => setType((v ?? "check") as HabitType)} disabled={locked}>
              <SelectTrigger className="w-full !h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="check">Tick it off</SelectItem>
                <SelectItem value="count">Record a number</SelectItem>
              </SelectContent>
            </Select>
            {locked && <p className="text-[11px] text-muted-foreground">This one is filled in from another page, so how it is measured is fixed.</p>}
          </div>

          {type === "count" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Done at</Label>
                <Input type="number" inputMode="numeric" min="1" value={dailyTarget} onChange={(e) => setDailyTarget(e.target.value)} placeholder="10000" className="h-11 font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Of what</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="steps, pages, times" className="h-11" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Days a month</Label>
            <Input type="number" inputMode="numeric" min="0" max="31" value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="every day" className="h-11 font-mono tabular-nums" />
            <p className="text-[11px] text-muted-foreground">How many days this month counts as a full month. Leave it blank for every day.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Icon</Label>
            <div className="flex flex-wrap gap-1">
              {HABIT_ICONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  aria-label={name}
                  aria-pressed={icon === name}
                  className={`grid h-9 w-9 place-items-center rounded-lg border transition-colors ${icon === name ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
                >
                  <HabitGlyph name={name} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Note under the name (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What counts as doing it" className="h-11" />
          </div>

          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={onPage} onChange={(e) => setOnPage(e.target.checked)} className="h-4 w-4 accent-[var(--color-foreground)]" />
            <span className="text-sm">Show it on this page, not just the dashboard grid</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" size="default" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={save} disabled={saving}>
            {habit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
