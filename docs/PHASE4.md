# Phase 4 — Dashboard, Ontology Graph and SPARQL Explorer

Phase 4 adds read-only exploration and analytics to the existing React/Express/Fuseki application. It preserves claims CRUD, demo write authorization, French NLP, health/local file summary and all seven Phase 1 query resources. The original `ontology/assurance.owl` and Fuseki configuration files are unchanged. No Phase 5, generative API or new database is introduced.

## Architecture and dependencies

The existing SPARQL client gains `selectVisualization`, which accepts a key from a separate fixed SELECT registry. Its private HTTP transport still uses the backend-only query endpoint, timeouts, response validation, redirect rejection and centralized errors. It does not gain raw-query input or update credentials. The seven-key Phase 1 registry is unchanged.

```text
Dashboard → dashboard API → DashboardService → fixed aggregate SELECTs
Ontology Graph → graph API + validated view → OntologyGraphService
  → fixed structural/individual SELECT → normalized nodes and edges → Cytoscape
SPARQL Explorer → catalogue metadata + existing Phase 1 execution route
  → existing approved SELECT → RDF table / local export
```

Installed frontend dependencies (resolved versions): **Recharts 3.10.1**, **Cytoscape.js 3.34.4**, and dev-only **@types/cytoscape 3.21.9**. The root lockfile records versions. Use `npm ci` for reproduction. No backend dependencies were added. The new pages are lazy-loaded, so chart/graph engines are not downloaded as part of the initial claims/NLP bundle. No plugins or remote graph renderer are required. Minimal SPARQL syntax highlighting uses React text spans instead of another dependency.

## API endpoints

| Method and path | Response data |
| --- | --- |
| GET `/api/dashboard/summary` | `source`, classes, named individuals, claims, contracts, insured people, experts, default-graph triples |
| GET `/api/dashboard/distributions` | Claim statuses, claim experts, selected domain instance counts, damage estimates and availability/limit information |
| GET `/api/ontology/graph?view=schema` | Normalized schema nodes and edges |
| GET `/api/ontology/graph?view=individuals` | Normalized named-individual/type/relationship graph |
| GET `/api/sparql/catalogue` | Seven query IDs, French titles/descriptions and the exact existing SELECT definitions; no Fuseki request |

All responses retain `{success:true,data:...}` and the existing centralized error envelope. Graph view defaults to `schema`; only these two values are permitted, with unknown query keys/arrays rejected. Dashboard endpoints accept no parameters/body. Other HTTP verbs do not expose an operation. The Explorer calls the existing `/api/sparql/classes`, `/individuals`, `/contracts`, `/insured`, `/claims`, `/claim-experts`, `/example-karim` endpoints for execution. It never posts query text.

## Dashboard metrics and definitions

All six cards query **the current Fuseki default graph**, not the source file and not cached demo records:

| Card | RDF definition |
| --- | --- |
| Declared OWL classes | Distinct IRI subjects with explicit `rdf:type owl:Class` |
| Named individuals | Distinct IRI subjects with explicit `rdf:type owl:NamedIndividual` |
| Claims | Named individuals explicitly typed `assurance:Sinistre` |
| Contracts | Named individuals explicitly typed `assurance:Contrat` |
| Insured people | Named individuals explicitly typed `assurance:Assuré` |
| Experts | Named individuals explicitly typed `assurance:Expert` |

The summary also counts default-graph triples with COUNT(*). Application metadata in its separate named graph is excluded. No OWL reasoning or inferred subclass membership is used: classes are not counted as business records. Counts are read from aggregate literals and checked as nonnegative safe integers; missing/invalid results are errors rather than guessed zeros. One summary SELECT joins singleton aggregate subqueries to avoid Cartesian-product inflation and return genuine zeros for an empty dataset.

The unchanged local file summary remains available and is labelled separately under “Deux sources distinctes.” It can remain 20 classes/5 individuals while TDB2 records grow through claims CRUD. Backend liveness is displayed, but is explicitly not Fuseki readiness. When Fuseki is unavailable, live cards show dashes/errors rather than substituting file statistics. Statistics and distribution requests have independent controlled loading/error states and a common refresh button. Counts and charts are separate requests, so concurrent external writes can make them reflect slightly different snapshots.

