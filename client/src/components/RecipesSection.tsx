import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { PICKER_LIMIT, type Page } from "../lib/pagination";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { ChefHat, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { MEALS, recipeError, type Meal, type PickerFood, type Recipe } from "../lib/recipes";


// =====================================================================
// RecipesSection
//
// A recipe is a named set of foods logged in one go: "my usual breakfast" as two
// eggs, a slice of toast and 10g of oil. It stores references and amounts, not a
// copy of the macros, so editing a food updates every recipe that uses it.
// =====================================================================
export default function RecipesSection({ recipes, loading, onChanged }: { recipes: Recipe[]; loading: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardContent className="px-4 py-0">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/50">
            <ChefHat className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-sm font-semibold">Recipes</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{loading ? "" : recipes.length}</span>
            <span className="ml-auto text-muted-foreground">{open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}</span>
          </button>
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => { setOpen(true); setCreating(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />
            New
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
              <div className="pb-3 pt-1">
                {recipes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Save the meals you eat over and over. Logging one writes an entry for every food in it, in a single tap.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {recipes.map((r) => (
                      <button
                        key={r._id}
                        type="button"
                        onClick={() => setEditing(r)}
                        className="rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-border-strong"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{r.name}</span>
                          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{r.totals.calories}</span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.items.map((i) => i.name).join(", ")}</div>
                        <div className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">
                          P {r.totals.protein} · C {r.totals.carbs} · F {r.totals.fat}
                          {r.items.some((i) => i.missing) && <span className="ml-1.5 font-sans font-semibold uppercase tracking-wide">missing food</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>

      {(creating || editing) && (
        <RecipeDialog
          recipe={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

// =====================================================================
// RecipeDialog
// =====================================================================
type DraftItem = { foodId: string; amount: string };

function RecipeDialog({ recipe, onClose, onSaved }: { recipe: Recipe | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(recipe?.name ?? "");
  const [defaultMeal, setDefaultMeal] = useState<Meal>(recipe?.defaultMeal ?? "breakfast");
  const [items, setItems] = useState<DraftItem[]>(recipe ? recipe.items.map((i) => ({ foodId: i.foodId, amount: String(i.amount) })) : []);
  const [foods, setFoods] = useState<PickerFood[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const r = await api.get<Page<PickerFood>>("/foods", { params: { limit: PICKER_LIMIT, offset: 0 } });
        setFoods(r.data.items);
      } catch (e) {
        toast.error(recipeError(e));
      }
    })();
  }, []);

  const byId = useMemo(() => new Map(foods.map((f) => [f._id, f])), [foods]);

  const addRow = () => setItems((v) => [...v, { foodId: "", amount: "" }]);
  const setRow = (i: number, patch: Partial<DraftItem>) => setItems((v) => v.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const dropRow = (i: number) => setItems((v) => v.filter((_, idx) => idx !== i));

  /** Picking a food suggests the amount you would normally eat of it. */
  const pickFood = (i: number, foodId: string) => {
    const food = byId.get(foodId);
    const suggested = food?.entryMode === "perGram" ? String(food.defaultServingGrams ?? 100) : "1";
    setRow(i, { foodId, amount: items[i].amount || suggested });
  };

  const save = async () => {
    const clean = items.filter((i) => i.foodId);
    if (!name.trim()) return toast.error("Give the recipe a name");
    if (clean.length === 0) return toast.error("Add at least one food");
    const payload = [];
    for (const it of clean) {
      const amount = Number(it.amount);
      if (!Number.isFinite(amount) || amount <= 0) return toast.error(`${byId.get(it.foodId)?.name ?? "A food"} needs an amount greater than 0`);
      payload.push({ foodId: it.foodId, amount });
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), defaultMeal, items: payload };
      if (recipe) await api.patch(`/recipes/${recipe._id}`, body);
      else await api.post("/recipes", body);
      toast.success(recipe ? "Saved" : "Recipe added");
      onSaved();
    } catch (e) {
      toast.error(recipeError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!recipe) return;
    try {
      await api.delete(`/recipes/${recipe._id}`);
      toast.success("Recipe removed");
      onSaved();
    } catch (e) {
      toast.error(recipeError(e));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!w-[calc(100vw-1.5rem)] !max-w-[520px] max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recipe ? "Edit recipe" : "New recipe"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px]">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Usual breakfast" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Usually</Label>
              <Select value={defaultMeal} onValueChange={(v) => setDefaultMeal((v ?? "breakfast") as Meal)}>
                <SelectTrigger className="w-full !h-11 capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEALS.map((m) => (
                    <SelectItem key={m} value={m} className="capitalize">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Foods</Label>
            {items.length === 0 && <p className="text-[11px] text-muted-foreground">Nothing added yet.</p>}
            <div className="space-y-1.5">
              {items.map((row, i) => {
                const food = byId.get(row.foodId);
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <Select value={row.foodId} onValueChange={(v) => pickFood(i, v ?? "")}>
                      <SelectTrigger className="!h-10 min-w-0 flex-1">
                        <SelectValue placeholder="Pick a food">{food?.name ?? "Pick a food"}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {foods.map((f) => (
                          <SelectItem key={f._id} value={f._id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={food?.entryMode === "perGram" ? "10" : "1"}
                      value={row.amount}
                      onChange={(e) => setRow(i, { amount: e.target.value })}
                      aria-label="Amount"
                      className="h-10 w-20 shrink-0 font-mono tabular-nums"
                    />
                    <span className="w-10 shrink-0 text-[11px] text-muted-foreground">{food ? (food.entryMode === "perGram" ? "g" : food.unitLabel || "each") : ""}</span>
                    <button type="button" onClick={() => dropRow(i)} aria-label="Remove this food" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-destructive">
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
            <Button variant="outline" size="sm" className="h-9 w-full" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 mr-1" aria-hidden />
              Add a food
            </Button>
          </div>

          {recipe && <p className="font-mono text-[11px] tabular-nums text-muted-foreground">Currently {recipe.totals.calories} cal · P {recipe.totals.protein} · C {recipe.totals.carbs} · F {recipe.totals.fat}</p>}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          {recipe ? (
            <Button variant="ghost" size="default" onClick={remove}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" aria-hidden />
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="default" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="default" size="default" onClick={save} disabled={saving}>
              {recipe ? "Save" : "Add"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
