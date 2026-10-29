# Phase 3 — Explainable French NLP to SPARQL

This phase adds an Assistant NLP page and a deterministic French-to-SELECT pipeline. Existing health, ontology statistics, claims CRUD, mutation authorization, Fuseki profiles, and all seven Phase 1 resources remain available. The original `ontology/assurance.owl` is unchanged. No LLM API, Python service, new database, or Phase 4 visualization/analytics feature is introduced.

## Library and linguistic processing

The backend installs **natural 8.2.6**, resolved in the root npm lockfile. It uses the library's `AggressiveTokenizerFr` and `PorterStemmerFr` (French Porter/Snowball-style stemming). Only those two CommonJS modules are loaded through `createRequire`; natural's optional database adapters are not imported or configured. Some database client packages are transitive dependencies of natural, but this application creates no database connections through them. Use `npm ci` to reproduce the locked installation.

This is NLP because it performs Unicode normalization, French tokenization, linguistic stemming, lexical intent recognition, typed dictionary entity recognition, ambiguity handling and semantic query planning. It does not look up whole question strings. The same grammar rules handle capitalization, punctuation, inflections, synonyms and many paraphrases. It is a rule-based domain NLP system, not a learned general-language model or a statistically calibrated classifier. No confidence probability is reported.

## Architecture

```text
POST /api/nlp/ask {question}
  → input validation
  → French normalization → natural tokenizer → natural French stems
  → reject mutation/negation/unsupported combination cues
  → fixed SELECT entity catalogue from the current Fuseki default graph
  → identifier/label recognition → unique typed resolution
  → stem/lexical intent rules + unconsumed vocabulary checks
  → validated QueryPlan
  → approved SELECT builder
  → existing SparqlClient query transport
  → RDF term-preserving formatting + French explanation
```

Normalization uses NFKC, French lowercase, apostrophe/punctuation/hyphen separation, ligature expansion (`œ → oe`, `æ → ae`) and whitespace collapse. Accents remain visible in the preprocessing trace. Accent-folded variants are used for entity matching and lexical recognition. The French stemmer is applied to both accented and unaccented lexicon variants because suffix behavior can differ when an accent is missing. Tokenization may split an identifier's underscore (`S2026_014`), so entity recognition separately uses normalized string spans to preserve the exact identifier recovered from RDF.

The implementation separates these concerns:

- `nlp/preprocess.ts`: natural adapters, normalization, tokenization, stemming and lexicon preparation.
- `nlp/entities.ts`: RDF catalogue mapping, safe identifier validation, whole-span matching and ambiguity checks.
- `nlp/planner.ts`: deterministic intent/relationship rules, unsupported vocabulary and ambiguity rejection.
- `nlp/queries.ts`: bounded catalogue query and fixed SELECT builders.
- `nlp/format.ts`: result limits, count validation and French factual summaries.
- `nlp/types.ts`: typed plans, entities, reader capability and responses.
- `validators/nlp.ts`: JSON shape, question length/control characters and raw-code rejection.
- `services/nlp.service.ts`: orchestration only; no business logic in controllers.
- `controllers/nlp.controller.ts` and `routes/nlp.routes.ts`: Express integration and consistent envelopes.

The original read-only `SparqlClient` now shares its private HTTP executor between the unchanged seven-key registry and two additional internal capabilities: fixed entity-catalogue SELECT and validated NLP plan SELECT. There is no public raw-SPARQL executor, no new Phase 1 route, and no update capability in `NlpReader`. Existing timeouts, redirect rejection, response validation, upstream error handling and query endpoint configuration apply unchanged. Construction/startup sends no HTTP request. At runtime, each accepted question reads the catalogue afresh and then executes at most one generated SELECT. Read failures propagate to the centralized error handler.

## Supported intents

| Intent | French example | RDF meaning |
| --- | --- | --- |
| `list_claims` | Liste tous les sinistres. | Explicit `rdf:type assurance:Sinistre` |
| `claims_by_expert` | Quels sinistres sont évalués par Karim ? | `assurance:évaluéPar` to a typed Expert |
| `claim_details` | Montre-moi le sinistre S2026_014. | Exact claim IRI, optional detail properties |
| `list_insured` | Liste les assurés. | Explicit type `assurance:Assuré` |
| `list_contracts` | Quels sont les contrats d’assurance ? | Explicit type `assurance:Contrat` |
| `count_claims` | Combien de sinistres existent ? | `COUNT(DISTINCT ?claim)` |
| `claims_by_contract` | Liste les sinistres du contrat AUTO_882. | `assurance:concerneContrat` |
| `claims_by_insured` | Quels sinistres sont déclarés par Leila ? | `estDéclaréPar` or inverse `déclareSinistre` |

