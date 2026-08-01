Add these confirmed missing schema-level invariants (currently enforced only loosely or not at all):

1. Goal.ts and WeightGoal.ts are both meant to be singletons (per code comments) but have no uniqueness constraint — add logic (a pre-save hook, or a fixed known _id pattern) that prevents more than one document existing for each.
2. Goal.ts has no ordering validation between waterMin, waterTarget, and waterMax — add a validator ensuring waterMin <= waterTarget <= waterMax.
3. Food.ts doesn't enforce that perGram fields are required only when entryMode is "perGram" and perUnit fields only when entryMode is "perUnit" — add a conditional validator so a food can't be saved in an inconsistent state (e.g. entryMode "perGram" with only perUnit values filled in).
4. CalorieEntry.ts has the same perGram/perUnit inconsistency risk — add the matching conditional validation there too, consistent with whatever pattern you use for Food.ts.
5. Rate.ts has no constraint preventing multiple documents with effectiveTo: null (multiple "currently active" rates at once) — add a uniqueness constraint or pre-save check enforcing at most one active rate at a time.
