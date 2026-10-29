# Architecture: Phases 0–4.5

The npm workspace has two applications. React renders a shared responsive layout and calls a typed API client. Vite proxies `/api` to Express so development requests are same-origin. Express applies security headers, persistent session lookup and CSRF validation, exposes explicit public authentication/health routes, then requires authentication for all application data endpoints. Ontology loading needs no external service; runtime insurance queries use Fuseki/TDB2. Application users/sessions live in a separate SQLite database and never become OWL insurance individuals.

```text
Browser → React Router → overview hook → API client
       → Vite /api proxy → Express router → controller → cached summary
                                                        ↑
Startup → environment config → ontology loading service → RDF/XML parser
                                      ↑
                             ontology/assurance.owl
```

The server loads the ontology once before binding its port and fails startup if reading or parsing fails. `loadOntology` accepts a path and returns a summary independently of Express. It parses RDF/JS quads and deduplicates named subjects of explicit `rdf:type owl:Class`, `owl:NamedIndividual`, `owl:ObjectProperty`, and `owl:DatatypeProperty` declarations. Blank-node restrictions and inferred types are excluded. The ontology IRI comes from `owl:Ontology`; its label is used as the name, with the IRI as fallback. Counts are computed from the file, never fixed in the service. Tests assert the expected 20 classes and 5 individuals.

The original file is copied byte-for-byte from `C:\Users\Dhib\Desktop\websem\assurance.owl`. Original SHA-256: `1DA702515E9D96177C49C2A9721203275B6E41C553B23EBFEF3F2AAD3D9BE9A0`. Editing the source or repository copy is outside Phase 0. Restart the backend to reload a deliberately replaced ontology in a future phase.

## API contract

- `GET /api/health`: `{ "success": true, "data": { "status": "ok", "service": "assurance-api" } }`
- `GET /api/ontology/summary`: `{ "success": true, "data": { "name", "iri", "classCount", "individualCount", "objectPropertyCount", "dataPropertyCount" } }` (field names shown; values come from the file).
- Errors: `{ "success": false, "error": { "code": "...", "message": "..." } }`; statuses include 400 for malformed JSON, 413 for oversized JSON, 404 for unknown routes, and 500 for unexpected errors. Internal errors are logged without exposing stack traces in responses.

The frontend displays loading, disconnected, and connected states, supports retry, and shows unavailable statistics as dashes. A summary failure is reported separately from successful backend health.

## Future boundaries

- `services/`: application operations, eventually insurance/claims services.
- `validators/`: current read-only request guard, then future business input validation.
- `ontology/`: vocabulary constants and RDF dataset adapters.
- `sparql/`: read-only store interface, fixed SELECT templates, HTTP transport and upstream errors.
- `nlp/`: explainable intent/entity processing and validated templates; no LLM conversion APIs.
- Frontend pages, hooks, components, types, and utilities evolve as modules are approved.

Phase 2 added controlled claims CRUD and its original demo authorization. Phase 3 adds explainable French NLP-to-SELECT; Phase 4 adds read-only analytics, graph visualization and SPARQL exploration. Phase 4.5 replaces demo authorization with persistent application-user sessions and roles. Reasoning remains outside scope. Production hosting must serve frontend and `/api` under one trusted HTTPS origin with suitable security headers and SPA history fallback. Development servers bind to loopback; no permissive CORS policy is added.

## Phase 1 request flow and boundaries

```text
GET /api/sparql/<registered resource>
  → read-only HTTP guard (GET, no parameters/body)
  → controller → SparqlService → SparqlClient.select(registry key)
  → fixed SELECT template → HTTP POST /assurance/query
  → Fuseki query-only service → persistent TDB2 default graph
  ← validated SPARQL JSON results ← { success: true, data: results }
```

`queries.ts` is the single closed registry for classes, individuals, contracts, insured people, claims, claim experts, and the Karim example. It uses the real ontology namespace and Unicode property names. There is no raw-query route or query interpolation, and runtime key validation also protects non-TypeScript callers. UPDATE, INSERT, DELETE, SERVICE and all other unregistered text never reach the transport. Templates use explicit types, OPTIONAL attributes, deterministic ordering, DISTINCT, and a 1000-row cap. Forward/inverse property paths account for the actual assertions without inference; subclass expansion is not performed.

