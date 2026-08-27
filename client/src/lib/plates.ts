// =====================================================================
// Plate maths.
//
// The suggestion engine hands you numbers like 77.5kg. On a barbell that is a
// per-side loading problem you should not be solving between sets.
// =====================================================================

/** Standard metric gym plates, heaviest first, because greedy loading needs this order. */
export const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

export const BAR_OPTIONS = [
  { kg: 20, label: "Olympic bar" },
  { kg: 15, label: "Women's bar" },
  { kg: 10, label: "Short bar" },
  { kg: 0, label: "Machine / no bar" },
];

export type PlateLoad = {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: number[];
  /** What the bar actually ends up weighing with those plates. */
  achievable: number;
  /** Target minus achievable. Non-zero when the gym's plates cannot make the number. */
  shortfall: number;
};

/**
 * Greedy is provably optimal here because every plate divides the next one up
 * (25/20 aside, and 20+5 covers the gap), so there is no case where taking a
 * smaller plate first yields a closer total.
 */
export function loadBar(target: number, bar: number, plates: number[] = PLATES_KG): PlateLoad | null {
  if (bar === 0) {
    // Machines and dumbbells are loaded directly; there is nothing to halve.
    return { perSide: [], achievable: target, shortfall: 0 };
  }
  if (target < bar) return null;

  let perSideRemaining = (target - bar) / 2;
  const perSide: number[] = [];
  for (const plate of plates) {
    while (perSideRemaining >= plate - 1e-9) {
      perSide.push(plate);
      perSideRemaining -= plate;
    }
  }
  const loaded = perSide.reduce((sum, p) => sum + p, 0);
  const achievable = bar + loaded * 2;
  return { perSide, achievable, shortfall: Math.round((target - achievable) * 100) / 100 };
}

/** "2×20, 1×5, 1×2.5": how you would actually describe one side out loud. */
export function describeSide(perSide: number[]): string {
  if (perSide.length === 0) return "empty bar";
  const counts = new Map<number, number>();
  for (const p of perSide) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.entries()].map(([kg, n]) => `${n}×${kg}`).join(", ");
}
