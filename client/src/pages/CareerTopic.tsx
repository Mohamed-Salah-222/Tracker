import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, Check, Eye, Pencil } from "lucide-react";
import { AxiosError } from "axios";
import { ALL_TOPICS, TOPIC_BY_ID, PHASE_BY_TOPIC_ID, CATEGORY_COLOR, CATEGORY_BG } from "../lib/career-curriculum";

// ===== Types =====
type TopicDoc = {
  _id: string;
  topicId: string;
  done: boolean;
  notes: string;
  startedAt: string | null;
  completedAt: string | null;
};

// ===== Helpers =====
function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};
const stagger = (i: number) => ({
  ...fadeUp,
  transition: { ...fadeUp.transition, delay: i * 0.04 },
});

// =====================================================================
// MAIN
// =====================================================================
export default function CareerTopic() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();

  const topic = topicId ? TOPIC_BY_ID[topicId] : undefined;
  const phase = topicId ? PHASE_BY_TOPIC_ID[topicId] : undefined;

  const [doc, setDoc] = useState<TopicDoc | null>(null);
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Prev / next nav
  const { prev, next } = useMemo(() => {
    if (!topicId) return { prev: null, next: null };
    const idx = ALL_TOPICS.findIndex((t) => t.id === topicId);
    return {
      prev: idx > 0 ? ALL_TOPICS[idx - 1] : null,
      next: idx < ALL_TOPICS.length - 1 ? ALL_TOPICS[idx + 1] : null,
    };
  }, [topicId]);

  // ----- Load -----
  const load = useCallback(async () => {
    if (!topicId) return;
    try {
      const r = await api.get<TopicDoc | null>(`/career/topic/${topicId}`);
      if (r.data) {
        setDoc(r.data);
        setNotes(r.data.notes ?? "");
        setDone(r.data.done ?? false);
      } else {
        setDoc(null);
        setNotes("");
        setDone(false);
      }
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset state when topic changes
  useEffect(() => {
    setMode("edit");
    setSavedAt(null);
  }, [topicId]);

  // ----- Debounced auto-save -----
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<{ notes: string; done: boolean } | null>(null);

  const doSave = useCallback(
    async (nextNotes: string, nextDone: boolean) => {
      if (!topicId) return;
      if (lastSavedRef.current && lastSavedRef.current.notes === nextNotes && lastSavedRef.current.done === nextDone) {
        return;
      }
      setSaving(true);
      try {
        const r = await api.put<TopicDoc>(`/career/topic/${topicId}`, {
          notes: nextNotes,
          done: nextDone,
        });
        setDoc(r.data);
        lastSavedRef.current = { notes: nextNotes, done: nextDone };
        setSavedAt(new Date());
      } catch (e) {
        toast.error(getApiError(e));
      } finally {
        setSaving(false);
      }
    },
    [topicId],
  );

  // Auto-save notes 800ms after typing stops
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    // Skip the very first render (before doc loads)
    if (lastSavedRef.current === null && !doc) {
      lastSavedRef.current = { notes, done };
      return;
    }
    saveTimerRef.current = setTimeout(() => {
      void doSave(notes, done);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, done]);

  // Save immediately when done is toggled
  const toggleDone = () => {
    const next = !done;
    setDone(next);
    void doSave(notes, next);
  };

  // ----- Render -----
  if (!topicId || !topic || !phase) {
    return (
      <div className="w-full max-w-[1100px] mx-auto py-12 text-center">
        <div className="text-sm font-medium mb-1">Topic not found.</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/career")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to curriculum
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[860px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => navigate("/career")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Link to="/career" className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors truncate">
            Career · Phase {phase.number} · {phase.title}
          </Link>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums">{saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</div>
        </div>
      </motion.div>

      {/* ===== Topic headline ===== */}
      <motion.div {...stagger(1)} className="space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums">{topic.number.toString().padStart(3, "0")}</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wider"
            style={{
              color: CATEGORY_COLOR[topic.category],
              background: CATEGORY_BG[topic.category],
              borderColor: `color-mix(in oklch, ${CATEGORY_COLOR[topic.category]}, transparent 70%)`,
            }}
          >
            {topic.category}
          </span>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-snug">{topic.title}</h1>
      </motion.div>

      {/* ===== Done + timestamps ===== */}
      <motion.div {...stagger(2)}>
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={done} onCheckedChange={toggleDone} />
              <span className="text-sm font-medium">{done ? "Done" : "Mark as done"}</span>
              {done && (
                <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: "var(--color-income)" }}>
                  <Check className="inline h-3 w-3 mr-0.5" strokeWidth={3} />
                  Completed
                </span>
              )}
            </label>
            <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
              {doc?.startedAt && <span>Started {new Date(doc.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
              {doc?.completedAt && <span className="ml-3">Completed {new Date(doc.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Editor ===== */}
      <motion.div {...stagger(3)}>
        <Card>
          <CardContent className="p-0">
            {/* Tabs */}
            <div className="flex items-center border-b border-border px-2">
              <button type="button" onClick={() => setMode("edit")} className={`px-3 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors relative ${mode === "edit" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <span className="flex items-center gap-1.5">
                  <Pencil className="h-3 w-3" />
                  Edit
                </span>
                {mode === "edit" && <motion.span layoutId="careerEditorTab" className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: "var(--color-foreground)" }} />}
              </button>
              <button type="button" onClick={() => setMode("preview")} className={`px-3 py-2.5 text-xs font-medium uppercase tracking-wider transition-colors relative ${mode === "preview" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3 w-3" />
                  Preview
                </span>
                {mode === "preview" && <motion.span layoutId="careerEditorTab" className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: "var(--color-foreground)" }} />}
              </button>
              <div className="ml-auto text-[10px] text-muted-foreground font-mono tabular-nums pr-3">{notes.length.toLocaleString()} chars</div>
            </div>

            {/* Editor / Preview body */}
            <AnimatePresence mode="wait">
              {mode === "edit" ? (
                <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes in markdown. Use - for bullets, **bold**, `code`, ``` code blocks ```, ## headings." className="w-full p-5 bg-transparent border-0 outline-none resize-y font-mono text-sm leading-relaxed min-h-[400px]" style={{ fontFamily: "var(--font-mono, monospace)" }} spellCheck="false" />
                </motion.div>
              ) : (
                <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="p-5 min-h-[400px]">
                  {notes.trim() ? <MarkdownView source={notes} /> : <div className="text-sm text-muted-foreground italic">Nothing to preview yet.</div>}
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Prev / Next nav ===== */}
      <motion.div {...stagger(4)} className="flex items-center justify-between gap-3 flex-wrap pt-2">
        {prev ? (
          <Link to={`/career/${prev.id}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group min-w-0 flex-1">
            <ChevronLeft className="h-3.5 w-3.5 flex-shrink-0" />
            <div className="min-w-0 text-left">
              <div className="text-[10px] uppercase tracking-wider font-medium font-mono tabular-nums">Prev · {prev.number.toString().padStart(3, "0")}</div>
              <div className="text-sm truncate group-hover:text-foreground transition-colors">{prev.title}</div>
            </div>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
        {next ? (
          <Link to={`/career/${next.id}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group min-w-0 flex-1 justify-end">
            <div className="min-w-0 text-right">
              <div className="text-[10px] uppercase tracking-wider font-medium font-mono tabular-nums">Next · {next.number.toString().padStart(3, "0")}</div>
              <div className="text-sm truncate group-hover:text-foreground transition-colors">{next.title}</div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </motion.div>
    </div>
  );
}

// =====================================================================
// MarkdownView — styled wrapper around ReactMarkdown
// =====================================================================
function MarkdownView({ source }: { source: string }) {
  return (
    <div className="career-markdown prose-sm max-w-none">
      <ReactMarkdown
        components={{
          h1: ({ ...props }) => <h1 className="text-xl font-semibold tracking-tight mb-3 mt-5 first:mt-0" {...props} />,
          h2: ({ ...props }) => <h2 className="text-base font-semibold tracking-tight mb-2 mt-4 first:mt-0" {...props} />,
          h3: ({ ...props }) => <h3 className="text-sm font-semibold tracking-tight mb-2 mt-4 first:mt-0" {...props} />,
          p: ({ ...props }) => <p className="text-sm leading-relaxed mb-3" {...props} />,
          ul: ({ ...props }) => <ul className="list-disc pl-5 space-y-1 mb-3 text-sm" {...props} />,
          ol: ({ ...props }) => <ol className="list-decimal pl-5 space-y-1 mb-3 text-sm" {...props} />,
          li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
          a: ({ ...props }) => <a className="underline hover:text-foreground transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
          code: ({ className, children, ...props }) => {
            const isInline = !className?.includes("language-");
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded text-[12px] font-mono" style={{ background: "var(--color-muted)", color: "var(--color-foreground)" }} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="font-mono text-[12px]" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ ...props }) => <pre className="p-3 rounded-md overflow-x-auto text-[12px] mb-3 border border-border" style={{ background: "var(--color-muted)" }} {...props} />,
          blockquote: ({ ...props }) => <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground my-3" {...props} />,
          hr: ({ ...props }) => <hr className="my-4 border-border" {...props} />,
          strong: ({ ...props }) => <strong className="font-semibold text-foreground" {...props} />,
          em: ({ ...props }) => <em className="italic" {...props} />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
