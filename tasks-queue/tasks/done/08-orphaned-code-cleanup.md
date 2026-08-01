Resolve these confirmed orphaned/unused items:

1. server/src/models/DayFlag.ts is not imported anywhere — confirm again with a repo-wide search, then delete it.
2. client/src/App.css is not imported by main.tsx — delete it.
3. client/src/assets/react.svg, vite.svg, mockup.png, hero.png are unreferenced — delete them.
4. client/src/components/ThemeToggle.tsx is unreferenced — confirm whether a theme toggle exists elsewhere in the UI (e.g. inside AppSidebar or a settings menu); if it's genuinely missing from the UI, wire ThemeToggle in rather than deleting it, since a working theme toggle seems like intended functionality. Ask before deleting if unsure.
5. client/src/components/ui/dropdown-menu.tsx appears unused — confirm with a search, then delete if truly unreferenced.
6. MedicalEnglishEntry model + its routes exist but client/src/pages/MedicalEnglish.tsx only calls the /medical-english/lessons endpoints, never the entry endpoints. [QUESTION FOR USER: should MedicalEnglishEntry be wired into the UI (e.g. as a searchable phrase glossary alongside lessons), or removed along with the rest of Medical English per the earlier removal decision? Do not act on this item until answered.]
