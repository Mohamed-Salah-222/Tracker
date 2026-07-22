import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { motion } from "motion/react";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { CheckCircle2, CopyPlus, Layers3, Pencil, Plus, Save, Search, Stethoscope, Trash2, X } from "lucide-react";

type LessonStatus = "draft" | "polished" | "course-ready";

type TermCard = {
  word: string;
  arabicMeaning: string;
  explanation: string;
  patientPhrases: string;
};

type Pair = {
  first: TermCard;
  second: TermCard;
  difference: string;
  clarify: string;
  warning: string;
};

type Lesson = {
  _id: string;
  title: string;
  category: string;
  description: string;
  pairs: Pair[];
  status: LessonStatus;
  reviewCount: number;
  lastReviewedAt: string | null;
  updatedAt: string;
};

type Stats = {
  totalLessons: number;
  totalPairs: number;
  courseReady: number;
  reviewed: number;
  categories: string[];
};

type LessonForm = {
  title: string;
  category: string;
  description: string;
  status: LessonStatus;
  pairs: Pair[];
};

const emptyTerm: TermCard = { word: "", arabicMeaning: "", explanation: "", patientPhrases: "" };
const emptyPair: Pair = { first: { ...emptyTerm }, second: { ...emptyTerm }, difference: "", clarify: "", warning: "" };
const emptyForm: LessonForm = {
  title: "",
  category: "Pain quality",
  description: "",
  status: "draft",
  pairs: [{ ...emptyPair, first: { ...emptyTerm }, second: { ...emptyTerm } }],
};

const starterCategories = ["Pain quality", "Symptoms", "Anatomy", "Medication", "Procedures", "Patient wording", "Doctor wording", "Clarification", "Course extra"];

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const },
};

function getApiError(e: unknown) {
  if (e instanceof AxiosError) return (e.response?.data as { error?: string })?.error ?? e.message;
  return "Something went wrong";
}

function clonePair(pair: Pair = emptyPair): Pair {
  return {
    first: { ...pair.first },
    second: { ...pair.second },
    difference: pair.difference,
    clarify: pair.clarify,
    warning: pair.warning,
  };
}

function lessonToForm(lesson: Lesson): LessonForm {
  return {
    title: lesson.title,
    category: lesson.category,
    description: lesson.description,
    status: lesson.status,
    pairs: lesson.pairs.map(clonePair),
  };
}