### Charts

- **Claims by status**: distinct named claims grouped by actual `statutSinistre`; missing status is a labelled “Statut non renseigné” bucket. A multi-status claim may contribute to more than one group.
- **Claims by expert**: distinct named claims grouped by `évaluéPar` to an explicitly named/typed Expert. Missing or untyped expert links are labelled “Aucun expert typé.” A multi-expert claim may appear in multiple groups.
- **Domain instances**: explicit named-individual counts for Sinistre, Contrat, Assuré, Expert and Dommage. These are ontology-backed category definitions, not invented records. Categories with no instances have true zero counts; a resource can have several types.
- **Damage estimates**: actual `montantEstimé` values for named Dommage resources. Valid nonnegative `xsd:decimal`/`xsd:integer` literals become chart numbers; missing/invalid/out-of-range values are omitted with diagnostics, never turned into zero. Their exact lexical decimal strings appear in the accompanying table. JavaScript chart coordinates are approximate; no monetary sum or currency is invented. Amounts cover all such damage nodes, not necessarily only linked claims.
- **Contract types**: unavailable state. The supplied model declares Contrat without a supported business type breakdown; no automobile/home categories are invented from identifier prefixes.

Distributions use 101-row queries with a 100-row display cap and explicit truncation (the fixed five-type instance query has a 10-row bound). The chart plots at most 12 categories for readability while the full returned table remains accessible. Counts are not rounded; approximate chart amounts retain exact table values. No chart animations, random values or demo records are used. Charts with no positive values show an empty state and retain any valid zero rows in their table. Recharts keyboard support is enabled, figures are labelled, and native details sections expose the corresponding full data tables.

## Ontology Graph design

The graph comes from current backend/Fuseki SELECT responses, not hardcoded frontend nodes. Rows are normalized into:

```typescript
GraphNode = { id, iri, label, category, categories, types };
GraphEdge = { id, source, target, predicate, label };
```

Node IDs use the complete resource IRI, so two resources with the same local name or label remain distinct. Edge IDs serialize the full `(subject,predicate,object)` tuple, preventing label-based collisions and removing duplicate rows. Maps deduplicate nodes and edges. Every emitted edge has its endpoint nodes. French `rdfs:label` values are preferred, then untagged labels, then other languages; a namespace-local name is the fallback. Blank labels are ignored. Multi-role resources retain all categories, with individual/property/class color precedence. Referenced class/property nodes are distinguished in the details text from resources with explicit type declarations included in that view.

### Schema mode

Includes named declared OWL classes, named `rdfs:subClassOf` hierarchy links, and declared OWL object properties with their named domain, range and inverse links when present. Object properties are amber diamond nodes; domain/range edges connect them to class nodes. Classes are blue rounded rectangles. An undeclared inverse endpoint may still be represented as a referenced property, without inventing a domain/range assertion. Domain/range and inverses are never inferred where absent.

This intentionally bounded schema view excludes anonymous restriction/list nodes and datatype properties; it is not a complete OWL axiom/reasoner view. The source file and query definitions remain available for academic discussion of those restrictions. Declared-class statistics do not count anonymous restrictions or graph reference nodes.

### Individuals mode

Includes explicitly named individuals, their named RDF types, and relationships whose predicates are **declared `owl:ObjectProperty`** and whose endpoints are named individuals. It does not treat every predicate as an insurance relationship. Data properties/literal amounts are handled by the dashboard rather than graph edges. RDF-type edges connect individuals to referenced class nodes. Individuals are green circles. The original `S2026_014 → évaluéPar → Karim` edge is preserved when present in the dataset, including its accented predicate.

Both modes use a 2001-row lookahead and normalize the first 2000 rows, reporting `truncated`. This limit applies to SPARQL binding rows (labels can multiply rows), not a claim of complete graph coverage or a fixed node count. Named graph application metadata is excluded. Small imported datasets have no fabricated extra structure.

