# UI/UX refinement and global NLP chatbot

This refines the Phase 4 frontend and the [design-system foundation](UI_UX_REDESIGN.md). No Phase 5 work is included. Backend source/tests, API clients/types, Fuseki configuration and the original ontology match their pre-redesign SHA-256 manifest.

## Changes

- Dashboard cards now participate directly in an explicit two-column analytics grid, replacing the `display: contents` animation wrapper and asymmetric column spans that left empty columns. Below 900px they stack. Single categories show compact exact-value facts; multiple categories use bounded horizontal bars and accessible data tables. Six metric cards, real values, missing/invalid annotations and refresh remain.
- Claims filters use an explicit responsive grid with a wider search, wrapping dropdowns and a separate action group. The read-only banner, rows and pagination are compact. Filters, reference loading, revision checks, original-resource protection and backend session/RBAC authorization remain unchanged.
- The graph uses a viewport-based canvas, integrated toolbar and adjacent details. Larger nodes, spaced positions, bounded labels and connected-edge highlighting improve emphasis. Native keyboard-accessible text disclosures are closed by default; expanding them makes no request.
- Explorer keeps the catalogue, approved execution, dark code panel, selected-query state, copy and CSV/JSON export. Shared table/feedback/spacing refinements apply; there is no arbitrary query editor.

## Chatbot architecture

```text
BrowserRouter
  ChatbotProvider (one memory store, existing nlpApi injected)
    Routes → lazy pages and application shell
    GlobalChatbot → lazy ChatbotPanel → memoized ChatMessage → NlpResults
```

The store owns open state, draft, the last ten exchanges, busy state and cached examples. `useSyncExternalStore` subscribes the widget; a separate stable action context allows navigation actions without rerendering all pages per message. Construction and SSR make no requests. First opening loads examples through the existing client; repeated opens share a pending promise and then reuse cached examples. Failures have an explicit retry.

Submission locks synchronously against duplicates and calls `nlpApi.ask(question, signal)` once. Errors remain readable. Closing keeps the draft, history and pending request. Navigation does not remount the provider. Clear removes draft/history, keeps cached examples and is disabled while busy. Provider disposal aborts requests and ignores stale replies.

Persistence is limited to the mounted application session: reloading or closing the tab clears it. Questions/results are not stored in localStorage/sessionStorage. Only the existing theme preference persists. There is no new NLP processing or LLM service.

The FAB, sidebar and dashboard action open the same widget. `/assistant` replaces the history entry with `/` and opens it without a separate page. Desktop uses a nonmodal Radix/shadcn Dialog; outside interaction does not dismiss it. At 640px and below, the panel is modal and near full height. Mobile navigation closes before opening chat to avoid simultaneous drawer focus traps.

Opening focuses the composer; Escape/Close dismiss and restore the opener with FAB fallback. Enter submits, Shift+Enter inserts a newline, IME composition is respected and input remains 3–500 characters. The fixed composer sits outside the scrollable log. Loading/errors use status/live/alert semantics. Actual endpoint examples populate suggestions. Actual RDF results use a bounded table. The collapsed “Voir l’analyse NLP” section retains original question, normalization, tokens/stems, intent, entities, rule, exact copyable SELECT and results tabs.

## Responsive design, motion and accessibility

The navy sidebar, teal accents, Manrope, themes and shadcn primitives remain. Most transitions use 220ms opacity/transform; message/suggestion/disclosure effects respect reduced motion. Loading dots animate only while a request is pending. Cytoscape layout animation stays disabled.

Desktop chat width is at most 460px, with height limited to 720px/82dvh and viewport bounds. Mobile uses safe areas and cleaned-up `visualViewport` listeners for keyboard height/inset. Tables/code have internal scrolling. Filters wrap at 1250px/640px, charts stack below 900px and graph details stack below 1150px. Target viewports: 375, 768, 1024 and 1440px.

Graph positions use stable seeded elements, built-in COSE for 2–180 nodes, a spaced grid for larger bounded datasets and preset for a single node. Selection highlights only visible RDF neighbors/edges and fades unrelated elements, recalculating on category changes. Theme/labels/filter changes reuse the instance. No RDF relationships are invented or mutated. Layout remains heuristic.

Accessible names, labels, focus rings, skip link, focusable headings and textual alternatives remain. Static contrast checks cover core pairs, not complete WCAG conformance. Real focus behavior and screen-reader output require manual checks.

