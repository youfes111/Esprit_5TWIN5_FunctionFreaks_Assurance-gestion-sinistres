import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import { createInput, patchInput, filters, identifier, date, amount } from '../src/validators/claims.js';
import { authorizeClaims } from '../src/middleware/claims-auth.js';
import { AppError } from '../src/middleware/app-error.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { ClaimsRepository, validateUpdateEndpoint, type ClaimsStore, type StoreConfig } from '../src/services/claims.repository.js';
import { ClaimsService, mapClaims } from '../src/services/claims.service.js';
import { claimsController } from '../src/controllers/claims.controller.js';
import { NS, insertClaim, replaceClaim, deleteClaim, selectClaims, literal, damageReference } from '../src/sparql/claims.queries.js';
import type { SelectResults, SparqlTerm } from '../src/sparql/client.js';
import type { ClaimInput } from '../src/types/claims.js';
import { loadOntology } from '../src/services/ontology.service.js';

const firstRevision = '11111111-1111-4111-8111-111111111111';
const nextRevision = '22222222-2222-4222-8222-222222222222';
const input: ClaimInput = { id: 'TEST_001', insuredId: 'Leila', contractId: 'AUTO_882', declarationDate: '2026-10-25', status: 'En cours', expertId: 'Karim', fraudulent: false, damageAmount: '12.50' };
const empty: SelectResults = { head: { vars: [] }, results: { bindings: [] } };
const term = (value: string, type: SparqlTerm['type'] = 'literal'): SparqlTerm => ({ value, type });
function rows(item: ClaimInput, revision: string | null): SelectResults {
  const row: Record<string, SparqlTerm> = {
    claim: term(NS + item.id, 'uri'), insured: term(NS + item.insuredId, 'uri'), contract: term(NS + item.contractId, 'uri'),
    date: term(item.declarationDate), status: term(item.status), fraudulent: term(String(item.fraudulent)),
  };
  if (item.expertId) row.expert = term(NS + item.expertId, 'uri');
  if (item.damageAmount !== null) { row.damage = term('urn:assurance:damage:test', 'uri'); row.amount = term(item.damageAmount); }
  if (revision) row.revision = term(revision);
  return { head: { vars: Object.keys(row) }, results: { bindings: [row] } };
}
function fixture() {
  let current: ClaimInput | null = null;
  let currentRevision: string | null = null;
  const writes: string[] = [];
  const store: ClaimsStore = {
    async list(_filter, id) { return current && (!id || current.id === id) ? rows(current, currentRevision) : empty; },
    async options() { return empty; }, async collision() { return current !== null; }, async references() { return true; }, async damageReference(){return true;},
    async revision() { return currentRevision; },
    async insert(item, revision) { writes.push('insert'); current = item; currentRevision = revision; },
    async replace(item, expected, revision) { writes.push('replace'); if (currentRevision === expected) { current = item; currentRevision = revision; } },
    async remove(_id, expected, revision) { writes.push('delete'); if (currentRevision === expected) { current = null; currentRevision = revision; } },
  };
  return { store, writes, seed(item = input, revision: string | null = firstRevision) { current = item; currentRevision = revision; } };
}
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;

test('strict validation rejects injection, unknown fields, invalid dates, money, booleans and statuses', () => {
  assert.deepEqual(createInput(input), input);
  for (const value of ['x> . SERVICE <http://attacker>', '../Karim', 'a b', '', 'évaluéPar']) assert.throws(() => identifier(value));
  for (const value of ['2026-02-29', '2026-04-31', '2026-1-01', '0000-01-01']) assert.throws(() => date(value));
  assert.equal(date('2028-02-29'), '2028-02-29');
  for (const value of ['-1', '1e3', '1.001', 'NaN', 12, '1234567890123']) assert.throws(() => amount(value));
  assert.equal(amount('0'), '0.0'); assert.equal(amount(null), null);
  for (const change of [{ fraudulent: 'false' }, { status: 'unknown' }, { admin: true }, { declarationDate: null }]) assert.throws(() => createInput({ ...input, ...change }));
  assert.throws(() => patchInput({ id: 'NEW', revision: firstRevision }));
  assert.throws(() => patchInput({ revision: firstRevision }));
  assert.throws(() => patchInput({ status: 'En cours' }));
  assert.throws(() => filters({ page: '0' })); assert.throws(() => filters({ pageSize: '101' }));
  assert.throws(() => filters({ query: 'SELECT * {}' }));
});