`SparqlClient` uses built-in Node fetch and an injected transport seam for tests. It restricts configured destinations to HTTP(S) query URLs, refuses redirects, sets SPARQL protocol headers, validates SELECT response structure/RDF terms, and aborts both request and body parsing after the configured deadline. A timeout is 504; unavailable, unsuccessful, or malformed upstream responses are 502. Raw response bodies and internal connection details are not returned to API consumers. No automatic retries or updates are attempted. The complete JSON response is buffered; the trusted local endpoint and bounded templates suit this small study dataset, but a public deployment would need response-size/rate limits.

`createApp` accepts an optional `SparqlService` for injection. Its default constructs a client without contacting Fuseki. Express 5 forwards rejected async handlers to the existing centralized error middleware. This leaves startup, local ontology loading, health and summary independent of RDF database availability. Health is application liveness, not Fuseki readiness.

## Persistent store preparation

`config/fuseki/assurance.ttl` declares a TDB2 dataset and **only** a named query operation. No update, upload, GSP, or unnamed operation is configured. `config/fuseki/shiro.ini` denies the full administrative API; the setup copies it into FUSEKI_BASE. Follow `FUSEKI_WINDOWS.md`: install matching Jena/Fuseki distributions manually, offline-load the unchanged RDF/XML into the default graph, then start from FUSEKI_BASE with the assembler and loopback binding. Runtime `.local/fuseki/` files are ignored. The Java binaries are external prerequisites, not npm dependencies.

There are two deliberate views: the unchanged file drives Phase 0 statistics; its manual TDB2 import drives runtime queries. They diverge as runtime claims are written in Phase 2. No sync mechanism or runtime import endpoint exists. Keep a single process on the TDB2 directory and stop Fuseki before offline loading/backup. Persistent store behavior and the chosen Fuseki release/security configuration require later manual verification.

## Phase 1 verification scope

Only builds, TypeScript checks, and static file inspection are authorized. New unit tests inject all transports and call Express handlers directly, covering queries, controlled failures/timeouts, input restrictions, and API envelopes without opening listeners. They are included and typechecked, but were not executed. The original Supertest tests also remain unexecuted. No services, database import, HTTP calls, or UI automation were used during Phase 1.

## Phase 2 claims flow

```text
React ClaimsPage → shared API client → /api/claims
  → session authentication + claims:write RBAC + default-disabled write gate
  → thin controller → validators → ClaimsService (business rules)
  → ClaimsRepository → dedicated claims SPARQL builders
  → query endpoint OR authenticated update endpoint (same TDB2 dataset)
```

The Phase 1 read-only client/registry and seven endpoints remain intact. Its existing SELECT-result validator is exported for reuse by the claims repository. The repository's raw HTTP executor is private and only generated operations are public; HTTP routes accept business fields rather than SPARQL. The frontend API client now supports typed methods/errors for claims while retaining health/summary calls.

The service enforces duplicate prevention, typed existing references, insured/contract ownership compatibility, provenance restrictions, and optimistic revision checks. Database updates repeat reference/collision/revision guards in the conditional SPARQL operation. Domain triples live in the default graph. A separate application metadata graph holds revision/provenance, damage ownership, and deletion tombstones, without editing the OWL file or adding schema classes. Updates preserve identity/unrelated predicates; deletes protect all original claims and limit damage cleanup to unshared app-owned nodes. A failed transport/readback can mean an uncertain write outcome; no automatic retries are made.

Mutations require the environment opt-in, an authenticated session with `claims:write`, and private backend-only Fuseki Basic writer credentials. The update URL must match the query URL's origin/dataset. Credentials never enter the React bundle. Separate opt-in assembler/Shiro profiles leave the default query-only configuration unchanged. The old demo token mechanism is retired. See `ENABLE_CLAIMS_CRUD.md` for Windows setup and manual activation; the current local credentials are absent and writes remain disabled.

