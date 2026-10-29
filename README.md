# Assurance & Gestion des Sinistres

ESPRIT · 5TWIN5 · Function Freaks · academic year 2026–2027.

A university Semantic Web project for insurance claims management. **Phases 0–4.5 are implemented:** ontology loading, read-only SPARQL, protected claims workflows, explainable French NLP, RDF dashboard/graph/Explorer, and persistent authentication with role-based user management. Authentication uses SQLite separately from insurance RDF. Fuseki mutations remain disabled by default. No fake business records or generative API is used. Phase 5 is outside this delivery.

**Current setup:** follow [Phase 4.5 authentication and Windows setup](docs/PHASE4_5_AUTHENTICATION.md) before using protected routes. Configure Turnstile and explicitly bootstrap the first administrator; no account is created automatically. The old demo-token authorization instructions in the historical Phase 2 sections are superseded. Real database migrations/bootstrap, provider verification and browser testing were not performed during implementation.

## Stack

- Frontend: React 19, Vite 7, strict TypeScript, Tailwind CSS 4 with its Vite plugin, React Router 7, Lucide icons.
- Backend: Node.js, Express 5, strict TypeScript, dotenv, RDF/JS-compatible `rdfxml-streaming-parser`.
- NLP: natural 8.2.6, French tokenization/stemming, deterministic intent rules and RDF-backed entity resolution.
- Visual exploration: Recharts, Cytoscape.js and its TypeScript definitions; lazy-loaded pages, accessible data tables and local CSV/JSON exports.
- RDF database preparation: Apache Jena Fuseki + persistent TDB2 (manual installation); Node's built-in `fetch` sends fixed SELECT templates over HTTP. No new npm dependencies are needed for Phase 1.
- Development: npm workspaces, concurrently, tsx watch, TypeScript compiler; Node test runner and Supertest.

