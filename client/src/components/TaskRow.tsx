import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";
import { relativeDay, taskDay, type Task } from "../lib/tasks";

// =====================================================================
// One task row, shared by Today and the Tasks calendar.
//
// The actions used to be `opacity-0 group-hover:opacity-100`, which meant they
// simply did not exist on a touch screen — delete and reschedule were unreachable
// on a phone. They are always rendered now, dimmed until hover on pointer devices.
// =====================================================================
export function TaskRow({
  task,
  onToggle,
  onRename,
  onDelete,
  onMove,
  moveLabel = "Move to tomorrow",
  showDate = false,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onRename: (task: Task, title: string) => void;
  onDelete: (task: Task) => void;
  onMove?: (task: Task) => void;
  moveLabel?: string;
  showDate?: boolean;
}) {
  // The day's anchor task is fixed: renaming or deleting it would only have it
  // reappear, so those controls are not offered for it.
  const locked = task.isDefault === true;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(task.title), [task.title]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === task.title) {
      setDraft(task.title);
      return;
    }
    onRename(task, next);
  };

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18 }}
      className="group flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted/50"
    >
      <label className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted">
        <Checkbox checked={task.done} aria-label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`} onCheckedChange={() => onToggle(task)} />
      </label>

      {editing ? (
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(task.title);
              setEditing(false);
            }
          }}
          aria-label="Task title"
          className="h-9 flex-1 text-sm"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => !locked && setEditing(true)}
          onClick={() => onToggle(task)}
          className="min-w-0 flex-1 text-left"
          aria-label={`${task.title}${locked ? ", the day's anchor task" : ""}${showDate ? `, ${relativeDay(taskDay(task))}` : ""}`}
        >
          <span className="flex items-center gap-1.5">
            <span className={`truncate text-sm ${task.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</span>
            {locked && (
              <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground" title="Added automatically each day">
                Daily
              </span>
            )}
          </span>
          {showDate && <span className="mt-0.5 block text-[11px] text-muted-foreground">{relativeDay(taskDay(task))}</span>}
        </button>
      )}

      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100 md:opacity-0">
          {!locked && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Rename "${task.title}"`}
              className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {onMove && !task.done && !locked && (
            <button
              type="button"
              onClick={() => onMove(task)}
              aria-label={`${moveLabel}: "${task.title}"`}
              title={moveLabel}
              className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          {!locked && (
            <button
              type="button"
              onClick={() => onDelete(task)}
              aria-label={`Delete "${task.title}"`}
              className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