`ClaimsPage` owns search/filter/pagination state, API loading and mutation notifications. `ClaimForm` and `ClaimDetails` are reusable presentation components. Reference selectors are populated from RDF; all authoritative validation remains on the backend. Details carry a revision for edits/deletes; deletion requires typing the identifier. Original individuals remain read-only in the UI and backend.

See `PHASE2.md` for input/response contracts and persistence behavior, and `ENABLE_CLAIMS_CRUD.md` for current authentication, Windows setup, manual acceptance and rollback. Isolated tests use mocked transports/direct handlers; listener-based integration tests remain excluded from no-live verification. No services, real HTTP requests, real database writes or browser checks are performed.

## Phase 3: French NLP

`POST /api/nlp/ask` delegates through a thin controller to `NlpService`: strict input validation → Unicode/French normalization → natural French tokenization and stemming → lexical intent cues → RDF catalogue entity recognition → typed query plan → approved SELECT builder → existing read-only SPARQL transport → factual French formatting. `GET /api/nlp/examples` returns examples without RDF access. The original assistant page has since been replaced by the global widget described below; question, trace, entities, SELECT and RDF terms remain available. The NLP module adds no LLM, database or write capability.

The internal catalogue contains only actual same-namespace typed individuals and optional labels. Resolution is whole-span, case/accent insensitive and deliberately rejects ambiguous aliases/types; unknown qualifiers are not silently ignored. Eight intents support general claims, expert/contract/insured filtering, claim details, insured/contracts lists and an unfiltered count. Only one entity filter per question is supported. French negative/combined/personalized/mutation requests are rejected, with controlled 400/422 responses.

The original seven-key query registry and its routes are unchanged. `SparqlClient` reuses a private SELECT executor for registry operations, a fixed catalogue query and plans validated/regenerated by the NLP builder; there is no raw query HTTP method. Both internal NLP requests use the existing query endpoint with its timeout/response checks and no write credentials. Plans contain only an approved intent and validated namespace-local entity identifier. The displayed query is the same deterministic query built for execution.

The catalogue fails closed above 1000 typed/label rows. Query results use a 101-row lookahead and a 100-row display cap; counts use a dedicated aggregate and retain arbitrary-precision integer text. Row counts are distinguished from distinct-individual counts. Natural is imported through its two linguistic modules to avoid loading its database adapters. The exact library version is locked. All inputs/results are rendered as React text. Detailed implementation, limitations, file manifest and later manual checks are in `PHASE3.md`.

## Phase 4: read-only visual exploration

`DashboardService` obtains typed aggregate counts and chart distributions from a separate fixed SELECT registry. Named-individual instance counts are distinct from OWL class declarations; default-graph provenance is explicit and the original file summary remains separately labelled. Status/expert groups can overlap, missing amounts are not zeros, and exact decimal strings accompany approximate chart coordinates. Recharts renders bounded data with matching accessible tables and no fabricated contract categories.

`OntologyGraphService` selects named schema or individual relationships and normalizes full-IRI nodes and tuple-identified edges. Declarations, hierarchy, object-property domain/range/inverse semantics and named-individual RDF typing remain distinct. Only declared object-property links become individual relationship edges. Deduplication, endpoint inclusion, label selection and truncation happen on the backend, before Cytoscape receives normalized data. Anonymous restrictions, datatype properties and application metadata named graphs are excluded from these bounded views. Search/category filters, graph controls, details and textual tables are frontend concerns. Observers/listeners/core instances are cleaned up by effects.

`GET /api/sparql/catalogue` reads metadata from the unchanged seven-key registry without Fuseki access. The Explorer displays that exact source and executes existing resource paths only. It cannot submit text or arbitrary endpoints. JSON exports retain RDF terms; CSV exports neutralize formula prefixes and escape fields. Copy/download operations are local user actions, with no upload or write service.

