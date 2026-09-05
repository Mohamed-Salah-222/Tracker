import { useEffect, useState } from "react";
import { Bell, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { taskDay, type Task } from "../lib/tasks";
import { clockOf, instantFrom, minutesBefore } from "../lib/taskWhen";

/**
 * When a task happens, and when to be told about it.
 *
 * The two are separate on purpose. A task at three o'clock does not necessarily want
 * a notification, and a reminder to buy milk does not need the milk to have a time.
 * Setting one offers the other rather than assuming it.
 */
const OFFSETS = [
  { minutes: 0, label: "At the time" },
  { minutes: 10, label: "10 min before" },
  { minutes: 30, label: "30 min before" },
  { minutes: 60, label: "1 hour before" },
];

export function TaskWhenDialog({
  task,
  open,
  onOpenChange,
  onSave,
}: {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: { time: string | null; remindAt: string | null }) => Promise<void> | void;
}) {
  const [time, setTime] = useState("");
  const [remind, setRemind] = useState(false);
  const [remindTime, setRemindTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTime(task.time ?? "");
    setRemind(Boolean(task.remindAt));
    setRemindTime(task.remindAt ? clockOf(task.remindAt) : (task.time ?? "09:00"));
    setOpenedAt(Date.now());
  }, [open, task]);

  const day = taskDay(task);

  const save = async () => {
    if (remind && !remindTime) return toast.error("Pick a time to be reminded");
    setSaving(true);
    try {
      await onSave({
        time: time || null,
        remindAt: remind ? instantFrom(day, remindTime).toISOString() : null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const past = remind && remindTime && openedAt > 0 ? instantFrom(day, remindTime).getTime() < openedAt : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="truncate">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time of day</Label>
            <div className="flex items-center gap-2">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 flex-1 font-mono tabular-nums" />
              {time && (
                <Button variant="ghost" size="sm" className="h-11 text-[11px] text-muted-foreground" onClick={() => setTime("")}>
                  Clear
                </Button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">Leave it empty for "some time today".</p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <button
              type="button"
              onClick={() => {
                const next = !remind;
                setRemind(next);
                if (next && !remindTime) setRemindTime(time || "09:00");
              }}
              aria-pressed={remind}
              className="flex w-full items-center gap-2 text-left"
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${remind ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}>
                <Bell className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">Remind me</span>
                <span className="block text-[11px] text-muted-foreground">A notification, even with the app closed.</span>
              </span>
            </button>

            {remind && (
              <div className="mt-3 space-y-2">
                <Input type="time" value={remindTime} onChange={(e) => setRemindTime(e.target.value)} className="h-11 font-mono tabular-nums" />
                {time && (
                  <div className="flex flex-wrap gap-1">
                    {OFFSETS.map((offset) => (
                      <button
                        key={offset.minutes}
                        type="button"
                        onClick={() => setRemindTime(minutesBefore(day, time, offset.minutes))}
                        className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                      >
                        {offset.label}
                      </button>
                    ))}
                  </div>
                )}
                {past && <p className="text-[11px] text-muted-foreground">That moment has passed, so it will arrive within a minute.</p>}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={() => void save()} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The time and bell as they appear on a row, or nothing when neither is set. */
export function TaskWhenBadges({ task }: { task: Task }) {
  if (!task.time && !task.remindAt) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {task.time && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px font-mono text-[10px] tabular-nums text-muted-foreground">
          <Clock className="h-2.5 w-2.5" aria-hidden />
          {task.time}
        </span>
      )}
      {task.remindAt && (
        <span
          className={`inline-flex items-center rounded-full border px-1 py-px ${task.remindedAt ? "border-border text-muted-foreground" : "border-foreground text-foreground"}`}
          title={task.remindedAt ? "Reminder already sent" : `Reminder at ${clockOf(task.remindAt)}`}
        >
          <Bell className="h-2.5 w-2.5" aria-hidden />
        </span>
      )}
    </span>
  );
}