### Interactions and accessibility

Cytoscape provides pan, node dragging and wheel/pinch navigation. Controls implement zoom in/out, fit and deterministic breadth-first reset; zoom is bounded. Search matches visible node names/full IRIs, highlights matches and fits their neighborhood. Category filters retain only edges whose endpoints remain visible. Edge-label visibility is independently toggleable. The legend describes categories and arrows. Clicking a node, or selecting it from the textual table, opens details with name, category, full IRI, explicit RDF types and incoming/outgoing relationships known in the returned view. A partial graph is not presented as a complete inventory of all axioms.

The canvas is marked aria-hidden with a separate node table and relationship table as the accessible alternative. Details and result messages are announced; controls have labels and visible keyboard focus. CSS collapses the graph/details columns on smaller screens and provides horizontal table scrolling. A ResizeObserver resizes Cytoscape. Effects disconnect the observer, unregister the node handler and destroy the Cytoscape instance whenever it is replaced/unmounted. Real browser lifecycle/rendering behavior remains untested under the no-live constraint; an isolated headless test exercises element identity, selection, listener removal and engine destruction without a browser/DOM.

## SPARQL Explorer and exports

The catalogue is generated from the single existing Phase 1 query registry; query text is not copied into frontend definitions. Users select a predefined ID, inspect its French description and read-only highlighted SELECT, then execute that same existing endpoint. There is no query editor, text submission or arbitrary endpoint override. Results preserve URI/blank-node/literal types, datatype/language metadata and unbound-variable cells. The count is returned row count, explicitly distinct from unique individuals. Existing 1000-row limits remain in force and the Explorer labels that bound; the original endpoint contract does not provide an exact truncation indicator.

Copy uses the browser Clipboard API with a controlled fallback message if unavailable. Exports use already returned results only: UTF-8 CSV with quoted/escaped values and formula-injection neutralization for spreadsheet cells, and JSON preserving complete RDF term metadata. CSV apostrophe protection may intentionally alter dangerous lexical text; JSON is the faithful RDF interchange option. A local Blob/object URL is created on user action and revoked after download. No results or source data are uploaded anywhere.

## Security and operational limitations

All new database operations are fixed SELECT templates in a separate allowlist, with runtime key validation. No UPDATE/INSERT/DELETE/SERVICE, raw user query, secret, update endpoint, or admin capability is added. Graph inputs choose only one of two known views. The query catalogue reveals only approved SELECT source. Existing Phase 2 writes remain default-disabled and separately authorized; this phase does not change that policy. React renders RDF values as text, never untrusted HTML. CSS classes/selectors use fixed values; graph lookups use complete IDs directly rather than interpolated selector syntax.

The application remains a loopback study/demo setup; production identity, rate limits, response byte caps and deployment hardening remain outside scope. The existing SELECT transport buffers JSON and uses the configured timeout. Graphs/charts are deliberately bounded; there is no graph pagination, reasoning, inferred relationships, currency model or automatic source-file sync. A damaged/contradictory dataset may show multi-valued groups instead of a clean business partition. Monetary values outside safe chart bounds are reported/omitted. Real Fuseki syntax, aggregation semantics, web rendering, clipboard/download behavior and accessibility need later authorized runtime checks.

## Verification and later manual checks

Permitted root commands:

```powershell
npm run typecheck
npm run build
npm run test:unit
```

The isolated suite runs backend Phase 1–4 mocks and filesystem-only ontology checks, plus frontend pure export/filter tests and **headless, in-memory** Cytoscape tests. It starts no application/Fuseki server, makes no real HTTP request, and performs no real RDF mutation. The original full `npm test` still includes Supertest listener-based tests and must not be run during a no-live session. Dependency installation is the only network operation used here. No browser or computer-use tool was used.