All new database access goes through the existing read-only SPARQL transport with fixed visualization keys, timeout and response checks. The Phase 1 route catalogue is extended with metadata only; its seven execution definitions, NLP and claims CRUD are untouched. Phase 4 routes include dashboard summary/distributions and ontology graph view selection. Root `typecheck` and `test:unit` run isolated checks for both workspaces; full Supertest remains excluded from no-live sessions. Recharts/Cytoscape pages are lazy-loaded so the rest of the application does not eagerly load their bundles. See `PHASE4.md` for metrics, bounds, security, dependencies, file manifest and later manual checks.

## Frontend design system and global chatbot

The presentation layer uses local shadcn/Radix source components, shared semantic CSS tokens, locally bundled Manrope, theme context and Motion utilities. Route pages stay lazy; shared layout owns desktop/mobile navigation and page transitions. Claims state and authoritative backend validation remain unchanged. Responsive charts preserve exact values/table alternatives. Cytoscape uses seeded built-in layouts, reversible selection context and cleaned-up effects; filters/theme changes reuse its instance. Textual graph disclosure is local UI state and does not refetch.

`ChatbotProvider` sits within BrowserRouter and outside Routes. It injects the existing `nlpApi` into a pure in-memory store; the global launcher lazily loads its panel. Widget consumers use `useSyncExternalStore`; stable action context prevents message updates from rerendering unrelated route consumers. History is bounded at ten exchanges, example requests are cached/coalesced, duplicate submissions are guarded synchronously, and disposal aborts transport with stale-response protection. Closing and navigating preserve state; reload clears it. No conversation is persisted to browser storage.

FAB and dashboard open the same assistant; the sidebar action has been removed. `/assistant` uses replace navigation to `/` and opens it. Desktop chat is nonmodal; mobile chat is modal with safe-area/visualViewport handling. The composer is separate from scrolling results, analysis starts collapsed, and generated SELECT text remains copyable. These presentation changes reuse the existing NLP endpoints without altering their data contracts or adding an LLM.

See [UI/UX foundation](UI_UX_REDESIGN.md) and [refinement manifest, verification and deferred manual checklist](UI_UX_REFINEMENT.md). Both workspace typechecks/builds and all 74 isolated tests pass; Vite's approximately 565 kB initial-chunk warning remains. Protected source hashes match the pre-redesign manifest. No browser, server, real HTTP, Fuseki or mutation testing was performed. Phase 5 requires approval.

## Phase 4.5: application identity and security

Request flow: security headers/trusted Origin → JSON parsing → persistent session lookup → CSRF protection → explicit public health/auth routes → requireAuth for every remaining application endpoint → role/permission middleware → existing controllers/services. ADMIN manages application users; ADMIN/AGENT may pass the claims permission gate only when the independent RDF write configuration is enabled. VIEWER remains read-only. Old demo headers never authorize requests. The default/local RDF switch remains false and Fuseki runtime is untouched.

Node's built-in SQLite driver and versioned transactional SQL migrations persist users, hashed sessions/setup tokens, rate limits and audit events under ignored `.local/auth`. Argon2id hashes passwords; no SQL schema changes insurance RDF. Initial-admin bootstrap/recovery are explicit private-terminal commands, never server-startup hooks. All accounts after bootstrap are administrator-created; one-time setup/reset links are returned only in protected confirmation responses. There is no signup or email delivery.

Turnstile's official client and fixed Siteverify transport enforce CAPTCHA with timeout, metadata checks and replay rejection. Tests inject the transport. Origin-bound CSRF, HttpOnly/SameSite cookies, token rotation, idle/absolute expiry, revocation and database-backed role lookup protect session operations. Frontend AuthProvider blocks protected routes during initial loading; login/activation have their own shell. Admin/profile pages and user menu share the existing design system. The chatbot provider now lives around the authenticated Outlet, preserving route history while clearing it on logout.

Full schema, endpoint/permission matrix, setup variables, Windows commands, file manifest, security limits and deferred checks: [PHASE4_5_AUTHENTICATION.md](PHASE4_5_AUTHENTICATION.md). Node 22 SQLite is experimental; real provider, HTTPS cookie/proxy, UI and deployment behavior remain unverified. No Phase 5 work is included.
