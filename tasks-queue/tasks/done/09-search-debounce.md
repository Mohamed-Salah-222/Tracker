Two independent fixes:

1. client/src/pages/Foods.tsx currently re-queries /foods on every keystroke in the search field with no debounce (line 73), sending a request per character. Add a debounce (e.g. 300ms) before triggering the search request.
2. client/src/pages/Fridge.tsx line 60 creates a new Set via `existingFoodIds={new Set(...)}` on every render, which breaks memoization for AddItemDialog since the prop identity changes every time. Memoize this Set with useMemo so it only changes when its underlying source data changes.