Examples of synonyms/paraphrases include `affiche`, `montre`, `donne`, `voir`, `dossier`, `réclamation`, and `police` for a contract. Domain selection distinguishes `assuré` from the generic word `assurance`. Evaluation cues require an Expert; declaration cues require an Assuré. Thus “sinistres déclarés par Karim” is rejected when Karim is typed only as Expert, rather than silently substituting `évaluéPar`.

Questions can name one individual only. Filtered counts, combinations, negation, personalized “mes sinistres,” dates/status/amount conditions and unsupported modifiers are rejected instead of partially ignored. “Mes” requires an identity system that the demo does not have. Unknown words, unresolved names and conflicting relation/type cues produce helpful controlled responses. This is deliberately limited French coverage, not an arbitrary semantic parser.

## Entity recognition and resolution

The catalogue query retrieves explicitly typed Expert/Sinistre/Contrat/Assuré individuals and optional `rdfs:label` values from the actual current dataset. It uses the namespace `http://www.example.org/assurance#`, not a static list of example records. New application-created claims can therefore be recognized after being committed to that store.

Aliases include the RDF local identifier and nonempty labels up to 120 characters. Matching is case/accent insensitive with Unicode word boundaries; the longest alias is attempted first. `Karimette` does not match `Karim`. Distinct aliases resolving to the same typed entity are deduplicated. A shared alias, accent-fold collision or conflicting type resolves to an ambiguity error, never a guessed person. No fuzzy edit-distance matching is used. An otherwise unique identifier can still collide with another entity's label after folding; choose another unambiguous label/identifier or fix the conflicting RDF labels.

Only same-namespace IRIs with a local identifier matching `[\p{L}][\p{L}\p{N}_-]{0,95}` can be selected. Other IRIs are not interpolated. A catalogue limit of 1001 rows detects overflow: above 1000 typed/label rows, processing fails closed instead of resolving from a silently truncated dictionary. This is a study-scale approach; a larger deployment needs indexed, scoped RDF entity lookup.

## Safe SELECT generation

`QueryPlan` contains only an allowlisted intent and an optional typed entity identifier. The builder validates intent, entity presence/type and identifier independently. It constructs the entity IRI from the fixed namespace and validated identifier; it never interpolates a label, question text, user predicate, endpoint, graph, variable or SPARQL fragment. Plans are generated by the service and are not accepted in the HTTP body.

For example, the expert plan contains a fixed pattern equivalent to:

```sparql
PREFIX assurance: <http://www.example.org/assurance#>
SELECT DISTINCT ?claim WHERE {
  ?claim a assurance:Sinistre ;
         assurance:évaluéPar <http://www.example.org/assurance#Karim> .
  <http://www.example.org/assurance#Karim> a assurance:Expert .
}
LIMIT 101
```

The actual template includes optional contract, declaration date, status, expert and insured detail bindings and deterministic ordering. The original `S2026_014 → évaluéPar → Karim` assertion satisfies this pattern when the supplied ontology has been imported correctly. The mocked integration regression checks the namespace, UTF-8 predicate and original claim result; it does not prove live Fuseki execution.

Normal queries use LIMIT 101: at most 100 rows are returned to the browser and the extra row signals `truncated`. A row count is not a distinct individual count because OPTIONAL multi-valued relationships can yield multiple rows. Counting instead uses a dedicated aggregate SELECT with LIMIT 1. The aggregate is validated as a nonnegative integer string and is returned separately as `totalClaims` to avoid numeric precision loss. No inference or subclass expansion is enabled.

Raw SPARQL keywords, SERVICE/federation, URLs, code delimiters, controls and oversized questions are rejected at validation. French mutation verbs are rejected by the linguistic rules. Generated queries are fixed SELECTs, and all transport goes to the existing `/query` endpoint without update credentials. Neither the NLP service nor frontend can request RDF mutations. The Phase 2 mutation switch/token/write endpoints are unchanged and unrelated to this assistant.

## API

### POST `/api/nlp/ask`

```json
{ "question": "Quels sinistres sont évalués par Karim ?" }
```

The body must contain exactly `question`, a trimmed string of 3–500 characters with no control/invisible-format characters. Unknown fields are rejected. Response data contains:

- `question`: the original question apart from surrounding whitespace.
- `intent`, `entities`, `plan`: the detected intent, resolved typed individuals and validated plan.
- `preprocessing`: normalized text, tokenizer output and French stems.
- `sparql`: the exact SELECT regenerated and executed by the read-only client.
- `results`: standard SPARQL SELECT JSON, preserving RDF term types, datatypes and language tags.
- `resultCount`: returned binding-row count; `totalClaims` for the count intent.
- `truncated`, `explanation`, `rule`: limits and human-readable factual/rule explanations.

