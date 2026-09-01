import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { PAGE_LIMIT, pageRangeLabel, type Page } from "../lib/pagination";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { Archive, Plus, RotateCcw, Ruler, Search, ShoppingBasket, Trash2, TriangleAlert } from "lucide-react";
import { AxiosError } from "axios";
import RecipesSection from "../components/RecipesSection";
import { useRecipes } from "../lib/recipes";

// ===== Types =====
type Category = "protein" | "carbs" | "fats" | "vegetables" | "snacks" | "drinks" | "prepared" | "other";
type EntryMode = "perGram" | "perUnit";

type Food = {
  _id: string;
  name: string;
  category: Category;
  entryMode: EntryMode;
  trackInFridge: boolean;
  caloriesPerGram: number;
  proteinPerGram: number;
  carbsPerGram: number;
  fatPerGram: number;
  defaultServingGrams: number | null;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  carbsPerUnit: number;
  fatPerUnit: number;
  unitLabel: string;
};

/** The list response carries the true size of every category, not just the loaded rows. */
type FoodsPage = Page<Food> & { categoryCounts?: Record<string, number>; needsServingCount?: number; archivedCount?: number };

const CATEGORIES: Category[] = ["protein", "carbs", "fats", "vegetables", "snacks", "drinks", "prepared", "other"];

// ===== Helpers =====
function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
}

/**
 * Strict, unlike parseFloat, which reads "12abc" as 12 and let "abc" through as 0
 * because of the `|| 0` that followed it. A typo should stop the save, not be
 * quietly stored as a real macro value.
 */