export default function MedicalEnglish() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LessonForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category !== "all") params.set("category", category);
      const [lessonsRes, statsRes] = await Promise.all([api.get<Lesson[]>(`/medical-english/lessons?${params.toString()}`), api.get<Stats>("/medical-english/lessons/stats")]);
      setLessons(lessonsRes.data);
      setStats(statsRes.data);
      setSelectedId((current) => current ?? lessonsRes.data[0]?._id ?? null);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [category, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedLesson = useMemo(() => lessons.find((lesson) => lesson._id === selectedId) ?? lessons[0], [lessons, selectedId]);
  const categories = useMemo(() => [...new Set([...(stats?.categories ?? []), ...starterCategories])].filter(Boolean).sort(), [stats]);

  const saveLesson = async () => {
    if (!form.title.trim()) {
      toast.error("Add a lesson title first.");
      return;
    }
    if (!form.pairs.some((pair) => pair.first.word.trim() || pair.second.word.trim())) {
      toast.error("Add at least one word pair.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, pairs: form.pairs.filter((pair) => pair.first.word.trim() || pair.second.word.trim()) };
      const res = editingId ? await api.put<Lesson>(`/medical-english/lessons/${editingId}`, payload) : await api.post<Lesson>("/medical-english/lessons", payload);
      setSelectedId(res.data._id);
      resetForm();
      await load();
      toast.success(editingId ? "Lesson updated" : "Lesson saved");
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const editLesson = (lesson: Lesson) => {
    setEditingId(lesson._id);
    setForm(lessonToForm(lesson));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      pairs: [{ ...emptyPair, first: { ...emptyTerm }, second: { ...emptyTerm } }],
    });
  };

  const reviewLesson = async (lesson: Lesson) => {
    try {
      await api.post(`/medical-english/lessons/${lesson._id}/review`);
      await load();
      toast.success("Review logged");
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const deleteLesson = async (lesson: Lesson) => {
    if (!window.confirm(`Delete "${lesson.title}"?`)) return;
    try {
      await api.delete(`/medical-english/lessons/${lesson._id}`);
      if (editingId === lesson._id) resetForm();
      setSelectedId(null);
      await load();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  return (
    <div className="w-full max-w-[1680px] mx-auto flex flex-col gap-3 rounded-[24px] border border-neutral-200 bg-white p-3 md:p-4 text-neutral-900 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <motion.div {...fadeUp} className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-neutral-500">Medical Interpreter English</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1 text-neutral-900">Lesson Pair Bank</h1>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatCard label="Lessons" value={stats?.totalLessons ?? 0} />
          <StatCard label="Pairs" value={stats?.totalPairs ?? 0} />
          <StatCard label="Course" value={stats?.courseReady ?? 0} />
          <StatCard label="Reviewed" value={stats?.reviewed ?? 0} />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 2xl:grid-cols-[430px_330px_minmax(0,1fr)] gap-3 items-start">
        <LessonBuilder form={form} setForm={setForm} categories={categories} editing={!!editingId} saving={saving} onSave={saveLesson} onReset={resetForm} />
        <LessonList lessons={lessons} selectedId={selectedLesson?._id} search={search} setSearch={setSearch} category={category} setCategory={setCategory} categories={categories} onSelect={setSelectedId} />
        <LessonViewer lesson={selectedLesson} onEdit={editLesson} onReview={reviewLesson} onDelete={deleteLesson} />
      </div>
    </div>
  );
}

function LessonBuilder({
  form,
  setForm,
  categories,
  editing,
  saving,
  onSave,
  onReset,
}: {
  form: LessonForm;
  setForm: Dispatch<SetStateAction<LessonForm>>;
  categories: string[];
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const update = (key: keyof LessonForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const updatePair = (index: number, next: Pair) => setForm((current) => ({ ...current, pairs: current.pairs.map((pair, i) => (i === index ? next : pair)) }));
  const addPair = () => setForm((current) => ({ ...current, pairs: [...current.pairs, clonePair()] }));
  const removePair = (index: number) => setForm((current) => ({ ...current, pairs: current.pairs.filter((_, i) => i !== index) || [clonePair()] }));

  return (
    <Card className="rounded-xl border-neutral-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
      <CardContent className="p-0">
        <Header icon={Stethoscope} title={editing ? "Edit Lesson" : "Add Lesson Chunk"} />
        <div className="space-y-3 p-4">
          <Field label="Lesson title">
            <Input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="Today's chunk - Pain quality" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              <Input list="medical-lesson-categories" value={form.category} onChange={(event) => update("category", event.target.value)} placeholder="Pain quality" />
              <datalist id="medical-lesson-categories">
                {categories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(value) => update("status", value)} options={[{ value: "draft", label: "Draft" }, { value: "polished", label: "Polished" }, { value: "course-ready", label: "Course-ready" }]} />
            </Field>
          </div>
          <Field label="Lesson note">
            <Textarea value={form.description} onChange={(value) => update("description", value)} placeholder="What this lesson teaches and why it matters." />
          </Field>

          <div className="space-y-3">
            {form.pairs.map((pair, index) => (
              <PairEditor key={index} index={index} pair={pair} onChange={(next) => updatePair(index, next)} onRemove={() => removePair(index)} canRemove={form.pairs.length > 1} />
            ))}
          </div>

          <Button variant="outline" className="w-full" onClick={addPair}>
            <Plus className="h-4 w-4" />
            Add Another Pair
          </Button>

          <div className="flex gap-2">
            <Button className="flex-1 bg-neutral-900 text-white hover:bg-neutral-800" disabled={saving} onClick={onSave}>
              <Save className="h-4 w-4" />
              {editing ? "Save Changes" : "Save Lesson"}
            </Button>
            {editing && (
              <Button variant="outline" onClick={onReset}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PairEditor({ index, pair, onChange, onRemove, canRemove }: { index: number; pair: Pair; onChange: (pair: Pair) => void; onRemove: () => void; canRemove: boolean }) {
  const updateTerm = (side: "first" | "second", key: keyof TermCard, value: string) => onChange({ ...pair, [side]: { ...pair[side], [key]: value } });
  const updatePair = (key: keyof Pick<Pair, "difference" | "clarify" | "warning">, value: string) => onChange({ ...pair, [key]: value });
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold">Pair {index + 1}</div>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-neutral-400 hover:text-neutral-900" aria-label="Remove pair">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3">
        <TermEditor title="Word A" term={pair.first} onChange={(key, value) => updateTerm("first", key, value)} />
        <TermEditor title="Word B" term={pair.second} onChange={(key, value) => updateTerm("second", key, value)} />
        <Field label="Difference">
          <Textarea value={pair.difference} onChange={(value) => updatePair("difference", value)} placeholder="The important difference between both words." />
        </Field>
        <Field label="Clarify">
          <Textarea value={pair.clarify} onChange={(value) => updatePair("clarify", value)} placeholder="Question to ask when patient wording is unclear." />
        </Field>
        <Field label="Trap / warning">
          <Textarea value={pair.warning} onChange={(value) => updatePair("warning", value)} placeholder="Common mistake, false friend, or context warning." />
        </Field>
      </div>
    </div>
  );
}

function TermEditor({ title, term, onChange }: { title: string; term: TermCard; onChange: (key: keyof TermCard, value: string) => void }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</div>
      <div className="space-y-2">
        <Input value={term.word} onChange={(event) => onChange("word", event.target.value)} placeholder="Sharp" />
        <Textarea value={term.arabicMeaning} onChange={(value) => onChange("arabicMeaning", value)} placeholder="Arabic meaning / ترجمة المعنى" />
        <Textarea value={term.explanation} onChange={(value) => onChange("explanation", value)} placeholder="Explanation, usage, intensity, context." />
        <Textarea value={term.patientPhrases} onChange={(value) => onChange("patientPhrases", value)} placeholder='Patient wording: "وجع زي السكينة" / "حاسس حاجة بتخز"' />
      </div>
    </div>
  );
}

function LessonList({
  lessons,
  selectedId,
  search,
  setSearch,
  category,
  setCategory,
  categories,
  onSelect,
}: {
  lessons: Lesson[];
  selectedId?: string;
  search: string;
  setSearch: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  categories: string[];
  onSelect: (id: string) => void;
}) {
  return (
    <Card className="rounded-xl border-neutral-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
      <CardContent className="p-0">
        <Header icon={Layers3} title="Lessons" />
        <div className="space-y-2 border-b border-neutral-200 bg-neutral-50 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
            <Input className="pl-8 bg-white" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lessons..." />
          </div>
          <Select value={category} onChange={setCategory} options={[{ value: "all", label: "All categories" }, ...categories.map((item) => ({ value: item, label: item }))]} />
        </div>
        <div className="divide-y divide-neutral-200">
          {lessons.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">No lessons yet. Add the pain-quality chunk as your first one.</div>
          ) : (
            lessons.map((lesson) => (
              <button key={lesson._id} type="button" onClick={() => onSelect(lesson._id)} className={`block w-full p-3 text-left transition-colors ${selectedId === lesson._id ? "bg-neutral-900 text-white" : "hover:bg-neutral-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{lesson.title}</div>
                    <div className={`mt-1 text-xs ${selectedId === lesson._id ? "text-white/65" : "text-neutral-500"}`}>
                      {lesson.category} · {lesson.pairs.length} pair{lesson.pairs.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${selectedId === lesson._id ? "bg-white/15 text-white" : "bg-neutral-100 text-neutral-600"}`}>{statusLabel(lesson.status)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LessonViewer({ lesson, onEdit, onReview, onDelete }: { lesson?: Lesson; onEdit: (lesson: Lesson) => void; onReview: (lesson: Lesson) => void; onDelete: (lesson: Lesson) => void }) {
  if (!lesson) {
    return (
      <Card className="rounded-xl border-neutral-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
        <CardContent className="p-10 text-center text-sm text-neutral-500">Select or create a lesson to see its word-pair cards.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-neutral-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
      <CardContent className="p-0">
        <div className="border-b border-white/10 bg-neutral-900 px-4 py-3 text-white">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/55">{lesson.category}</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{lesson.title}</h2>
              {lesson.description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/70">{lesson.description}</p>}
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" className="h-8 border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={() => onReview(lesson)}>
                <CheckCircle2 className="h-4 w-4" />
                Reviewed
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={() => onEdit(lesson)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8 border-white/20 bg-white/10 text-white hover:bg-white/15" onClick={() => onDelete(lesson)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {lesson.pairs.map((pair, index) => (
            <PairViewer key={index} pair={pair} index={index} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PairViewer({ pair, index }: { pair: Pair; index: number }) {
  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200">
      <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold">Pair {index + 1}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <TermViewer term={pair.first} side="A" />
        <TermViewer term={pair.second} side="B" />
      </div>
      {(pair.difference || pair.clarify || pair.warning) && (
        <div className="grid grid-cols-1 gap-2 border-t border-neutral-200 bg-neutral-50 p-3 xl:grid-cols-3">
          <Info label="Difference" value={pair.difference} />
          <Info label="Clarify" value={pair.clarify} />
          <Info label="Trap / warning" value={pair.warning} />
        </div>
      )}
    </section>
  );
}

function TermViewer({ term, side }: { term: TermCard; side: string }) {
  return (
    <article className="border-b border-neutral-200 p-4 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Word {side}</div>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight">{term.word || "Untitled"}</h3>
        </div>
        <CopyPlus className="h-4 w-4 text-neutral-400" />
      </div>
      <div className="mt-3 space-y-2">
        <Info label="Arabic meaning" value={term.arabicMeaning} />
        <Info label="Explanation" value={term.explanation} />
        <Info label="Patient wording" value={term.patientPhrases} />
      </div>
    </article>
  );
}

function Header({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="border-b border-white/10 bg-neutral-900 px-4 py-3 text-white">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" />
        {title}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-24 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-right shadow-sm">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</span>
      {children}
    </label>
  );
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-20 w-full resize-y rounded-lg border border-input bg-white px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{value}</p>
    </div>
  );
}

function statusLabel(status: LessonStatus) {
  if (status === "course-ready") return "Course-ready";
  if (status === "polished") return "Polished";
  return "Draft";
}
