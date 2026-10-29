# Phase 2: SPARQL CRUD and claims management

Implemented only for claims (`Sinistre`). Phase 0 health/local summary and all seven Phase 1 read-only resources remain in place. The React `/sinistres` route now provides the claims table, filters, details, create/edit forms, deletion confirmation, loading/empty/error states and success notices. Other modules remain placeholders. No NLP, graph visualization, SQL database, or alternative stack is introduced.

## API contract

All responses retain `{ success: true, data: ... }` or `{ success: false, error: { code, message } }`.

| Method/path | Inputs | Result |
| --- | --- | --- |
| GET `/api/claims` | Optional `search`, `status`, `insuredId`, `expertId`, `contractId`, `page`, `pageSize` | `{items, page, pageSize, hasMore}` |
| GET `/api/claims/options` | None | RDF reference identifiers and `mutationsEnabled` (no credentials) |
| GET `/api/claims/:id` | Identifier | Details, `revision`, `editable`; ETag for an app-managed claim |
| POST `/api/claims` | JSON ClaimInput; authenticated session with `claims:write` | 201 `{id, revision}` and Location |
| PATCH `/api/claims/:id` | JSON `{revision, ...changedFields}`; authenticated session with `claims:write` | `{id, revision}` |
| DELETE `/api/claims/:id` | If-Match header containing quoted revision; authenticated session with `claims:write` | `{id, deleted: true}` |

All claims API routes require an authenticated application session. Writes additionally require the backend `claims:write` permission (ADMIN/AGENT) and the independent write-mode feature gate. VIEWER and unauthenticated users cannot mutate. CSRF/Origin protections apply, and the old `x-demo-write-token` mechanism has been retired; passing that header never authorizes a write.

ClaimInput fields:

```typescript
{
  id: string;
  insuredId: string;
  contractId: string;
  declarationDate: string; // YYYY-MM-DD
  status: 'Déclaré' | 'En cours' | 'En expertise' | 'Accepté' | 'Rejeté' | 'Clôturé';
  expertId?: string | null;
  fraudulent: boolean;
  damageAmount?: string | null; // decimal string, not a JSON number
}
```

The optional expert/damage fields default to null on creation. On PATCH, omission preserves the field; null explicitly clears it. Insured and contract may change together if their relationship validates. `id` is immutable on PATCH. Existing references come from the RDF store, never frontend mock records. The UI currently models zero or one damage per claim with an estimated amount, creating a private application damage IRI when supplied. It does not attach or edit arbitrary existing damage nodes.

Identifiers use `[A-Za-z][A-Za-z0-9_]{0,63}`. Search is a case-insensitive identifier substring and follows this same input character rule. Pagination defaults to page 1/20 rows; pageSize is 1–100 and page is 1–10000. Pagination applies to distinct claim identities before joining optional fields, with a one-claim lookahead for `hasMore`. No total-count query is performed. Dates are checked against the real calendar (including leap years); year 0000 is excluded. Money is a nonnegative decimal string with at most 12 integral digits and two fractional digits; strings avoid floating-point rounding. Zero is supported. Missing legacy RDF properties are displayed as unavailable, rather than fabricated.

The status list is an application policy; the ontology itself declares a string datatype without an enumeration. Legacy unrecognized statuses can be read; a write must choose a supported status. Boolean input must be a JSON boolean. Unknown body fields, identity changes and empty PATCH operations are rejected. Missing/multiple contradictory relationships or attributes produce clear validation/conflict errors.

Relevant statuses: 400 invalid input, 401 missing/expired session, 403 missing permission/writes disabled/protected claim, 404 missing claim, 409 duplicate/conflicting/stale data, 422 invalid references, 502 upstream or Fuseki credential errors, 504 timeout/uncertain write outcome. There are no automatic mutation retries.

## Ontology mapping and write integrity

All domain IRIs use `http://www.example.org/assurance#` and the exact Unicode properties in the original file:

- Creation types the claim as `owl:NamedIndividual` and `Sinistre`, links the insured through both `déclareSinistre` and `estDéclaréPar`, and sets `concerneContrat`.
- `dateDéclaration`, `statutSinistre`, `estFrauduleux` use `xsd:date`, `xsd:string`, `xsd:boolean`.
- An optional expert is linked using `évaluéPar`. Optional damage is an `owl:NamedIndividual`/`Dommage`, linked through `produitDommage`, with `montantEstimé` as `xsd:decimal`.
- Insured, contract, and expert must have their explicit expected RDF types. An insured cannot also be an Expert; an expert cannot also be an Assuré. The insured must own the contract through either asserted `aSouscrit` or inverse `estSouscritPar`, with no other owner assertion. Missing ownership is rejected rather than inferred/invented. These checks are repeated inside the conditional INSERT/UPDATE, protecting against races between reference validation and the write.

SPARQL construction lives in `backend/src/sparql/claims.queries.ts`. Identifiers are strictly validated before IRI construction; literal values are serialized with JSON-compatible SPARQL string escaping. Numeric pagination is validated, not copied from raw HTTP input. No route accepts raw SPARQL, user-selected predicates, graph names, or destinations. The Phase 1 client remains a closed read-only registry.

Application provenance and revision UUIDs live in a separate named graph, `urn:assurance:application:metadata`, not in `assurance.owl`. There is no new OWL schema declaration. Claims/damage domain triples are written to the same default graph imported in Phase 1. New claim IDs are rejected if already used as a subject/object in the default/named graphs. Conditional creation repeats the collision guards inside the update. Deleted IDs remain reserved by metadata tombstones and cannot be reused accidentally.