function parseMacro(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return 0;
  if (!/^d*.?d+$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Protein and carbs are 4 calories a gram, fat is 9. A food whose macros do not add
 * up to its calorie figure usually has a typo in one of the four, and nothing in the
 * app would ever notice: every total downstream just inherits the mistake.
 */
function macroMismatch(cal: number, p: number, c: number, f: number): number | null {
  const derived = p * 4 + c * 4 + f * 9;
  if (cal < 5 && derived < 5) return null;
  const off = Math.abs(derived - cal);
  if (off <= Math.max(30, cal * 0.35)) return null;
  return Math.round(derived);
}

// Headline calories for a card
function caloriesDisplay(food: Food) {
  if (food.entryMode === "perUnit") {
    return Math.round(food.caloriesPerUnit);
  }
  return Math.round(food.caloriesPerGram * 100);
}

function caloriesUnit(food: Food) {
  if (food.entryMode === "perUnit") {
    return `per ${food.unitLabel || "unit"}`;
  }
  return "per 100g";
}

// ===== Motion =====
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
export default function Foods() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [foodTotal, setFoodTotal] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [needsServingOnly, setNeedsServingOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { recipes, loading: recipesLoading, reload: reloadRecipes } = useRecipes();
  const [needsServingCount, setNeedsServingCount] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  // The input stays instant, but only the settled value reaches the query,
  // otherwise every keystroke fires its own /foods request.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const foodFilters = useCallback(() => {
    const params: Record<string, string> = {};
    if (debouncedSearch) params.search = debouncedSearch;
    if (filterCat !== "all") params.category = filterCat;
    if (needsServingOnly) params.needsServing = "1";
    if (showArchived) params.archived = "1";
    return params;
  }, [debouncedSearch, filterCat, needsServingOnly, showArchived]);

  // First page; a search or category change re-runs this from offset 0.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<FoodsPage>("/foods", {
        params: { ...foodFilters(), limit: PAGE_LIMIT, offset: 0 },
      });
      setFoods(r.data.items);
      setFoodTotal(r.data.total);
      setCategoryCounts(r.data.categoryCounts ?? {});
      setNeedsServingCount(r.data.needsServingCount ?? 0);
      setArchivedCount(r.data.archivedCount ?? 0);
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoading(false);
    }
  }, [foodFilters]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await api.get<FoodsPage>("/foods", {
        params: { ...foodFilters(), limit: PAGE_LIMIT, offset: foods.length },
      });
      setFoods((prev) => [...prev, ...r.data.items]);
      setFoodTotal(r.data.total);
      setCategoryCounts(r.data.categoryCounts ?? {});
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const g: Record<string, Food[]> = {};
    for (const f of foods) (g[f.category] ||= []).push(f);
    return g;
  }, [foods]);

  const groupOrder = CATEGORIES.filter((c) => (categoryCounts[c] ?? 0) > 0 || grouped[c]);
  const hasFilters = !!search || filterCat !== "all" || needsServingOnly || showArchived;

  return (
    <div className="w-full max-w-[1100px] space-y-4">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex items-center justify-between gap-3">
        <div className="hidden items-center gap-3 md:flex">
          <h1 className="text-xl font-semibold tracking-tight">Foods</h1>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {pageRangeLabel(foods.length, foodTotal)} {foodTotal === 1 ? "item" : "items"}
          </span>
        </div>
        <h1 className="sr-only md:hidden">Foods</h1>
        <Button variant="default" size="sm" className="ml-auto h-9" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add food
        </Button>
      </motion.div>

      {/* ===== Filters ===== */}
      <motion.div {...stagger(1)}>
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a food..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Category</Label>
                <Select value={filterCat} onValueChange={(v) => setFilterCat(v ?? "all")}>
                  <SelectTrigger className="w-full !h-8 capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(needsServingCount > 0 || archivedCount > 0 || needsServingOnly || showArchived) && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {(needsServingCount > 0 || needsServingOnly) && (
                  <FilterChip active={needsServingOnly} onClick={() => setNeedsServingOnly((v) => !v)} icon={<Ruler className="h-3 w-3" aria-hidden />}>
                    Needs a serving {needsServingCount}
                  </FilterChip>
                )}
                {(archivedCount > 0 || showArchived) && (
                  <FilterChip active={showArchived} onClick={() => setShowArchived((v) => !v)} icon={<Archive className="h-3 w-3" aria-hidden />}>
                    Archived {archivedCount}
                  </FilterChip>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Recipes ===== */}
      <motion.div {...stagger(2)}>
        <RecipesSection recipes={recipes} loading={recipesLoading} onChanged={reloadRecipes} />
      </motion.div>

      {/* ===== Loading ===== */}
      {loading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading foods">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-xl" />
          ))}
        </div>
      )}

      {/* ===== Empty state ===== */}
      {!loading && groupOrder.length === 0 && (
        <motion.div {...stagger(2)}>
          <Card>
            <CardContent className="px-6 py-6 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
              </div>
              {hasFilters ? (
                <>
                  <div className="text-base font-semibold">No foods match</div>
                  <p className="mt-1 text-sm text-muted-foreground">Try a different search or category.</p>
                </>
              ) : (
                <>
                  <div className="text-base font-semibold">No foods yet</div>
                  <p className="mt-1 text-sm text-muted-foreground">Add one to start logging meals on the Calories page.</p>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ===== Category sections ===== */}
      {!loading &&
        groupOrder.map((cat, ci) => {
          const shown = grouped[cat] ?? [];
          const real = categoryCounts[cat] ?? shown.length;
          const hidden = Math.max(0, real - shown.length);
          return (
            <motion.div key={cat} {...stagger(ci + 2)} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 px-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground capitalize">{cat}</span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{real}</span>
                </div>
                {/* Jumping to the category filter fetches the whole of it, rather than
                    paging blindly through everything in front of it. */}
                {hidden > 0 && (
                  <button type="button" onClick={() => setFilterCat(cat)} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground underline underline-offset-2 hover:text-foreground">
                    {shown.length === 0 ? `Show all ${real}` : `+${hidden} more`}
                  </button>
                )}
              </div>
              {shown.length > 0 && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {shown.map((f, i) => (
                    <FoodCard key={f._id} food={f} onChanged={load} index={i} archivedView={showArchived} />
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}

      {!loading && foods.length < foodTotal && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Load ${Math.min(PAGE_LIMIT, foodTotal - foods.length)} more`}
          </Button>
        </div>
      )}

      <FoodFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={load} />
    </div>
  );
}

function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// =====================================================================
// FoodCard
// =====================================================================
function FoodCard({ food, onChanged, index, archivedView }: { food: Food; onChanged: () => void; index: number; archivedView: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [servingOpen, setServingOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);

  const purge = async () => {
    try {
      const r = await api.delete<{ recipesRemoved?: number }>(`/foods/${food._id}/permanent`);
      toast.success(r.data?.recipesRemoved ? "Gone, along with a recipe that had nothing left in it" : "Gone for good");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const restore = async () => {
    try {
      await api.post(`/foods/${food._id}/restore`);
      toast.success(`${food.name} is back`);
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const del = async () => {
    try {
      const r = await api.delete<{ untrackedFromKitchen?: number }>(`/foods/${food._id}`);
      toast.success(r.data?.untrackedFromKitchen ? `Archived, and taken off your kitchen shelf` : "Archived");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const cal = caloriesDisplay(food);
  const unit = caloriesUnit(food);
  const per = food.entryMode === "perUnit" ? 1 : 100;
  const macros = {
    p: Math.round((food.entryMode === "perUnit" ? food.proteinPerUnit : food.proteinPerGram * per) * 10) / 10,
    c: Math.round((food.entryMode === "perUnit" ? food.carbsPerUnit : food.carbsPerGram * per) * 10) / 10,
    f: Math.round((food.entryMode === "perUnit" ? food.fatPerUnit : food.fatPerGram * per) * 10) / 10,
  };
  const needsServing = food.entryMode === "perGram" && !food.defaultServingGrams;
  const mismatch = macroMismatch(cal, macros.p, macros.c, macros.f);

  return (
    <>
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => (archivedView ? void restore() : setEditOpen(true))}
        className={`group relative flex min-h-[132px] flex-col rounded-xl border bg-card p-3 text-left transition-colors hover:border-border-strong ${archivedView ? "border-dashed border-border-strong opacity-70" : "border-border"}`}
        aria-label={archivedView ? `Restore ${food.name}` : `Edit ${food.name}`}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{food.name}</div>
          {archivedView ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setPurgeOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                setPurgeOpen(true);
              }}
              aria-label={`Delete ${food.name} for good`}
              title="Delete for good"
              className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
            </span>
          ) : (
            food.trackInFridge && <ShoppingBasket className="h-3 w-3 flex-shrink-0 text-muted-foreground" aria-label="Tracked in the Kitchen" />
          )}
        </div>

        <div className="mt-auto">
          {archivedView && (
            <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <RotateCcw className="h-2.5 w-2.5" aria-hidden />
              Tap to restore
            </div>
          )}
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight text-foreground">{cal}</span>
            <span className="text-xs font-medium text-muted-foreground">cal</span>
            <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">{unit}</span>
          </div>

          {/* Macros were only visible by opening the food; the card had room. */}
          <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>P {macros.p}</span>
            <span>C {macros.c}</span>
            <span>F {macros.f}</span>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1">
            {/* A per-gram food with no default serving cannot be logged in one tap,
                so the badge is the fix rather than just the complaint. */}
            {needsServing && !archivedView && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setServingOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  setServingOpen(true);
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-strong px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                title="Set a default serving so this can be logged in one tap"
              >
                <Ruler className="h-2.5 w-2.5" aria-hidden />
                Set serving
              </span>
            )}
            {mismatch !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border-strong px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground" title={`Protein, carbs and fat add up to about ${mismatch} cal, not ${cal}. One of the four is probably a typo.`}>
                <TriangleAlert className="h-2.5 w-2.5" aria-hidden />
                Check macros
              </span>
            )}
          </div>
        </div>
      </motion.button>

      {servingOpen && (
        <ServingDialog
          food={food}
          onClose={() => setServingOpen(false)}
          onSaved={() => {
            setServingOpen(false);
            onChanged();
          }}
        />
      )}

      <FoodFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={onChanged}
        existing={food}
        onDelete={() => {
          setEditOpen(false);
          setDeleteOpen(true);
        }}
      />

      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{food.name}" for good?</AlertDialogTitle>
            <AlertDialogDescription>
              This one cannot be undone. Meals you already logged keep their own copy of the name and macros, so your history is unaffected. Any recipe using it loses that ingredient.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={purge}>
              Delete for good
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive "{food.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves your list and stops being trackable in the Kitchen. Past calorie entries keep working, and you can bring it back from the Archived filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={del}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Just the default serving. Opening the full form to fill in one number, with every
 * macro sitting there waiting to be fat-fingered, is a poor trade for the field that
 * decides whether a food can be logged in a single tap.
 */
function ServingDialog({ food, onClose, onSaved }: { food: Food; onClose: () => void; onSaved: () => void }) {
  const [grams, setGrams] = useState(food.defaultServingGrams ? String(food.defaultServingGrams) : "");
  const [saving, setSaving] = useState(false);
  const per100 = Math.round(food.caloriesPerGram * 100);
  const value = parseMacro(grams);
  const preview = value && value > 0 ? Math.round(food.caloriesPerGram * value) : null;

  const save = async () => {
    if (value === null || value <= 0) return toast.error("Enter a serving size in grams");
    setSaving(true);
    try {
      await api.patch(`/foods/${food._id}/serving`, { defaultServingGrams: value });
      toast.success(`One tap now logs ${value}g`);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[380px]">
        <DialogHeader>
          <DialogTitle>Default serving</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            How much of {food.name} you usually eat at once. This is what one tap logs on the Calories page.
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min="1"
              step="5"
              value={grams}
              autoFocus
              onChange={(e) => setGrams(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void save()}
              placeholder="100"
              className="h-11 font-mono tabular-nums"
            />
            <span className="text-sm font-medium text-muted-foreground">grams</span>
          </div>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {per100} cal per 100g{preview !== null ? `, so one serving is about ${preview} cal` : ""}
          </p>
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

// =====================================================================
// FoodFormDialog
// =====================================================================
function FoodFormDialog({ open, onOpenChange, onSaved, existing, onDelete }: { open: boolean; onOpenChange: (b: boolean) => void; onSaved: () => void; existing?: Food; onDelete?: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("protein");
  const [entryMode, setEntryMode] = useState<EntryMode>("perGram");
  const [unit, setUnit] = useState<"per100g" | "per1g">("per100g");
  const [serving, setServing] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [trackInFridge, setTrackInFridge] = useState(false);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  useEffect(() => {
    if (open) {
      if (existing) {
        setName(existing.name);
        setCategory(existing.category);
        setEntryMode(existing.entryMode);
        // Read the flag once, outside the mode branches. Reading it only in the
        // per-unit branch meant opening a weighed food and pressing Save silently
        // switched its kitchen tracking off.
        setTrackInFridge(existing.trackInFridge);
        if (existing.entryMode === "perUnit") {
          setUnit("per100g");
          setServing("");
          setUnitLabel(existing.unitLabel);
          setCalories(existing.caloriesPerUnit.toString());
          setProtein(existing.proteinPerUnit.toString());
          setCarbs(existing.carbsPerUnit.toString());
          setFat(existing.fatPerUnit.toString());
        } else {
          setUnit("per100g");
          setServing(existing.defaultServingGrams?.toString() ?? "");
          setUnitLabel("");
          setCalories((existing.caloriesPerGram * 100).toString());
          setProtein((existing.proteinPerGram * 100).toString());
          setCarbs((existing.carbsPerGram * 100).toString());
          setFat((existing.fatPerGram * 100).toString());
        }
      } else {
        setName("");
        setCategory("protein");
        setEntryMode("perGram");
        setUnit("per100g");
        setServing("");
        setUnitLabel("");
        setTrackInFridge(false);
        setCalories("");
        setProtein("");
        setCarbs("");
        setFat("");
      }
    }
  }, [open, existing]);

  const cal = parseMacro(calories);
  const p = parseMacro(protein);
  const c = parseMacro(carbs);
  const f = parseMacro(fat);

  /**
   * Convert the numbers on screen when the basis changes. Leaving them alone meant
   * switching to "per 1g" reinterpreted per-100g figures as per-gram ones and saved
   * a food a hundred times too calorific, with nothing to hint at it.
   */
  const changeUnit = (next: "per100g" | "per1g") => {
    if (next === unit) return;
    const factor = next === "per1g" ? 1 / 100 : 100;
    const scale = (raw: string) => {
      const v = parseMacro(raw);
      if (v === null || v === 0) return raw;
      return String(Math.round(v * factor * 10000) / 10000);
    };
    setCalories(scale(calories));
    setProtein(scale(protein));
    setCarbs(scale(carbs));
    setFat(scale(fat));
    setUnit(next);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    for (const [label, v] of [["Calories", cal], ["Protein", p], ["Carbs", c], ["Fat", f]] as const) {
      if (v === null) return toast.error(`${label} must be a number`);
    }
    if (cal === null || p === null || c === null || f === null) return;

    let nutrition;
    if (entryMode === "perUnit") {
      nutrition = {
        mode: "perUnit",
        calories: cal,
        protein: p,
        carbs: c,
        fat: f,
        unitLabel: unitLabel.trim(),
      };
    } else {
      const servingNum = serving ? parseFloat(serving) : null;
      if (servingNum !== null && (isNaN(servingNum) || servingNum < 0)) {
        return toast.error("Invalid serving");
      }
      nutrition = {
        mode: "perGram",
        unit,
        calories: cal,
        protein: p,
        carbs: c,
        fat: f,
        defaultServingGrams: servingNum,
      };
    }

    const body = {
      name: name.trim(),
      category,
      nutrition,
      trackInFridge,
    };
    try {
      if (existing) await api.patch(`/foods/${existing._id}`, body);
      else await api.post("/foods", body);
      toast.success(existing ? "Saved" : "Added");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const labelSuffix = entryMode === "perUnit" ? `per ${unitLabel.trim() || "unit"}` : unit === "per100g" ? "/100g" : "/g";
  // Advisory only. A warning that blocked the save would be wrong for the odd food
  // that genuinely does not follow 4/4/9, like a fibre-heavy vegetable.
  const formMismatch = cal !== null && p !== null && c !== null && f !== null ? macroMismatch(cal, p, c, f) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[520px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit food" : "Add food"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section: basics */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brown toast, Protein bar, Hawashi..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory((v ?? "other") as Category)}>
                  <SelectTrigger className="w-full !h-8 capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cc) => (
                      <SelectItem key={cc} value={cc} className="capitalize">
                        {cc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Entry mode</Label>
                <Select value={entryMode} onValueChange={(v) => setEntryMode((v ?? "perGram") as EntryMode)}>
                  <SelectTrigger className="w-full !h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perGram">per gram</SelectItem>
                    <SelectItem value="perUnit">per unit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Section: entry-mode-specific */}
          <AnimatePresence mode="wait">
            {entryMode === "perGram" ? (
              <motion.div key="perGram" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Unit for entry</Label>
                    <Select value={unit} onValueChange={(v) => changeUnit((v ?? "per100g") as "per100g" | "per1g")}>
                      <SelectTrigger className="w-full !h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per100g">per 100g</SelectItem>
                        <SelectItem value="per1g">per 1g</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Default serving (g)</Label>
                    <Input type="number" step="1" inputMode="decimal" value={serving} onChange={(e) => setServing(e.target.value)} placeholder="optional" className="font-mono tabular-nums" />
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="perUnit" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Unit label</Label>
                  <Input value={unitLabel} onChange={(e) => setUnitLabel(e.target.value)} placeholder="piece, bar, scoop... (optional, defaults to 'unit')" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Weighed foods can be kept in stock too, counted in grams, so this sits
              outside the mode-specific block rather than only under per-unit. */}
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox checked={trackInFridge} onCheckedChange={(v) => setTrackInFridge(!!v)} id="kitchen" className="mt-0.5" />
            <div className="space-y-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <ShoppingBasket className="h-3 w-3 text-muted-foreground" />
                Keep stock of this in the Kitchen
              </span>
              <span className="block text-xs text-muted-foreground">
                Get reminded to restock. Logging it on the Calories page takes it off the shelf, {entryMode === "perGram" ? "by the gram" : "one at a time"}.
              </span>
            </div>
          </label>

          <div className="border-t border-border" />

          {/* Section: nutrition */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Nutrition <span className="text-muted-foreground/60 lowercase">({labelSuffix})</span>
            </div>
            {formMismatch !== null && (
              <div className="flex items-start gap-1.5 rounded-lg border border-border-strong px-2 py-1.5">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                <span className="text-[11px] leading-snug text-muted-foreground">
                  Protein, carbs and fat come to about <span className="font-mono font-semibold text-foreground">{formMismatch}</span> cal, not{" "}
                  <span className="font-mono font-semibold text-foreground">{cal}</span>. One of the four is probably a typo. Saving anyway is fine.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Calories</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} className="font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Protein (g)</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} className="font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Carbs (g)</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} className="font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Fat (g)</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} className="font-mono tabular-nums" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {existing && onDelete ? (
            <Button variant="ghost" size="default" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          ) : (
            <div />
          )}
          <Button variant="default" size="default" onClick={save}>
            {existing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
