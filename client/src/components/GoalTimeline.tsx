import { useState } from "react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { toast } from "sonner";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { dayLabel, goalError, type Checkpoint } from "../lib/goals";

// =====================================================================
// GoalTimeline
//
// Checkpoints alternate either side of a centre spine, newest first.
//
// The alternation only works once there is room for two columns, so below the md
// breakpoint the spine moves to the left edge and every entry sits to its right.
// Keeping two columns on a phone would give you two unreadable ones.
// =====================================================================
export default function GoalTimeline({ goalId, rows, unit, onChanged }: { goalId: string; rows: Checkpoint[] | null; unit: string; onChanged: () => void }) {
  if (rows === null) return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-label="Loading the timeline" />;

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="px-6 py-8 text-center">
          <div className="text-base font-semibold">The timeline is empty</div>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add a checkpoint every few days. Write what you did, what should have gone better, and where the number stands. Over time this becomes the story of how it actually went.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-label="Timeline" className="relative">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</h2>
      <div className="pointer-events-none absolute bottom-0 left-[7px] top-9 w-px bg-border md:left-1/2" aria-hidden />
      <ol className="space-y-4">
        {rows.map((row, i) => (
          <TimelineEntry key={row._id} goalId={goalId} row={row} unit={unit} side={i % 2 === 0 ? "left" : "right"} onChanged={onChanged} />
        ))}
      </ol>
    </section>
  );
}

function TimelineEntry({ goalId, row, unit, side, onChanged }: { goalId: string; row: Checkpoint; unit: string; side: "left" | "right"; onChanged: () => void }) {
  const [commenting, setCommenting] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const addComment = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.post(`/goals/${goalId}/checkpoints/${row._id}/comments`, { body });
      setDraft("");
      setCommenting(false);
      onChanged();
    } catch (e) {
      toast.error(goalError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (commentId: string) => {
    try {
      await api.delete(`/goals/${goalId}/checkpoints/${row._id}/comments/${commentId}`);
      onChanged();
    } catch (e) {
      toast.error(goalError(e));
    }
  };

  const removeEntry = async () => {
    try {
      await api.delete(`/goals/${goalId}/checkpoints/${row._id}`);
      onChanged();
    } catch (e) {
      toast.error(goalError(e));
    }
  };

  // Which half the card occupies. Both sides collapse to one column on a phone.
  const place = side === "left" ? "md:col-start-1 md:pr-7 md:text-right" : "md:col-start-2 md:pl-7";
  const dot = side === "left" ? "md:left-auto md:-right-[5px]" : "md:-left-[5px]";

  return (
    <li className="grid grid-cols-1 md:grid-cols-2">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className={`relative pl-6 md:pl-0 ${place}`}>
        {/* The dot rides the spine: the left edge on a phone, the inner edge of the
            card once the layout splits in two. */}
        <span className={`absolute left-[3px] top-3 h-2.5 w-2.5 rounded-full border-2 border-background bg-foreground ${dot}`} aria-hidden />

        <div className="group rounded-xl border border-border bg-card p-3 transition-colors hover:border-border-strong">
          <div className={`flex items-baseline gap-2 ${side === "left" ? "md:flex-row-reverse" : ""}`}>
            <span className="font-mono text-[11px] font-semibold tabular-nums">{dayLabel(row.date)}</span>
            {row.value !== null && (
              <span className="rounded-full bg-muted px-1.5 py-px font-mono text-[10px] font-semibold tabular-nums">
                {row.value}
                {unit ? ` ${unit}` : ""}
              </span>
            )}
            <button
              type="button"
              onClick={removeEntry}
              aria-label={`Remove the checkpoint from ${dayLabel(row.date)}`}
              className={`grid h-6 w-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 ${side === "left" ? "md:mr-auto" : "ml-auto"}`}
            >
              <Trash2 className="h-3 w-3" aria-hidden />
            </button>
          </div>

          {row.note && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{row.note}</p>}

          {row.improve && (
            <div className="mt-2 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Better next time</div>
              <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">{row.improve}</p>
            </div>
          )}

          {row.comments.length > 0 && (
            <ul className="mt-2 space-y-1 border-t border-border pt-2">
              {row.comments.map((c) => (
                <li key={c._id} className={`group/c flex items-start gap-1.5 ${side === "left" ? "md:flex-row-reverse" : ""}`}>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">{c.body}</span>
                  <button
                    type="button"
                    onClick={() => removeComment(c._id)}
                    aria-label="Remove this note"
                    className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/c:opacity-100"
                  >
                    <Trash2 className="h-2.5 w-2.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {commenting ? (
            <div className={`mt-2 flex items-center gap-1.5 ${side === "left" ? "md:flex-row-reverse" : ""}`}>
              <Input
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addComment();
                  if (e.key === "Escape") setCommenting(false);
                }}
                placeholder="Add a note to this checkpoint"
                aria-label="Add a note to this checkpoint"
                className="h-9 text-[12px]"
              />
              <button type="button" onClick={addComment} disabled={busy || !draft.trim()} className="shrink-0 rounded-md border border-border-strong px-2 py-1 text-[11px] font-semibold transition-colors hover:bg-muted disabled:opacity-40">
                Add
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCommenting(true)}
              className={`mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-opacity hover:text-foreground focus-visible:opacity-100 ${
                row.comments.length > 0 ? "" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <MessageSquarePlus className="h-3 w-3" aria-hidden />
              Note
            </button>
          )}
        </div>
      </motion.div>
    </li>
  );
}