The normal envelope is `{success:true,data:...}`. Controlled errors use `{success:false,error:{code,message}}`: 400 for invalid/unsafe input or invalid internal plans, 422 for unsupported/ambiguous questions or catalogue overflow, 502/504 for RDF service failures/timeouts. Empty valid SELECT results return success with zero rows; absent/invalid count output is an upstream 502, not an invented zero. No probability score is emitted.

### GET `/api/nlp/examples`

Returns `{success:true,data:[...]}` with nine supported example questions. It does not query Fuseki. Examples refer to the actual supplied example scenario, but are not fabricated runtime results.

## Frontend

`/assistant` now renders `NlpPage`, using the existing layout/API helper and matching the existing green insurance aesthetic. It provides a labelled French textarea, example buttons, loading/error states, a conversation log, result tables, an empty state, intent/entities, and native keyboard-accessible `<details>` sections for the transformation trace and generated SPARQL. Ctrl/Cmd+Enter submits the form. All content is rendered as React text; RDF values are not treated as HTML or automatically executed links.

The original question is displayed in the user bubble; the generated SELECT is separately labelled. Ten local exchanges are retained in component memory, with an explicit clear button. Each backend request contains just the current question, never conversation history. There is no conversational coreference: ask a complete question each time. Requests are abortable and reuse the shared API timeout. No frontend token, secret, LLM credential, Fuseki URL or database credential is added.

## Verification and later manual checks

Permitted commands (no listeners or real network inside the isolated suite):

```powershell
npm run typecheck -w backend
npm run build
npm run test:unit -w backend
```

`test:unit` includes the original Phase 1 mocks, Phase 2 isolated tests and Phase 3 NLP mocks. Do not run the full `npm test` while no-live restrictions apply: original Supertest cases start HTTP listeners. The only approved network use in this implementation session was npm dependency installation; no application/Fuseki request or browser/service/database operation was executed. No library audit request was run.

For a **later explicitly authorized manual session**:

1. Use the existing Windows Fuseki guide to start your configured Fuseki/TDB2 dataset with the real ontology imported. The assistant needs only the read-only profile; leave application mutations disabled. The reported local target is Fuseki 6.2.0, but compatibility is not live-verified in this delivery.
2. Use the existing documented app start commands, then navigate to **Assistant NLP**. No new environment variables are needed; `FUSEKI_QUERY_ENDPOINT` and `SPARQL_TIMEOUT_MS` are reused.
3. Ask all nine examples. Confirm the Karim question includes `S2026_014` only when the real dataset contains that assertion. Expand tokens/stems, check the typed entity and compare the UTF-8 `évaluéPar` predicate in generated SPARQL.
4. Try punctuation/case/unaccented variants, an unknown name, a repeated label, a negated/combined question and an attempted mutation. Confirm controlled explanations instead of guessed answers or writes.
5. Check empty and 100-row-limited results against a suitable controlled dataset, and confirm a lost RDF connection produces a useful error. Check keyboard navigation and the responsive table/trace on narrow screens.
6. Verify health/summary, all seven Phase 1 routes and claims CRUD in a separately authorized write test, without changing the original example or source file.

Real Fuseki syntax/execution, HTTP routing and browser rendering/accessibility remain unverified. Isolated tests validate rules, generated text, mocked protocol behavior and source integrity, not real engine semantics. No SQL/Mongo service, LLM or graph UI is part of Phase 3.

Executed verification: backend source/test TypeScript checks passed; frontend and backend production builds passed; **38 isolated tests passed, 0 failed** (16 NLP tests plus the 22 existing Phase 1/2 tests). The original ontology SHA-256 remains `1DA702515E9D96177C49C2A9721203275B6E41C553B23EBFEF3F2AAD3D9BE9A0`, with 20 declared classes and 5 named individuals verified by the filesystem-only parser regression. The original Supertest suite was not executed. npm dependency installation was the only authorized network operation.

## Files

Created: backend `src/nlp/{types,preprocess,entities,planner,queries,format}.ts`, `src/validators/nlp.ts`, `src/services/nlp.service.ts`, `src/controllers/nlp.controller.ts`, `src/routes/nlp.routes.ts`, `test/nlp.test.ts`; frontend `src/types/nlp.ts`, `src/services/nlp.ts`, `src/components/NlpResults.tsx`, `src/pages/NlpPage.tsx`, `src/nlp.css`; this document.

Modified: backend `src/app.ts`, `src/sparql/client.ts`, `src/nlp/README.md`, `package.json`; root `package-lock.json`; frontend `src/App.tsx`, `src/main.tsx`; README and architecture documentation. The ontology and Fuseki configuration files are unchanged. No Phase 4 work is included.
