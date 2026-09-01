import { useCallback, useEffect, useRef, useState } from "react";
import { NotebookPen, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import { MOODS, journalError, loadDay, parseTags, saveDay, tagsToInput, type JournalEntry, type Mood } from "../lib/journal";

const AUTOSAVE_MS = 1200;

/** The five moods, as a row. Tapping the current one clears it. */
function MoodRow({ value, onChange }: { value: Mood | null; onChange: (m: Mood | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {MOODS.map((mood) => (
        <button
          key={mood}
          type="button"
          onClick={() => onChange(value === mood ? null : mood)}
          aria-pressed={value === mood}
          className={`h-7 rounded-full border px-2.5 text-[11px] font-semibold capitalize transition-colors ${
            value === mood ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {mood}
        </button>
      ))}
    </div>
  );
}

// =====================================================================
// JournalCard
//
// The day's own page. Saves itself a beat after you stop typing, because a journal
// you have to remember to submit is a journal with half its entries missing.
// =====================================================================
export default function JournalCard({ date }: { date: string }) {
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<Mood | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  // What the server holds, so autosave can tell a real edit from a reload.
  const clean = useRef({ body: "", mood: null as Mood | null, tags: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const found = await loadDay(date);
      setEntry(found);
      setBody(found?.body ?? "");
      setMood(found?.mood ?? null);
      const tags = tagsToInput(found?.tags ?? []);
      setTagInput(tags);
      clean.current = { body: found?.body ?? "", mood: found?.mood ?? null, tags };
      setSaved(false);
    } catch (e) {
      toast.error(journalError(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const flush = useCallback(async () => {
    const tags = parseTags(tagInput);
    try {
      const result = await saveDay({ date, body, mood, tags });
      setEntry(result);
      clean.current = { body, mood, tags: tagInput };
      setSaved(true);
      // The tick is an acknowledgement, not a status, so it goes away on its own.
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      toast.error(journalError(e));
    }
  }, [body, date, mood, tagInput]);

  useEffect(() => {
    if (loading) return;
    const dirty = body !== clean.current.body || mood !== clean.current.mood || tagInput !== clean.current.tags;
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [body, mood, tagInput, loading, flush]);

  // Leaving the page mid-sentence must not lose it, and switching day remounts this.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (loading) return <Skeleton className="h-[168px] rounded-xl" />;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Journal</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] tabular-nums text-muted-foreground">
            {entry && entry.words > 0 && <span>{entry.words} words</span>}
            {saved && (
              <span className="inline-flex items-center gap-1 font-sans font-semibold uppercase tracking-wide">
                <Check className="h-3 w-3" aria-hidden />
                saved
              </span>
            )}
          </div>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => void flush()}
          rows={4}
          placeholder="How did the day actually go?"
          aria-label="Journal entry"
          className="mt-2 w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <MoodRow value={mood} onChange={setMood} />
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onBlur={() => void flush()}
            placeholder="#tags"
            aria-label="Tags"
            className="h-7 min-w-[7rem] flex-1 text-[11px]"
          />
        </div>

        {entry && (
          <div className="mt-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-muted-foreground"
              onClick={() => {
                setBody("");
                setMood(null);
                setTagInput("");
              }}
            >
              Clear the page
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