The root lockfile pins the resolved dependencies. Vite and Tailwind setup follow their official [Vite guide](https://vite.dev/guide/) and [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite). The RDF parser is documented in its [upstream repository](https://github.com/rdfjs/rdfxml-streaming-parser.js).

## Structure

```text
.
├── frontend/
│   ├── public/shield.svg
│   ├── src/
│   │   ├── components/       # Reusable status display
│   │   ├── layouts/          # Sidebar and application shell
│   │   ├── pages/            # Overview, claims management, shared placeholder
│   │   ├── hooks/            # System status loading and retry
│   │   ├── services/         # API client
│   │   ├── types/            # API response types
│   │   ├── utils/            # Reserved helpers
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── .env.example
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── validators/       # Read-only guard and claims validation
│   │   ├── ontology/         # Reserved dataset adapter
│   │   ├── sparql/           # Phase 1 SELECT registry and claims CRUD builders
│   │   ├── nlp/              # French preprocessing, entities, plans, SELECTs, formatting
│   │   ├── app.ts
│   │   └── server.ts
│   ├── test/                # Phase 0 system + Phase 1/2 isolated unit tests
│   ├── .env.example
│   ├── tsconfig.json
│   └── package.json
├── ontology/assurance.owl
├── config/fuseki/           # Read-only and opt-in authenticated write profiles
├── docs/ARCHITECTURE.md
├── docs/FUSEKI_WINDOWS.md
├── docs/PHASE2.md
├── docs/PHASE3.md
├── docs/PHASE4.md
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

## Install and run (Windows PowerShell)

Install Node.js **22.18 or later** and npm 10 or later. Node 22's built-in SQLite driver is experimental; see the authentication documentation. From the repository root:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
npm run dev
```

The copy commands are needed only on first setup; preserve any existing environment values. Defaults also work without `.env` files. Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Both servers run together; Ctrl+C stops them.

For separate PowerShell terminals:

```powershell
npm run dev -w backend
# In another terminal, at the same repository root:
npm run dev -w frontend
```

Build and test both workspaces:

```powershell
npm run build
npm test
```

To check the compiled applications locally after building:

```powershell
npm start -w backend
# In a second terminal:
npm run preview -w frontend
```

Preview opens at [http://127.0.0.1:4173](http://127.0.0.1:4173) and also proxies API requests. Vite preview is a local build check, not a production hosting service.

## Configuration

| File | Variable | Default | Purpose |
| --- | --- | --- | --- |
| backend/.env | PORT | 3001 | API loopback port |
| backend/.env | NODE_ENV | development | Runtime environment |
| backend/.env | ONTOLOGY_PATH | ../ontology/assurance.owl | File path relative to backend/, or absolute |
| backend/.env | FUSEKI_QUERY_ENDPOINT | http://127.0.0.1:3030/assurance/query | Backend-only query endpoint |
| backend/.env | SPARQL_TIMEOUT_MS | 5000 | Query + response timeout, integer 1–60000 ms |
| backend/.env | CLAIMS_MUTATIONS_ENABLED | false | Explicit opt-in switch for claim writes |
| backend/.env | APP_ORIGIN | http://127.0.0.1:5173 | Exact trusted browser origin; HTTPS required in production |
| backend/.env | FUSEKI_UPDATE_ENDPOINT | http://127.0.0.1:3030/assurance/update | Backend-only update URL, same dataset as query URL |
| backend/.env | FUSEKI_UPDATE_USERNAME | empty | Private Fuseki writer account |
| backend/.env | FUSEKI_UPDATE_PASSWORD | empty | Private Fuseki writer password |
| frontend/.env | VITE_API_BASE_URL | /api | Browser API prefix |
| frontend/.env | API_PROXY_TARGET | http://127.0.0.1:3001 | Vite dev/preview proxy destination |

Restart servers after changing configuration. If the backend port changes, update `API_PROXY_TARGET` as well. `VITE_*` values are public and must never contain secrets. The supplied same-origin proxy requires no CORS configuration; a future deployment should route `/api` to Express and serve frontend assets with a history fallback.

## Ontology and API

The supplied `ontology/assurance.owl` is an unchanged copy of the discovered desktop source. At startup, the RDF/XML loader parses actual declarations into distinct named RDF subjects and extracts the ontology IRI and label. The file contains **20 declared OWL classes** and **5 named individuals**; tests assert those expected counts. The loader also counts object/data properties. Anonymous restrictions are not classes in these statistics. Missing or invalid files prevent startup; counts are not fabricated. Phase 1 queries the separately imported Fuseki dataset on demand; neither loader enables OWL inference. See [architecture](docs/ARCHITECTURE.md) for provenance and boundaries.

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health | ConvertTo-Json -Depth 5
Invoke-RestMethod http://127.0.0.1:5173/api/ontology/summary | ConvertTo-Json -Depth 5
```

The second command exercises the frontend proxy when manually authorized. Automated backend tests load the real file, assert 20/5 declarations and metadata, verify health/summary responses, unknown routes and invalid JSON, and confirm missing/malformed ontology failures. Isolated frontend tests now cover pure helpers, SSR/source guards and headless graph behavior. Listener-based integration tests and browser checks remain deferred.

## Phase 1: read-only SPARQL

Follow [Windows Fuseki/TDB2 setup](docs/FUSEKI_WINDOWS.md) to install matching Jena/Fuseki distributions, import the original OWL file offline into the default graph, and start the supplied read-only dataset manually. Docker is not needed. Database binaries and runtime files are not committed; `.local/fuseki/data/assurance` is persistent, Git-ignored storage.

The Express API exposes these fixed resources:

| GET endpoint | SELECT bindings |
| --- | --- |
| `/api/sparql/classes` | `class`, optional `label` |
| `/api/sparql/individuals` | `individual`, optional domain `type` |
| `/api/sparql/contracts` | `contract`, optional `number`, `insured` |
| `/api/sparql/insured` | `insured`, optional `contract`, `claim` |
| `/api/sparql/claims` | `claim`, optional `contract`, `date`, `status`, `fraudulent` |
| `/api/sparql/claim-experts` | `claim`, `expert` linked by `assurance:évaluéPar` |
| `/api/sparql/example-karim` | `claim`, `expert`, optional `contract`, `status`; fixed `S2026_014` and `Karim` |

All templates are in `backend/src/sparql/queries.ts` and use `http://www.example.org/assurance#`. The example uses:

```sparql
PREFIX assurance: <http://www.example.org/assurance#>
SELECT ?claim ?expert WHERE {
  VALUES ?claim { assurance:S2026_014 }
  VALUES ?expert { assurance:Karim }
  ?claim a assurance:Sinistre ; assurance:évaluéPar ?expert .
  ?expert a assurance:Expert .
}
```

Responses retain RDF term types, datatype/language metadata and the Phase 0 envelope:

```json
{ "success": true, "data": { "head": { "vars": ["claim", "expert"] }, "results": { "bindings": [] } } }
```

The example response above illustrates the shape of an empty result; records are never fabricated. Optional unbound variables are omitted from individual binding rows. `DISTINCT` removes identical rows; multiple relationships/types can still yield multiple rows per resource. Queries are ordered and capped at 1000 rows; pagination and inference are outside this phase. Contract/insured queries explicitly traverse forward or inverse properties to retrieve Leila's asserted relationships without a reasoner.

Only GET is allowed (other methods return 405). Parameters and request bodies return 400; unknown resource paths return 404. There is no general-purpose SPARQL submission endpoint. The client accepts registry keys only and cannot accept UPDATE/INSERT/DELETE, arbitrary SELECT text, SERVICE federation, or caller-supplied destinations. It sends an internal HTTP POST with `application/sparql-query` to Fuseki's query-only endpoint; that HTTP method does not enable SPARQL updates. Redirects are refused. Controlled errors use 502 (`SPARQL_UNAVAILABLE`, `SPARQL_HTTP_ERROR`, `SPARQL_INVALID_RESPONSE`) or 504 (`SPARQL_TIMEOUT`). Upstream bodies are not exposed.

The Phase 1 frontend proxy exposes no Fuseki administrative/update routes. Phase 0 health and local summary continue to work without a running Fuseki; they do not indicate database readiness. Importing and keeping the separate TDB2 copy synchronized is a manual operation.

## Phase 2: insurance claims CRUD

Open the **Sinistres** navigation destination after manually starting the application in an authorized session. It provides search, status/insured/contract/expert filters, pagination, details, create/edit forms, deletion confirmation, and loading/empty/error/success states. All reference options and claims come from RDF. Only application-created claims may be changed; the original example and other original individuals remain read-only. No frontend redesign or other business modules were added.

| Endpoint | Behavior |
| --- | --- |
| GET `/api/claims` | Filtered, paginated claims |
| GET `/api/claims/options` | Reference options and write-mode flag |
| GET `/api/claims/:id` | Claim details and revision |
| POST `/api/claims` | Validated conditional SPARQL INSERT |
| PATCH `/api/claims/:id` | Revision-checked SPARQL DELETE/INSERT |
| DELETE `/api/claims/:id` | Provenance/revision-checked safe deletion |

Writes require the explicit `CLAIMS_MUTATIONS_ENABLED=true` gate, an authenticated application session with `claims:write`, and separate backend-only Fuseki update credentials. ADMIN and AGENT can write when enabled; VIEWER remains read-only. The current local backend configuration has no writer credentials, so writes remain disabled until Fuseki is configured intentionally. See [secure Claims CRUD activation and Windows setup](docs/ENABLE_CLAIMS_CRUD.md). Never use `VITE_*` for Fuseki secrets. The optional write profile reuses the existing persistent TDB2 directory and requires its paired authenticated Shiro policy; administration stays denied.

See [Phase 2 implementation and Windows setup](docs/PHASE2.md) for the exact request schema, environment configuration, security boundaries, SPARQL mapping, damage cleanup, revisions, file manifest, and later manual acceptance checklist. No setup, database import, or mutation was performed against a running service during implementation.

Run **only the isolated no-network tests** during a no-live session:

```powershell
npm run typecheck -w backend
npm run build
npm run test:unit -w backend
```

The full `npm test` command includes original Supertest tests that open local listeners; do not use it while the no-live restriction is active.

## Planned phases

0. Initialization, real ontology loading, health and summary API, placeholder interface (implemented).
1. Persistent RDF store preparation and fixed read-only SPARQL integration (implemented; live verification deferred).
2. Validated SPARQL claims CRUD and a claims-management interface (implemented; mutations disabled by default and live verification deferred).
3. Explainable French NLP intent recognition, entity resolution and read-only SELECT generation (implemented with natural; no LLM APIs).
4. RDF analytics dashboard, interactive ontology graph and read-only SPARQL Explorer (implemented; live verification deferred).

Further modules require approval after Phase 4.5 review.

## Phase 3: French Assistant NLP

The global **Assistant NLP** widget supports listing claims, filtering claims by one expert/contract/insured person, details by claim identifier, listing contracts/insured people, and counting claims. It displays the user's question separately from the generated SELECT, plus tokens, French stems, intent, typed entities, rule explanation and RDF result rows. Example buttons and a bounded local conversation history are included.

- `POST /api/nlp/ask` accepts only `{ "question": "Quels sinistres sont évalués par Karim ?" }`.
- `GET /api/nlp/examples` returns supported French examples without contacting Fuseki.
- Existing `FUSEKI_QUERY_ENDPOINT` and timeout settings are reused; no NLP credentials or new environment values are required.
- Identifiers/labels are resolved from the current RDF graph. Ambiguity, unsupported modifiers, negation, mutation requests and raw SPARQL produce controlled errors.
- Queries use the original namespace and `évaluéPar`, approved SELECT templates and a 100-row display limit. Nothing is sent to an LLM and no update endpoint is used.

See [Phase 3 architecture, file manifest, limitations and manual checks](docs/PHASE3.md). The existing claims UI and all seven Phase 1 resources are preserved. Phase 4 and subsequent frontend refinement are documented below.

Phase 3 verification: source/test TypeScript checks and both production builds passed; **38 isolated tests passed, 0 failed**, including the original Phase 1/2 regressions and 16 new NLP tests. The original OWL hash is unchanged. Only the approved npm installation used network access; no application/Fuseki requests, server starts, browser actions or real mutations were performed. Real engine execution, HTTP routing and browser behavior remain unverified.

## Phase 4: Dashboard, Ontology Graph and SPARQL Explorer

Existing routes now provide these read-only features:

- `/`: six live Fuseki-backed metrics (classes, named individuals, claims, contracts, insured people, experts), triple count and Recharts charts for status, experts, instances and damage estimates. Source-file statistics remain separately labelled. Missing contract categories are shown as unavailable.
- `/ontologie`: schema and individual graph modes using Cytoscape.js, including class hierarchy/property semantics, RDF types and the original expert edge; zoom/fit/reset, pan/drag, selection, search, categories, labels, legend, details and accessible tables.
- `/sparql`: the seven existing predefined SELECTs, with descriptions, syntax-highlighted source, execution/result table, row count, copy and local CSV/JSON export. There is no raw-query editor/endpoint.

New read-only APIs: `/api/dashboard/summary`, `/api/dashboard/distributions`, `/api/ontology/graph?view=schema|individuals`, and `/api/sparql/catalogue`. Existing health, local ontology summary, Phase 1 execution endpoints, claims CRUD and NLP remain in place. No new environment variable is needed; use the existing query endpoint. No admin/update credential is exposed through these features.

Run only static and isolated checks while live testing is prohibited:

```powershell
npm run typecheck
npm run build
npm run test:unit
```

The original full `npm test` includes listener-based Supertest tests and remains excluded. See [Phase 4 documentation](docs/PHASE4.md) for definitions, dependencies, file manifest, limits and later manual verification steps. Offline parsing confirms the original file has 112 triples, 20 declared classes and 5 named individuals; these values are regression expectations rather than production constants. No Phase 5 work is included.

Phase 4 verification: both workspace TypeScript checks and both production builds passed; **56 isolated tests passed, 0 failed** (52 backend + 4 frontend pure/headless tests). Original OWL SHA-256 is unchanged. No live testing was performed: no frontend/backend/Fuseki starts, real HTTP/database requests, mutations, browser automation or computer-use tools. Only dependency installation used network access. Runtime engine execution, browser visuals/accessibility and copy/download behavior await later authorized manual checks.

## UI/UX refinement and global NLP assistant

The frontend uses shadcn/ui, Motion, local Manrope typography and light/dark/system themes with a midnight sidebar and teal accents. The dashboard has an explicit two-column analytics grid with compact single-category facts. Claims use a compact responsive filter toolbar, table/action menus and existing protected create/edit/details flows. Ontology exploration emphasizes a larger graph, integrated toolbar, connected-node highlighting and a collapsed textual alternative. The SPARQL Explorer keeps its approved catalogue and exports.

**Assistant NLP** is one global floating widget, opened from the FAB, sidebar or dashboard. Its provider lives outside route transitions, retaining the draft and last ten exchanges in memory across navigation and close/reopen. `/assistant` replaces its history entry with `/` and opens the same widget. It uses the existing NLP examples/ask clients, actual RDF responses and collapsed explainability; no LLM service or new endpoint is added. Reloading clears conversation state.

See [UI/UX foundation](docs/UI_UX_REDESIGN.md) and [refinement architecture, changed files and manual checklist](docs/UI_UX_REFINEMENT.md). No dependencies were added for the refinement itself. Both TypeScript checks and production builds pass; **74 isolated tests pass** (52 backend + 22 frontend). Vite reports an initial JS chunk of about 565 kB minified (187 kB gzip); routes and chat content remain lazy-loaded. Backend/API/ontology/configuration preservation hashes match.

No live testing was performed. Browser visuals, real navigation/focus, virtual keyboard/safe areas, screen-reader behavior, copy/download and real-service interactions remain unverified. The full listener-based `npm test` suite remains unexecuted. No Phase 5 work is included.

## Phase 4.5 authentication

Login, activation, profile/password settings and administrator-only `/admin/users` are implemented. Application APIs require active server-side sessions; health and supporting login/setup security flows are explicit exceptions. ADMIN manages users, ADMIN/AGENT may manage claims only if separately enabled, and VIEWER has read access. The retired `x-demo-write-token` does not grant authorization; CSRF protection and backend role checks apply to mutations. RDF writes remain disabled in this checkout because no active writer credentials are configured. No Fuseki runtime was modified.

Versioned SQLite migrations live in `backend/migrations/`; default persistent storage is ignored `.local/auth/auth.sqlite`. Passwords use Argon2id. Opaque cookie session tokens and one-time setup/reset tokens are stored as digests. Setup links appear once in an admin-only confirmation; no emails are sent. Node minimum is 22.18.0, and the only new dependency is `@node-rs/argon2` 2.2.2. See [authentication architecture, endpoints, environment, bootstrap/recovery and deferred checklist](docs/PHASE4_5_AUTHENTICATION.md).

Commands for later explicit operator setup (not executed here): `npm run auth:migrate`, `npm run auth:bootstrap-admin`; recovery: `npm run auth:recover-admin`. Set `APP_ORIGIN` to the exact browser origin, configure `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`, and use `TURNSTILE_TEST_MODE=true` only with official development/test credentials. Production requires HTTPS and genuine keys. The frontend receives only the public site key; keep all secrets out of `VITE_*`.

The carried-over chatbot fix displays local resource names with expandable exact values, compact cards for up to three results and overflow-safe larger tables. The sidebar NLP action is removed; the floating widget remains inside the authenticated workspace. Its technical analysis stays collapsed.

Final offline checks: both workspace TypeScript checks and production builds pass; **114 isolated tests pass (75 backend + 39 frontend)**. Vite retains an approximately 572 kB initial-JS-chunk warning. No servers, browser, real API/provider requests, emails, administrator bootstrap or RDF writes were used. Only npm dependency installation used network access. Full listener-based integration tests and real UI/security/provider behavior remain unverified. See the authentication document for the file manifest and later manual checklist.

## Verification status (Phase 0 handoff)

Dependency installation and `npm run build` succeeded for both applications. `npm run typecheck -w backend` checks backend source and test types without executing tests. The ontology copy matches the original SHA-256, and static XML inspection confirms its 20 explicit class declarations and 5 named-individual declarations.

At the user's request, live verification was stopped: the application servers were not launched for verification, HTTP/API requests were not performed, and the automated runtime tests were not executed. Browser rendering, frontend/backend communication, and runtime RDF parser behavior remain unverified. An earlier browser navigation attempt, before this restriction, returned connection refused and did not test the application UI. The commands above are provided for the user to run when ready.

## Verification status (Phase 1 handoff)

Only static verification is performed: `npm run typecheck -w backend` checks source and test types, and `npm run build` compiles both applications. No dependency changes were required. The ontology retains its original SHA-256.

`backend/test/sparql.test.ts` contains injected-transport unit tests for every template, RDF term preservation, invalid operations/configuration, upstream errors, response validation, timeout cancellation, the HTTP input guard, controller/service responses, and centralized error mapping. These tests never need a server or real network connection. They have been typechecked but **not executed** under the static-only verification constraint. The Phase 0 suite also remains unexecuted (its Supertest cases open local HTTP listeners). No frontend/backend/Fuseki process, HTTP request, browser, or database import was used for Phase 1. Real Fuseki compatibility, persistence, security policy enforcement, and query results require later authorized verification.

## Verification status (Phase 2 handoff)

Backend source/tests typecheck and both production builds pass. The isolated `test:unit` suite passed **22 tests, 0 failed**, covering the Phase 1 mocks and new Phase 2 mocks without opening servers or making network requests. It also checks the original OWL hash and parses the unchanged ontology as 20 classes/5 individuals. The original Supertest suite remains unexecuted. No application/Fuseki server, real HTTP request, real database mutation, browser or computer-use tool was used in Phase 2. Real Fuseki syntax/transactions/authentication, TDB2 persistence, and browser rendering remain unverified; see the later manual acceptance checklist in `docs/PHASE2.md`.