## Files changed

Paths are repository-relative.

| Files | Purpose |
| --- | --- |
| `frontend/src/features/chatbot/store.ts` | Injectable bounded state, caching, duplicate guard, cancellation |
| `frontend/src/features/chatbot/ChatbotProvider.tsx` | Shared provider/actions and focus restoration |
| `frontend/src/features/chatbot/GlobalChatbot.tsx` | FAB, lazy panel and responsive modal mode |
| `frontend/src/features/chatbot/ChatbotPanel.tsx` | Header, suggestions, log and composer |
| `frontend/src/features/chatbot/ChatMessage.tsx` | Actual responses and collapsed analysis |
| `frontend/src/features/chatbot/LegacyAssistantRedirect.tsx` | Backward-compatible redirect |
| `frontend/src/App.tsx`, `frontend/src/layouts/AppLayout.tsx` | Provider placement and navigation |
| `frontend/src/pages/NlpPage.tsx` | Removed standalone presentation |
| `frontend/src/components/DashboardQuickActions.tsx` | Existing routes and shared assistant action |
| `frontend/src/pages/OverviewPage.tsx`, `frontend/src/components/AnalyticsChart.tsx` | Dashboard density and exact-value presentation |
| `frontend/src/pages/ClaimsPage.tsx` | Filter groups and focus fallback |
| `frontend/src/pages/OntologyPage.tsx`, `frontend/src/components/OntologyCanvas.tsx`, `frontend/src/components/GraphControls.tsx` | Graph workspace and textual disclosure |
| `frontend/src/utils/graph-layout.ts`, `frontend/src/utils/graph-style.ts` | Layout, spacing and reversible selection context |
| `frontend/src/components/NlpResults.tsx`, `frontend/src/components/ui/dialog.tsx` | Reused analysis, Motion-compatible force mounting |
| `frontend/src/styles.css`, `frontend/index.html`, `frontend/public/shield.svg` | Responsive styles, valid local font import and brand metadata |
| `frontend/test/chatbot.test.ts`, `frontend/test/design.test.ts` | Mocks, SSR/source guards and regressions |
| `README.md`, `docs/ARCHITECTURE.md`, both UI/UX documents | Usage and boundaries |

No dependencies were added for this second pass. Foundation installations are recorded in `UI_UX_REDESIGN.md`.

## Verification and limitations

- Root `npm run typecheck`: both workspaces pass.
- Root `npm run test:unit`: **74 pass, 0 fail**: 52 backend and 22 frontend. These use injected transports, pure logic, SSR/source inspection and headless Cytoscape, without servers or real HTTP. They cover state persistence across simulated route consumers, caching, submission/error/clear/abort, launcher markup, redirect source, exact chart values, layout bounds, RDF preservation, export helpers, contrast and reduced-motion policy. Source/SSR checks do not establish real browser interaction correctness.
- Root `npm run build`: Vite frontend and TypeScript backend pass. A missing font-subset stylesheet was corrected to the installed package's public stylesheet. Vite warns about the initial JS chunk: approximately 565 kB minified, 187 kB gzip. Graph/chart/claims pages and chat panel remain lazy; the warning threshold was not increased.
- Protected source manifest unchanged. OWL SHA-256: `1DA702515E9D96177C49C2A9721203275B6E41C553B23EBFEF3F2AAD3D9BE9A0`.
- Full `npm test` remains unexecuted because its Supertest cases open listeners. No server, Fuseki, browser, real HTTP, RDF mutation or computer-use tool was used.

Build success does not establish visual quality, mobile keyboard behavior, complete accessibility, clipboard/download permissions or real-service compatibility. Large graph layouts and long RDF values still need visual review. Conversation persistence intentionally does not survive reloads.

## Deferred manual browser checklist

Only run after live/browser testing is authorized:

