import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CalendarClock, NotebookPen, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { todayISO } from "../lib/today";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import {
  MOODS,
  journalError,
  listEntries,
  loadOnThisDay,
  loadStats,
  parseTags,
  saveDay,
  tagsToInput,
  type JournalRow,
  type JournalStats,
  type Mood,
} from "../lib/journal";

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({ ...fadeUp, transition: { ...fadeUp.transition, delay: Math.min(i, 8) * 0.03 } });

const PAGE = 20;

function dayLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** How long ago, in the roundest useful unit. */
function agoLabel(iso: string, today: string): string {
  const days = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(iso + "T00:00:00Z")) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

/**
 * One day in the archive.
 *
 * Collapsed it is a date and a first line; opened it is the whole page, editable in
 * place. Rereading is most of the value of keeping a journal, so an entry is never
 * more than one tap from being read in full.
 */
function EntryRow({ row, today, onChanged }: { row: JournalRow; today: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(row.body);
  const [mood, setMood] = useState<Mood | null>(row.mood);
  const [tagInput, setTagInput] = useState(tagsToInput(row.tags));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveDay({ date: row.date, body, mood, tags: parseTags(tagInput) });
      setEditing(false);
      onChanged();
    } catch (e) {
      toast.error(journalError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.delete("/journal/day", { params: { date: row.date } });
      onChanged();
    } catch (e) {
      toast.error(journalError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div layout className="rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 p-3.5 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{dayLabel(row.date)}</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{agoLabel(row.date, today)}</span>
            {row.mood && <span className="rounded-full border border-border-strong px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{row.mood}</span>}
          </div>
          {!open && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{row.excerpt}</p>}
        </div>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{row.words}w</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="border-t border-border p-3.5">
              {editing ? (
                <div className="space-y-2">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={8}
                    aria-label="Entry text"
                    className="w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus:border-foreground"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    {MOODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMood(mood === m ? null : m)}
                        aria-pressed={mood === m}
                        className={`h-7 rounded-full border px-2.5 text-[11px] font-semibold capitalize transition-colors ${
                          mood === m ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                    <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="#tags" aria-label="Tags" className="h-7 min-w-[7rem] flex-1 text-[11px]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="default" size="sm" className="h-8" onClick={() => void save()} disabled={saving}>
                      Save
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{row.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {row.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        #{tag}
                      </span>
                    ))}
                    <Button variant="outline" size="sm" className="ml-auto h-8" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void remove()} disabled={saving} aria-label="Delete this entry">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =====================================================================
// Journal
// =====================================================================
export default function Journal() {
  const today = todayISO();
  const [rows, setRows] = useState<JournalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<JournalStats | null>(null);
  const [onThisDay, setOnThisDay] = useState<JournalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [limit, setLimit] = useState(PAGE);

  // Typing is not a search. The list waits for a pause rather than firing a request
  // per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit, offset: 0 };
      if (query) params.q = query;
      if (tag) params.tag = tag;
      if (mood) params.mood = mood;
      const [list, s] = await Promise.all([listEntries(params), loadStats(today)]);
      setRows(list.items);
      setTotal(list.total);
      setStats(s);
    } catch (e) {
      toast.error(journalError(e));
    } finally {
      setLoading(false);
    }
  }, [limit, mood, query, tag, today]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadOnThisDay(today).then(setOnThisDay).catch(() => setOnThisDay([]));
  }, [today]);

  const filtering = Boolean(query || tag || mood);
  const topTags = useMemo(() => (stats?.tags ?? []).slice(0, 10), [stats]);

  return (
    <div className="w-full max-w-[820px] space-y-4">
      <motion.header {...fadeUp} className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <NotebookPen className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold tracking-tight">Journal</h1>
        </div>
        {stats && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-muted-foreground">
            <span>{stats.entries} entries</span>
            <span>· {stats.words.toLocaleString("en-US")} words</span>
            {stats.streak > 0 && <span>· {stats.streak} day streak</span>}
          </div>
        )}
      </motion.header>

      {onThisDay.length > 0 && (
        <motion.section {...stagger(1)} aria-label="On this day">
          <Card>
            <CardContent className="p-3.5">
              <h2 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarClock className="h-3 w-3" aria-hidden />
                On this day
              </h2>
              <div className="mt-2 space-y-2">
                {onThisDay.slice(0, 3).map((row) => (
                  <div key={row._id} className="flex items-start gap-2 text-[12px]">
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{agoLabel(row.date, today)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.excerpt}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.section>
      )}

      <motion.div {...stagger(2)} className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search everything you have written" aria-label="Search entries" className="h-10 pl-8" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(mood === m ? null : m)}
              aria-pressed={mood === m}
              className={`h-7 rounded-full border px-2.5 text-[11px] font-semibold capitalize transition-colors ${
                mood === m ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted-foreground hover:bg-muted"
              }`}
            >
              {m}
              {stats?.moods[m] ? <span className="ml-1 font-mono opacity-70">{stats.moods[m]}</span> : null}
            </button>
          ))}
          {topTags.map((t) => (
            <button
              key={t.tag}
              type="button"
              onClick={() => setTag(tag === t.tag ? null : t.tag)}
              aria-pressed={tag === t.tag}
              className={`h-7 rounded-full border px-2.5 font-mono text-[11px] transition-colors ${
                tag === t.tag ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              #{t.tag}
              <span className="ml-1 opacity-70">{t.count}</span>
            </button>
          ))}
          {filtering && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => {
                setSearch("");
                setTag(null);
                setMood(null);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </motion.div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm font-medium">{filtering ? "Nothing matches that." : "Nothing written yet."}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {filtering ? "Try a different word, tag or mood." : "The day's page lives on Today, under the tasks. It saves itself as you type."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <motion.div {...stagger(3)} className="space-y-2">
          {rows.map((row) => (
            <EntryRow key={row._id} row={row} today={today} onChanged={() => void load()} />
          ))}
          {rows.length < total && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" size="sm" className="h-9" onClick={() => setLimit((l) => l + PAGE)}>
                Show more ({total - rows.length} left)
              </Button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
