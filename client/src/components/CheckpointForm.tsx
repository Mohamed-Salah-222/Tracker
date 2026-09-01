import { useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { toast } from "sonner";
import { goalError, type Goal } from "../lib/goals";

// =====================================================================
// CheckpointForm
//
// One entry on the timeline: when, what happened, what should have gone better, and
// where the number stands. The reflection field opens by default on a weekly goal,
// since that is the review cycle, and is one click away everywhere else.
// =====================================================================
export default function CheckpointForm({ goal, today, onClose, onSaved }: { goal: Goal; today: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [improve, setImprove] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  // A weekly goal is a review cycle, so it opens with the reflection field showing.
  const [showImprove, setShowImprove] = useState(goal.horizon === "weekly");

  const save = async () => {
    if (!note.trim() && !improve.trim() && !value.trim()) return toast.error("Write something, or record a number");
    setSaving(true);
    try {
      await api.post(`/goals/${goal._id}/checkpoints`, { date, note: note.trim(), improve: improve.trim(), value: value.trim() === "" ? null : Number(value), today });
      onSaved();
    } catch (e) {
      toast.error(goalError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[460px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Checkpoint</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">When</Label>
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-11 font-mono tabular-nums" />
            </div>
            {goal.measure && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Where it stands{goal.measure.unit ? ` (${goal.measure.unit})` : ""}</Label>
                <Input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={String(goal.current ?? goal.measure.startValue)} className="h-11 font-mono tabular-nums" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What happened</Label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Finished the linear algebra course, started on transformers…"
              className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {showImprove ? (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">What should have gone better</Label>
              <textarea
                value={improve}
                onChange={(e) => setImprove(e.target.value)}
                rows={2}
                placeholder="Left it all to the weekend again"
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setShowImprove(true)} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Add what should have gone better
            </button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="default" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" size="default" onClick={save} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