1. At 375/768/1024/1440px, inspect light/dark/system themes, sidebar collapse, focus rings and horizontal overflow.
2. Open from FAB/sidebar/dashboard. Send, close while pending, change routes and reopen; verify draft/history and one request. Check clear, backend errors, unsupported input and examples retry.
3. Direct-load `/assistant`, check replacement navigation and Back/Forward without loops or duplicate requests.
4. Test keyboard-only opening, Tab order, Enter/Shift+Enter, Escape and restored focus. Check desktop background navigation, mobile containment, claims-overlay interaction, reduced motion and screen-reader announcements.
5. On a mobile device, test safe areas, rotation, virtual keyboard and composer visibility.
6. Review single/multiple/empty chart data, exact values/table parity, desktop alignment and refresh.
7. Exercise all claim filters/reset/pagination/details and the disabled-write/session/RBAC policy. Real CRUD verification needs separately configured Fuseki credentials and manual acceptance.
8. Switch graph modes/categories, search/select, zoom/pan/fit/reset, labels/theme and text disclosure without extra fetches.
9. Check approved Explorer execution, feedback, table widths, copy and CSV/JSON downloads.

Wait for approval before Phase 5.

## Readable chatbot RDF results

`frontend/src/utils/rdf-presentation.ts`, `components/RdfValue.tsx`, `components/ChatbotResults.tsx`, `features/chatbot/ChatMessage.tsx`, `components/NlpResults.tsx` and shared CSS now give the chatbot its own compact presentation. Up to three binding rows use cards; larger responses use a fixed-layout, keyboard-focusable internal table scroller. Fields missing from a card are omitted; table unbound cells are labelled. Only the returned fields/rows are displayed, without grouping away duplicate relationships or inventing an expert.

Fragment/path local names are display-only. Expand any RDF value to inspect and copy the exact original URI/lexical value, datatype or language. Blank nodes are labelled anonymous, not linked resources. Literal precision is retained. Long unbroken labels, URLs and literals wrap at nested flex/grid boundaries. Generated SPARQL keeps its own horizontal scroller. Natural French counts distinguish empty/singular/plural results; raw row counts, exact original explanation and relationship-multiplicity caveat remain inside the collapsed technical trace. The Explorer's raw RDF renderer is unchanged.

`frontend/test/rdf-presentation.test.ts` covers fragment/path IRIs, encoded labels, long IRIs/unbroken literals, blank nodes, typed/language literals, empty results, card omissions, multiple columns, table bounds and immutable source data. Browser widths/scrolling/copy remain unverified under the no-live restriction.

Phase 4.5 subsequently protects the workspace and keeps its history across authenticated route changes; logout/session expiry unmounts the chatbot and clears its memory. The sidebar assistant action is intentionally removed; the FAB and dashboard action remain. Claims use session roles instead of the retired demo-token dialog, with RDF writes still disabled. See `PHASE4_5_AUTHENTICATION.md`.

## Collapsed sidebar correction

The supplied screenshot exposed an additional cause: wrapping NavLink with TooltipTrigger asChild converted its className callback to literal function text through Radix Slot's string merging. The links lost their nav-item class, including flex alignment, dimensions, spacing and active background. Sidebar links now pass a plain nav-item string; NavLink supplies its own active class and aria-current. An SSR regression renders the actual collapsed sidebar at all four primary routes and asserts intact classes, accessible names and exactly one active link. It failed before the correction and now passes. All 26 isolated frontend tests pass. No browser was used.

Collapsed styles now target the desktop aside's own `data-collapsed` attribute instead of all descendants of the application shell, preserving expanded mobile-menu labels after desktop collapse. The collapsed brand, navigation/assistant icons, footer monogram and expand control share a centered 44px alignment. Group labels become separators; tooltips and accessible action names remain. Navigation scrolls independently on short viewports, with the footer and expand/collapse control outside that scroller. The expand control uses the icon button size. Frontend typecheck, production build and all 25 isolated tests pass; actual viewport rendering and mouse/keyboard behavior remain unverified without browser testing.

## FAB rendering correction

An offline regression test reproduced a Radix `Primitive.div failed to slot onto its children` error when mounting chatbot content. The shared DialogContent wrapper passed both its content and the conditional generated close button as children, even with the close button disabled. With `asChild`, Radix requires one designated element. The wrapper now marks its content with `Slot.Slottable`, preserving the animated section and correctly nesting any generated close button. This fixes the mounting error without changing chatbot state, requests or API contracts.

`frontend/test/dialog.test.ts` exercises the real Content primitive under its Dialog context, bypassing only the portal for SSR. Both asChild cases failed before the fix and pass afterward; the normal dialog case remains covered. The already-hidden StatusBadge retains its empty rendering, with unused declarations removed so TypeScript can compile. Browser interaction remains unverified under the no-live restriction.
