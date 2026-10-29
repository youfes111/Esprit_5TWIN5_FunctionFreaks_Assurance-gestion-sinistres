# UI/UX design-system foundation

This records the frontend redesign underlying the [global chatbot refinement](UI_UX_REFINEMENT.md). React/Vite/TypeScript/Tailwind, Express, Fuseki, original OWL, API clients/contracts, claims authorization, NLP processing and approved SELECT execution remain intact.

## Design system and components

Official shadcn initialization was applied to the existing Vite workspace using Radix primitives and `radix-nova`. `frontend/components.json` records generation settings; TypeScript and Vite resolve `@/` to `src/`. Source components in `src/components/ui/` include Button, Card, Badge, Input, Textarea, NativeSelect, Table, Sheet, Dialog, AlertDialog, Tabs, Accordion, DropdownMenu, Tooltip, Skeleton, Separator, ScrollArea and Switch. NativeSelect retains native keyboard behavior; `src/lib/utils.ts` supplies the generated helper.

`src/styles.css` centralizes light/dark semantic tokens, midnight sidebar, accessible teal primary, indigo accents, borders, shadows and responsive rules. Manrope is locally bundled through Fontsource. Previous `claims.css`, `nlp.css` and `phase4.css` files were replaced by shared styles. `design/theme.tsx` manages light/dark/system preference; `design/motion.ts` shares short transitions and reduced-motion behavior. `main.tsx` installs theme, tooltip and Motion configuration.

`AppLayout` provides desktop collapse, mobile Sheet navigation, breadcrumbs, theme control, skip navigation and route transitions. `PageHeader` provides consistent headings and programmatic focus. Shared status/loading/error/empty components, metric cards, copy actions and processing indicators use the same primitives.

Claims use a table/action menu, create/edit/details Sheets, typed-ID destructive AlertDialog and in-memory demo-token Dialog. Existing handlers, reference choices, validation, revisions and authorization stay authoritative. Graph presentation uses semantic theme colors and cleaned-up effects. Explorer keeps its approved catalogue and actual RDF results with local copy/export. NLP retains copyable SELECTs, results and trace tabs/accordions; the refinement replaces its initial standalone page with one global widget.

## Files and dependencies

Foundation changes cover `frontend/package.json`, root lockfile, `frontend/components.json`, TypeScript/Vite aliases, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/design/*`, `src/lib/utils.ts`, shared `src/components/*`, generated `src/components/ui/*`, application layout and route pages. `frontend/test/design.test.ts` adds SSR/source, contrast and reduced-motion checks. The refinement document lists subsequent files precisely.

Added foundation packages: `motion` 14.6.0, `@fontsource-variable/manrope` 5.3.0, `radix-ui` 1.8.1, `cn` 0.5.0, `class-variance-authority` 0.7.1 and `tw-animate-css` 1.4.0; tooling: `shadcn` 4.22.1 and frontend `tsx` 4.23.15. Package ranges live in the manifest, exact resolutions in the lockfile. Existing Recharts/Cytoscape remain. The second pass required no new dependencies.

## Verification

Final combined delivery: both workspace TypeScript checks and production builds pass; **74 isolated tests pass**. Vite's initial chunk size warning remains; routes and chatbot content are lazy. See `UI_UX_REFINEMENT.md` for measured sizes, preservation hash, test limits and deferred manual checks.

No live application testing was performed. Visuals, responsive geometry, real keyboard/focus behavior, clipboard/export and real API interaction remain unverified. No Phase 5 module was started.
