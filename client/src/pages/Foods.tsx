import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Search, Snowflake, Trash2 } from "lucide-react";
import { AxiosError } from "axios";

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

const CATEGORIES: Category[] = ["protein", "carbs", "fats", "vegetables", "snacks", "drinks", "prepared", "other"];

// ===== Helpers =====
function getApiError(e: unknown): string {
  if (e instanceof AxiosError) {
    return (e.response?.data as { error?: string })?.error ?? e.message;
  }
  return "Something went wrong";
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
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterCat !== "all") params.category = filterCat;
      const r = await api.get<Food[]>("/foods", { params });
      setFoods(r.data);
    } catch (e) {
      toast.error(getApiError(e));
    }
  }, [search, filterCat]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const g: Record<string, Food[]> = {};
    for (const f of foods) (g[f.category] ||= []).push(f);
    return g;
  }, [foods]);

  const groupOrder = CATEGORIES.filter((c) => grouped[c]);
  const hasFilters = !!search || filterCat !== "all";

  return (
    <div className="w-full max-w-[1100px] mx-auto space-y-5">
      {/* ===== Top bar ===== */}
      <motion.div {...fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold tracking-tight">Food library</h1>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium font-mono tabular-nums">
            {foods.length} {foods.length === 1 ? "item" : "items"}
          </span>
        </div>
        <Button variant="default" size="sm" onClick={() => setAddOpen(true)}>
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
          </CardContent>
        </Card>
      </motion.div>

      {/* ===== Empty state ===== */}
      {groupOrder.length === 0 && (
        <motion.div {...stagger(2)}>
          <Card>
            <CardContent className="p-12 text-center">
              {hasFilters ? (
                <>
                  <div className="text-sm font-medium mb-1">No foods match.</div>
                  <div className="text-sm text-muted-foreground">Try clearing your filters.</div>
                </>
              ) : (
                <>
                  <div className="text-sm font-medium mb-1">No foods yet.</div>
                  <div className="text-sm text-muted-foreground">Add your first food to get started.</div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ===== Category sections ===== */}
      {groupOrder.map((cat, ci) => (
        <motion.div key={cat} {...stagger(ci + 2)} className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium capitalize">{cat}</span>
              <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{grouped[cat].length}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {grouped[cat].map((f, i) => (
              <FoodCard key={f._id} food={f} onChanged={load} index={i} />
            ))}
          </div>
        </motion.div>
      ))}

      <FoodFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={load} />
    </div>
  );
}

// =====================================================================
// FoodCard
// =====================================================================
function FoodCard({ food, onChanged, index }: { food: Food; onChanged: () => void; index: number }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const del = async () => {
    try {
      await api.delete(`/foods/${food._id}`);
      toast.success("Deleted");
      onChanged();
    } catch (e) {
      toast.error(getApiError(e));
    }
  };

  const cal = caloriesDisplay(food);
  const unit = caloriesUnit(food);

  return (
    <>
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: Math.min(index * 0.03, 0.3), ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setEditOpen(true)}
        className="text-left rounded-[10px] border border-border bg-card p-4 hover:border-border-strong hover:shadow-md transition-all relative group flex flex-col min-h-[120px]"
      >
        {/* Top: name + fridge */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">{food.name}</div>
          {food.trackInFridge && <Snowflake className="h-3 w-3 flex-shrink-0" style={{ color: "var(--color-food-drinks)" }} />}
        </div>

        {/* Calories headline */}
        <div className="mt-auto">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold font-mono tracking-tight tabular-nums text-foreground">{cal}</span>
            <span className="text-xs text-muted-foreground font-medium">cal</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono tabular-nums mt-0.5">{unit}</div>
        </div>

        {/* Category tag */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-0 transition-opacity">{/* hidden when hovering, visible by default */}</div>
      </motion.button>

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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{food.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Archived. Past calorie entries keep working.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction variant="destructive" size="default" onClick={del}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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

  const handleOpenChange = (next: boolean) => {
    if (next) {
      if (existing) {
        setName(existing.name);
        setCategory(existing.category);
        setEntryMode(existing.entryMode);
        if (existing.entryMode === "perUnit") {
          setUnit("per100g");
          setServing("");
          setUnitLabel(existing.unitLabel);
          setTrackInFridge(existing.trackInFridge);
          setCalories(existing.caloriesPerUnit.toString());
          setProtein(existing.proteinPerUnit.toString());
          setCarbs(existing.carbsPerUnit.toString());
          setFat(existing.fatPerUnit.toString());
        } else {
          setUnit("per100g");
          setServing(existing.defaultServingGrams?.toString() ?? "");
          setUnitLabel("");
          setTrackInFridge(false);
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
    onOpenChange(next);
  };

  const cal = parseFloat(calories) || 0;
  const p = parseFloat(protein) || 0;
  const c = parseFloat(carbs) || 0;
  const f = parseFloat(fat) || 0;

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    if (cal < 0 || p < 0 || c < 0 || f < 0) return toast.error("Negative values");

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
      trackInFridge: entryMode === "perUnit" ? trackInFridge : false,
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                    <Select value={unit} onValueChange={(v) => setUnit((v ?? "per100g") as "per100g" | "per1g")}>
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
                <label className="flex items-start gap-3 cursor-pointer group">
                  <Checkbox checked={trackInFridge} onCheckedChange={(v) => setTrackInFridge(!!v)} id="fridge" className="mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="text-sm font-medium flex items-center gap-1.5">
                      <Snowflake className="h-3 w-3" style={{ color: "var(--color-food-drinks)" }} />
                      Track this in the fridge
                    </span>
                    <span className="text-xs text-muted-foreground block">Turn on for home-prepared meals you want to count. Off for store-bought / on-the-go.</span>
                  </div>
                </label>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="border-t border-border" />

          {/* Section: nutrition */}
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Nutrition <span className="text-muted-foreground/60 lowercase">({labelSuffix})</span>
            </div>
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
