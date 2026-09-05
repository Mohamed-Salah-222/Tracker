import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DAY_SHORT, TIMES_OF_DAY, TIME_OF_DAY_LABEL, describeSchedule, habitError, type HabitDef, type Schedule, type ScheduleType, type TimeOfDay } from "../lib/habits";

/**
 * How often, when in the day, and whether it is paused.
 *
 * The three settled together because they answer the same question: on a given day,
 * is this habit owed. A habit was previously either every day or a number for the
 * month, so one you actually do on Monday, Wednesday and Friday read as four failures
 * a week and nothing in the app could tell the difference.
 */
const TYPES: { type: ScheduleType; label: string; hint: string }[] = [
  { type: "daily", label: "Every day", hint: "Owed every single day" },
  { type: "weekdays", label: "Certain days", hint: "Pick the days of the week" },
  { type: "timesPerWeek", label: "Times a week", hint: "Any days, as long as the count is met" },
  { type: "everyNDays", label: "Every few days", hint: "A fixed gap between them" },
];

export function HabitScheduleDialog({ habit, onClose, onSaved }: { habit: HabitDef | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [schedule, setSchedule] = useState<Schedule>({ type: "daily", days: [], times: 3, n: 2, anchor: null });
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("anytime");
  const [pausedUntil, setPausedUntil] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset from the habit each time it opens, so a cancelled edit leaves nothing behind.
  useEffect(() => {
    if (!habit) return;
    setSchedule({ ...habit.schedule, days: [...habit.schedule.days] });
    setTimeOfDay(habit.timeOfDay);
    setPausedUntil(habit.pausedUntil ?? "");
  }, [habit]);

  if (!habit) return null;

  const toggleDay = (day: number) => {
    setSchedule((s) => ({ ...s, days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day].sort((a, b) => a - b) }));
  };

  const save = async () => {
    if (schedule.type === "weekdays" && schedule.days.length === 0) {
      toast.error("Pick at least one day of the week");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/habits/${habit._id}`, { schedule, timeOfDay, pausedUntil: pausedUntil || null });
      await onSaved();
      toast.success(`${habit.label}: ${describeSchedule(schedule)}`);
      onClose();
    } catch (e) {
      toast.error(habitError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{habit.label}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ----- How often ----- */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">How often</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {TYPES.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => setSchedule((s) => ({ ...s, type: option.type }))}
                  className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                    schedule.type === option.type ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="block text-[12px] font-medium">{option.label}</span>
                  <span className={`block text-[10px] ${schedule.type === option.type ? "opacity-70" : "text-muted-foreground"}`}>{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {schedule.type === "weekdays" && (
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Which days</Label>
              <div className="mt-1.5 flex gap-1">
                {DAY_SHORT.map((name, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-pressed={schedule.days.includes(day)}
                    className={`h-9 flex-1 rounded-md border text-[11px] font-medium transition-colors ${
                      schedule.days.includes(day) ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
                    }`}
                  >
                    {name.slice(0, 2)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {schedule.type === "timesPerWeek" && (
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Times a week</Label>
              <div className="mt-1.5 flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSchedule((s) => ({ ...s, times: n }))}
                    aria-pressed={schedule.times === n}
                    className={`h-9 flex-1 rounded-md border text-[12px] font-medium tabular-nums transition-colors ${
                      schedule.times === n ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">No day is a miss on its own. The week is kept or it is not.</p>
            </div>
          )}

          {schedule.type === "everyNDays" && (
            <div>
              <Label htmlFor="habit-gap" className="text-[11px] uppercase tracking-wider text-muted-foreground">
                A day every
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  id="habit-gap"
                  type="number"
                  min={2}
                  max={30}
                  value={schedule.n}
                  onChange={(e) => setSchedule((s) => ({ ...s, n: Math.min(Math.max(Number(e.target.value) || 2, 2), 30) }))}
                  className="h-10 w-20"
                />
                <span className="text-[12px] text-muted-foreground">days, counting from {schedule.anchor ?? "today"}</span>
              </div>
            </div>
          )}

          {/* ----- When in the day ----- */}
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">When in the day</Label>
            <div className="mt-1.5 flex gap-1">
              {TIMES_OF_DAY.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTimeOfDay(slot)}
                  aria-pressed={timeOfDay === slot}
                  className={`h-9 flex-1 rounded-md border text-[11px] font-medium transition-colors ${
                    timeOfDay === slot ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"
                  }`}
                >
                  {TIME_OF_DAY_LABEL[slot]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Only for grouping. You can still tick an evening habit at breakfast.</p>
          </div>

          {/* ----- Paused ----- */}
          <div>
            <Label htmlFor="habit-paused" className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Paused until
            </Label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input id="habit-paused" type="date" value={pausedUntil} onChange={(e) => setPausedUntil(e.target.value)} className="h-10" />
              {pausedUntil && (
                <Button variant="ghost" size="sm" className="h-9 shrink-0" onClick={() => setPausedUntil("")}>
                  Clear
                </Button>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Those days are held harmless rather than counted as missed. The history stays.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