test('INSERT uses ontology predicates, typed literals, collision and relationship guards', () => {
  const text = insertClaim(input, firstRevision);
  for (const predicate of ['déclareSinistre', 'concerneContrat', 'dateDéclaration', 'statutSinistre', 'évaluéPar', 'estFrauduleux', 'produitDommage', 'montantEstimé']) assert.ok(text.includes(`a:${predicate}`));
  assert.match(text, /INSERT/); assert.match(text, /owl:NamedIndividual, a:Sinistre/);
  for (const type of ['date', 'string', 'boolean', 'decimal']) assert.ok(text.includes(`^^xsd:${type}`));
  assert.match(text, /FILTER NOT EXISTS/); assert.match(text, /a:aSouscrit\|\^a:estSouscritPar/);
  assert.match(text, /otherOwner/); assert.match(text, /urn:assurance:application:metadata/);
  assert.match(literal('"\\\n'), /^"\\"\\\\\\n"$/);
  const selectedDamage=insertClaim({...input,damageId:'PareChoc',damageAmount:null},firstRevision);
  assert.match(selectedDamage,/a:produitDommage <http:\/\/www\.example\.org\/assurance#PareChoc>/);
  assert.match(selectedDamage,/app:deleted true/);assert.match(damageReference('PareChoc'),/a:Dommage/);
});

test('SELECT supports all filters and paginates claim identities before optional joins', () => {
  const text = selectClaims(filters({ search: 'TEST', status: 'En cours', insuredId: 'Leila', expertId: 'Karim', contractId: 'AUTO_882', page: '3', pageSize: '10' }));
  assert.match(text, /SELECT DISTINCT \?claim WHERE/);
  assert.match(text, /LIMIT 11 OFFSET 20/); assert.match(text, /CONTAINS\(LCASE/);
  for (const value of ['Leila', 'Karim', 'AUTO_882', 'En cours']) assert.ok(text.includes(value));
  assert.match(selectClaims({ page: 1, pageSize: 20 }, input.id), /VALUES \?claim/);
});

test('UPDATE/DELETE constrain predicates, provenance, revisions and damage cleanup', () => {
  const update = replaceClaim({ ...input, expertId: null, damageAmount: null }, firstRevision, nextRevision);
  const deletion = deleteClaim(input.id, firstRevision, nextRevision);
  assert.match(update, /DELETE[\s\S]*INSERT/); assert.match(update, /OPTIONAL \{ \?insured a:déclareSinistre/);
  assert.match(update, /FILTER\(\?p IN/); assert.match(update, /app:revision/);
  assert.match(update, /app:owner/); assert.match(update, /FILTER NOT EXISTS \{ \?any \?link \?damage \}/);
  assert.match(update, /FILTER NOT EXISTS \{ GRAPH \?g/);
  assert.doesNotMatch(update, /a:évaluéPar <http:\/\/www.example.org\/assurance#Karim>/);
  assert.match(deletion, /app:deleted true/);
  assert.doesNotMatch(deletion, /DELETE WHERE \{ \?s \?p \?o/);
  assert.match(deleteClaim('S2026_014', firstRevision, nextRevision), /FILTER\(false\)/);
  assert.doesNotMatch(update + deletion, /DROP|CLEAR|SERVICE|LOAD/);
  const statusOnly = replaceClaim(input, firstRevision, nextRevision, false);
  assert.doesNotMatch(statusOnly, /produitDommage|montantEstimé|app:owner/);
});

test('service create, read, update, delete operate through the injected store', async () => {
  const { store, writes } = fixture(); const service = new ClaimsService(store);
  const created = await service.create(input);
  assert.equal((await service.get(input.id)).revision, created.revision);
  const changed = await service.update(input.id, { revision: created.revision, expertId: null, status: 'Clôturé', damageAmount: null });
  const detail = await service.get(input.id);
  assert.equal(detail.expertId, null); assert.equal(detail.damageAmount, null); assert.equal(detail.status, 'Clôturé');
  assert.deepEqual(await service.delete(input.id, changed.revision), { id: input.id, deleted: true });
  await assert.rejects(service.get(input.id), code('CLAIM_NOT_FOUND'));
  assert.deepEqual(writes, ['insert', 'replace', 'delete']);
});

test('duplicate IDs, missing/contradictory references and stale revisions prevent writes', async () => {
  const { store, writes, seed } = fixture(); seed(); const service = new ClaimsService(store);
  await assert.rejects(service.create(input), code('DUPLICATE_IDENTIFIER'));
  await assert.rejects(service.update(input.id, { revision: nextRevision, status: 'Clôturé' }), code('WRITE_CONFLICT'));
  await assert.rejects(service.delete(input.id, nextRevision), code('WRITE_CONFLICT'));
  store.collision = async () => false; store.references = async () => false;
  await assert.rejects(service.create({ ...input, id: 'NEW' }), code('INVALID_REFERENCES'));
  await assert.rejects(service.update(input.id, { revision: firstRevision, contractId: 'OTHER' }), code('INVALID_REFERENCES'));
  store.collision=async()=>false;store.references=async()=>true;store.damageReference=async()=>false;
  await assert.rejects(service.create({...input,id:'BAD_DAMAGE',damageId:'MISSING',damageAmount:null}),code('INVALID_REFERENCES'));
  assert.equal(writes.length, 0);
});

test('original example and any individual without application provenance are protected', async () => {
  const { store, seed, writes } = fixture(); const service = new ClaimsService(store);
  seed({ ...input, id: 'S2026_014' }, null);
  await assert.rejects(service.create({ ...input, id: 'S2026_014' }), code('PROTECTED_CLAIM'));
  await assert.rejects(service.delete('S2026_014', firstRevision), code('PROTECTED_CLAIM'));
  await assert.rejects(service.update('S2026_014', { revision: firstRevision, status: 'Clôturé' }), code('PROTECTED_CLAIM'));
  seed(input, null);
  await assert.rejects(service.delete(input.id, firstRevision), code('PROTECTED_CLAIM'));
  assert.equal(writes.length, 0);
});

test('a conditional update no-op is a conflict; confirmation failure reports uncertainty', async () => {
  const { store } = fixture(); const service = new ClaimsService(store);
  store.insert = async () => {};
  await assert.rejects(service.create(input), code('WRITE_CONFLICT'));
  store.revision = async () => { throw new Error('mock read failed'); };
  await assert.rejects(service.create(input), code('MUTATION_OUTCOME_UNKNOWN'));
});

test('read mapping refuses contradictory relationships instead of choosing a value', () => {
  const result = rows(input, firstRevision);
  result.results.bindings.push({ ...result.results.bindings[0], insured: term(NS + 'Other', 'uri') });
  assert.throws(() => mapClaims(result), code('ONTOLOGY_CONFLICT'));
});

test('write authorization requires a session role and independent write mode; legacy tokens never authorize', () => {
  const req = (role?:string) => ({ get: () => 'a'.repeat(64),auth:role?{user:{role}}:undefined }) as unknown as Request;
  assert.throws(() => authorizeClaims({ enabled: true })(req(), {} as Response, () => {}), code('AUTH_REQUIRED'));
  assert.throws(() => authorizeClaims({ enabled: true })(req('VIEWER'), {} as Response, () => {}), code('PERMISSION_DENIED'));
  for(const role of ['ADMIN','AGENT']) {
    assert.throws(() => authorizeClaims({enabled:false})(req(role),{} as Response,()=>{}),code('MUTATIONS_DISABLED'));
    let allowed=false;authorizeClaims({enabled:true})(req(role),{} as Response,()=>{allowed=true;});assert.equal(allowed,true);
  }
});

const config: StoreConfig = { queryEndpoint: 'http://127.0.0.1:3030/assurance/query', updateEndpoint: 'http://127.0.0.1:3030/assurance/update', timeoutMs: 50, enabled: true, username: 'demo', password: 'unit-test-password' };
test('repository uses separate endpoints and credentials only for updates, with injected HTTP', async () => {
  const calls: RequestInit[] = [];
  const transport: typeof fetch = async (url, init) => {
    calls.push(init!);
    if (String(url).endsWith('/update')) {
      assert.ok(new Headers(init?.headers).get('Authorization')?.startsWith('Basic '));
      assert.match(new Headers(init?.headers).get('Content-Type') ?? '', /sparql-update/);
      return new Response(null, { status: 204 });
    }
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    return new Response(JSON.stringify(empty), { headers: { 'Content-Type': 'application/sparql-results+json' } });
  };
  const repo = new ClaimsRepository(config, transport);
  await repo.list({ page: 1, pageSize: 20 }); await repo.insert(input, firstRevision);
  assert.equal(calls.length, 2); assert.ok(calls.every((init) => init.redirect === 'error'));
  await assert.rejects(new ClaimsRepository({ ...config, enabled: false }, transport).insert(input, firstRevision), code('MUTATIONS_DISABLED'));
  assert.equal(calls.length, 2);
  assert.throws(() => validateUpdateEndpoint(config.queryEndpoint, 'http://127.0.0.1:3030/other/update'));
});

test('repository reports upstream errors and uncertain timed-out writes without retry', async () => {
  const failure: typeof fetch = async () => new Response('private details', { status: 403 });
  await assert.rejects(new ClaimsRepository(config, failure).insert(input, firstRevision), code('FUSEKI_AUTH_FAILED'));
  const malformed: typeof fetch = async () => new Response('{', { headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(new ClaimsRepository(config, malformed).list({ page: 1, pageSize: 20 }), code('RDF_INVALID_RESPONSE'));
  let calls = 0;
  const timeout: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
    calls++; init?.signal?.addEventListener('abort', () => reject(new Error('mock timeout')), { once: true });
  });
  await assert.rejects(new ClaimsRepository({ ...config, timeoutMs: 5 }, timeout).insert(input, firstRevision), code('MUTATION_OUTCOME_UNKNOWN'));
  assert.equal(calls, 1);
});

test('write mode requires private credentials and reports Fuseki authentication failures safely', async () => {
  assert.throws(() => new ClaimsRepository({ ...config, username: '', password: '' }, async () => new Response(null)), /credentials are required/);
  for (const status of [401, 403]) {
    const invalidCredentials: typeof fetch = async () => new Response('private Fuseki diagnostic', { status });
    await assert.rejects(new ClaimsRepository(config, invalidCredentials).insert(input, firstRevision), (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.code, 'FUSEKI_AUTH_FAILED');
      assert.doesNotMatch(error.message, /private|diagnostic|password/i);
      return true;
    });
  }
});

test('controller returns 201/Location and AppError uses the existing error envelope', async () => {
  const { store } = fixture();
  const result: { status: number; body?: unknown; headers: Record<string, string> } = { status: 200, headers: {} };
  const res = {
    status(value: number) { result.status = value; return res; },
    json(body: unknown) { result.body = body; return res; },
    location(value: string) { result.headers.Location = value; return res; },
  } as unknown as Response;
  await claimsController(new ClaimsService(store), true).create({ body: input } as Request, res, () => {});
  assert.equal(result.status, 201); assert.equal(result.headers.Location, '/api/claims/TEST_001');
  errorHandler(new AppError(422, 'INVALID_REFERENCES', 'Controlled message'), {} as Request, res, () => {});
  assert.equal(result.status, 422);
  assert.deepEqual(result.body, { success: false, error: { code: 'INVALID_REFERENCES', message: 'Controlled message' } });
});

test('original OWL remains byte-for-byte intact and still parses as 20 classes/5 individuals', async () => {
  const path = new URL('../../ontology/assurance.owl', import.meta.url);
  const bytes = await readFile(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '1da702515e9d96177c49c2a9721203275b6e41c553b23ebfef3f2aad3d9be9a0');
  const ontology = await loadOntology(fileURLToPath(path));
  assert.equal(ontology.classCount, 20); assert.equal(ontology.individualCount, 5);
});