Only application-managed claims may be edited/deleted; `S2026_014` is additionally protected by name. This preserves the original example and all original individuals. Updates use DELETE/INSERT WHERE with the expected metadata revision, replace managed attributes and both insured-direction links, remove obsolete expert associations, and preserve the claim IRI and unrelated predicates. Managed scalar fields are normalized during an update. Damage links/nodes remain untouched when damageAmount is omitted; an explicitly changed amount creates a new app-owned node rather than editing a potentially shared node. A stale revision gives 409. The exact expected revision must match even if someone bypasses the UI. Post-write revision readback detects conditional no-ops; a concurrent later write can also cause a conflict response, so reload after conflicts.

Deletion removes only known claim predicates/types and the incoming insured declaration links. It never uses a blanket inbound/outbound triple deletion. Unknown references/predicates remain intact. Original contracts, insured people and experts are never deleted. Orphan damage cleanup is limited to nodes carrying this application's ownership marker, with no incoming references in default or named graphs, and only known managed type/amount predicates are removed. Shared, original, or otherwise unrelated damage nodes are retained. The cleanup is conditioned on the successful new revision and is included in the same SPARQL update request.

`ClaimsRepository` sends a generated operation in one update request; Fuseki/TDB2 is expected to execute that request transactionally. Real transaction/concurrency behavior is pending live verification. A lost connection after submission cannot prove whether a commit happened: `MUTATION_OUTCOME_UNKNOWN` asks the user to reload before retrying. The application does not claim exactly-once delivery or distributed transactions. Out-of-band Fuseki edits are outside these guarantees and must not alter application metadata.

## Secure write activation

The earlier demo-token instructions are obsolete. Phase 4.5 authentication now requires application sessions, RBAC and CSRF/Origin protections; no demo header authorizes writes. The current local environment has `CLAIMS_MUTATIONS_ENABLED=false` and no Fuseki writer username/password, so this checkout is still safely read-only. Follow [ENABLE_CLAIMS_CRUD.md](ENABLE_CLAIMS_CRUD.md) for the existing TDB2 backup, private authenticated writer setup, same-dataset update endpoint configuration, Windows commands, manual acceptance and read-only rollback. Do not re-import the ontology or run both Fuseki profiles against the same store.

## Verification and manual acceptance later

Permitted isolated checks:

```powershell
npm run typecheck -w backend
npm run build
npm run test:unit -w backend
```

The isolated suite uses mock stores, injected fake HTTP responses, direct Express handler calls, and a filesystem-only original-ontology integrity/parser check. It never starts listeners or calls real fetch. It also runs all Phase 1 mocked tests. Do **not** use `npm test` for a no-live session: the original Phase 0 Supertest suite opens HTTP listeners.

Executed results for this delivery: backend source/test TypeScript check passed; frontend and backend production builds passed; **22 isolated tests passed, 0 failed** (14 Phase 2 tests and 8 Phase 1 tests). The original OWL SHA-256 matches and the real RDF/XML loader returned 20 declared classes/5 named individuals in the filesystem-only test. No dependencies were added. The Supertest suite was not executed. No application/Fuseki server, real HTTP request, database mutation, browser, or computer-use tool was used.

Later authorized manual acceptance should verify disabled/unauthorized writes first; real SELECT syntax/results; creating a uniquely named test claim with real references; correct datatypes and inverse links; duplicate rejection; invalid ownership/reference rejection; updates and obsolete expert removal; competing revisions; deletion confirmation and protected example rejection; shared damage preservation; TDB2 restart persistence; and denial of unauthenticated update/admin operations. Use only disposable test claims created through this app. Neither browser rendering nor real Fuseki transaction/security behavior is established by mocked tests.

## File manifest

Created:

- `backend/src/types/claims.ts`
- `backend/src/validators/claims.ts`
- `backend/src/middleware/app-error.ts`
- `backend/src/middleware/claims-auth.ts`
- `backend/src/sparql/claims.queries.ts`
- `backend/src/services/claims.repository.ts`
- `backend/src/services/claims.service.ts`
- `backend/src/controllers/claims.controller.ts`
- `backend/src/routes/claims.routes.ts`
- `backend/test/claims.test.ts`
- `frontend/src/types/claims.ts`
- `frontend/src/services/claims.ts`
- `frontend/src/components/ClaimForm.tsx`
- `frontend/src/components/ClaimDetails.tsx`
- `frontend/src/pages/ClaimsPage.tsx`
- `frontend/src/claims.css`
- `config/fuseki/assurance-write.ttl`
- `config/fuseki/shiro-write.ini`
- `docs/PHASE2.md`

Modified: backend `app.ts`, `config/env.ts`, `middleware/error-handler.ts`, `sparql/client.ts` (exports the existing result validator), `.env.example`, `package.json`, module notes; frontend `App.tsx`, `main.tsx`, `services/api.ts`, `layouts/AppLayout.tsx`; README and architecture/Fuseki documentation. No dependency additions, original ontology changes, or Phase 3 functionality.

## Remaining limitations and Phase 3 recommendation

This is a local demo with a shared write token, no per-user sessions/roles, and no production security claim. Reference selectors are capped at 1000 typed rows. The editor supports one app-owned estimated damage per claim; multiple contradictory existing values are rejected. Only explicitly asserted types/relations are checked; no OWL reasoner or general consistency engine is provided. A full amount currency model is not present in the ontology and no currency is invented. Counts from the original file deliberately do not reflect runtime TDB2 mutations. Live HTTP, browser accessibility/rendering, Fuseki syntax/authentication/transactions and persistence still require an authorized session.

After Phase 2 approval, first authorize runtime acceptance and resolve any installation/engine-specific issues. Then scope the explainable NLP pipeline (normalization, intent recognition, entity extraction and validated query-template selection) without LLM question-to-SPARQL APIs. No NLP implementation begins automatically.