Offline RDF/XML parsing verified the actual unchanged source contains **112 triples, 20 declared classes and 5 named individuals**. Those are regression expectations in tests/documentation, not production constants. Hash remains `1DA702515E9D96177C49C2A9721203275B6E41C553B23EBFEF3F2AAD3D9BE9A0`.

Executed results: root `npm run typecheck` passed for frontend/backend source and tests; root `npm run build` passed for both production applications; root `npm run test:unit` passed **56 tests, 0 failed** (52 backend including every Phase 1–3 regression, plus 4 frontend pure/headless tests). Lazy-loaded production chunks are below Vite's default size-warning threshold. No browser rendering, real HTTP routing, live Fuseki execution, clipboard operation or actual file download was tested. The full listener-based Supertest suite remains unexecuted.

For a **later explicitly authorized manual session**:

1. Follow the existing Windows Fuseki guide and app startup instructions. Use the imported real ontology and existing backend query environment settings. No new environment variable is required; keep mutations disabled for read-only Phase 4 verification.
2. Open Dashboard and compare all six cards/triple count with direct trusted dataset inspection. With the unmodified original import, expect the documented 20/5/112 regression values; runtime claims legitimately change the dataset totals. Verify unavailable/empty data is not replaced by mock values.
3. Check chart/table agreement, zero and missing values, refresh/error handling, and narrow-screen layouts. Confirm exact decimal values in the damage table, no invented currency, and unavailable contract types.
4. In Ontology Graph, check schema class hierarchy and property domain/range/inverse links. Switch to individuals and locate `S2026_014 → évaluéPar → Karim`. Exercise drag/pan, zoom/fit/reset, labels, category filters, search and accessible node/edge tables. Navigate away/back to check cleanup.
5. In SPARQL Explorer, run all seven approved definitions, including the Karim example; compare displayed code/results with Phase 1. Check empty results, copy fallback and local CSV/JSON exports. Confirm free-text/raw-query input and update/admin access are absent.
6. Revisit Claims and Assistant NLP to verify unchanged workflows. Only test real mutations in a separately authorized disposable-data session.

## Academic contribution

The dashboard demonstrates explicit schema versus instance counting and RDF aggregate SELECTs. The graph demonstrates named OWL class hierarchy, property semantics, RDF typing, IRI identity, inverses and the actual expert relationship. The Explorer makes the required SPARQL source and RDF term results inspectable and exportable. Data tables and source labels let an evaluator compare every visual with its underlying assertions; missing/inferred/fabricated data are not confused with real ontology facts. Claims CRUD and explainable French NLP remain separate demonstrations from earlier phases.

## File manifest

Created backend files:

- `src/sparql/visualization.queries.ts`, `src/sparql/catalogue.ts`
- `src/types/visualization.ts`
- `src/services/dashboard.service.ts`, `src/services/ontology-graph.service.ts`
- `src/validators/visualization.ts`, `src/controllers/visualization.controller.ts`, `src/routes/visualization.routes.ts`
- `test/visualization.test.ts`

Created frontend files:

- `src/types/visualization.ts`, `src/services/visualization.ts`, `src/hooks/useResource.ts`
- `src/components/DataState.tsx`, `StatisticCard.tsx`, `AnalyticsChart.tsx`, `RdfResultsTable.tsx`, `SparqlCode.tsx`, `GraphControls.tsx`, `OntologyCanvas.tsx`, `GraphNodeDetails.tsx`
- `src/pages/OntologyPage.tsx`, `src/pages/SparqlPage.tsx`
- `src/utils/export-results.ts`, `src/utils/graph.ts`, `src/phase4.css`
- `test/visualization.test.ts`, `tsconfig.test.json`

Modified: backend `src/app.ts`, `src/sparql/client.ts`, `src/routes/sparql.routes.ts`, `package.json`; frontend `src/pages/OverviewPage.tsx`, `src/App.tsx`, `src/main.tsx`, `src/layouts/AppLayout.tsx`, `package.json`; root `package.json`, `package-lock.json`, README and architecture documentation; this new Phase 4 document. Original ontology, claims/NLP implementation and Fuseki profiles are preserved.
