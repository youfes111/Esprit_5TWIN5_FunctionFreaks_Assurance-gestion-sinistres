import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preprocess, normalize, fold, stem } from '../src/nlp/preprocess.js';
import { namespace, catalogFromResults, recognizeEntities } from '../src/nlp/entities.js';
import { questionInput } from '../src/validators/nlp.js';
import { buildNlpQuery } from '../src/nlp/queries.js';
import { planQuestion } from '../src/nlp/planner.js';
import { NlpService, nlpExamples } from '../src/services/nlp.service.js';
import { nlpController } from '../src/controllers/nlp.controller.js';
import { SparqlClient, type SelectResults } from '../src/sparql/client.js';
import { AppError } from '../src/middleware/app-error.js';
import type { QueryPlan, NlpReader } from '../src/nlp/types.js';
import type { Request, Response } from 'express';

const uri = (value: string) => ({ type: 'uri' as const, value: namespace + value });
const literal = (value: string) => ({ type: 'literal' as const, value });
const catalog: SelectResults = {
  head: { vars: ['entity', 'type', 'label'] },
  results: { bindings: [['Karim', 'Expert'], ['Leila', 'Assuré'], ['S2026_014', 'Sinistre'], ['AUTO_882', 'Contrat']].map(([id, type]) => ({ entity: uri(id!), type: uri(type!) })) },
};
const empty: SelectResults = { head: { vars: ['claim'] }, results: { bindings: [] } };
function fixture(result = empty, entities = catalog) {
  const plans: QueryPlan[] = [];
  const calls: string[] = [];
  const reader: NlpReader = {
    async nlpEntities() { calls.push('catalog'); return entities; },
    async selectNlp(plan) { plans.push(plan); calls.push('select'); return result; },
  };
  return { service: new NlpService(reader), plans, calls };
}
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;

test('French normalization retains accents and identifiers; matching folds accents and punctuation', () => {
  assert.equal(normalize('  MONTRE-MOI l’ASSURÉ S2026_014 ! '), 'montre moi l assuré s2026_014');
  assert.equal(fold(normalize('ÉVALUÉS par KARIM ?')), 'evalues par karim');
  assert.equal(normalize('cœur'), 'coeur');
});
test('natural French tokenizer and stemmer normalize linguistic inflections', () => {
  const text = preprocess('Les sinistres sont évalués.');
  assert.deepEqual(text.tokens, ['les', 'sinistres', 'sont', 'évalués']);
  assert.equal(stem('sinistres'), stem('sinistre'));
  assert.equal(stem('évalués'), stem('évaluées'));
  assert.notEqual(stem('sinistres'), 'sinistres');
});
test('all supported example questions produce approved intents, including the original scenario', async () => {
  const expected = ['list_claims', 'claims_by_expert', 'claim_details', 'list_contracts', 'list_insured', 'count_claims', 'claims_by_expert', 'claims_by_contract', 'claims_by_insured'];
  for (const [index, question] of nlpExamples.entries()) {
    const result = expected[index] === 'count_claims' ? { head: { vars: ['count'] }, results: { bindings: [{ count: literal('1') }] } } : empty;
    const { service, plans } = fixture(result);
    const answer = await service.ask({ question });
    assert.equal(answer.intent, expected[index], question);
    assert.equal(plans.length, 1);
    assert.equal(answer.sparql, buildNlpQuery(plans[0]!));
  }
});
test('accented/unaccented paraphrases resolve to the same typed expert plan', async () => {
  for (const question of ['AFFICHE les dossiers evalues par karim !', 'Quels sinistres sont évaluées par Karim ?', 'Montrez les réclamations évalués par l’expert KARIM.']) {
    const answer = await fixture().service.ask({ question });
    assert.equal(answer.intent, 'claims_by_expert');
    assert.deepEqual(answer.plan.entity, { id: 'Karim', type: 'Expert' });
  }
});
test('entity resolution uses RDF labels and exact token boundaries, with no fuzzy guessing', () => {
  const labeled = { ...catalog, results: { bindings: [...catalog.results.bindings, { entity: uri('Karim'), type: uri('Expert'), label: literal('Karim Ben Ali') }] } };
  const entries = catalogFromResults(labeled);
  const recognized = recognizeEntities(normalize('Quels sinistres évalués par Karim Ben Ali ?'), entries);
  assert.equal(recognized.entities.length, 1);
  assert.equal(recognized.entities[0]?.id, 'Karim');
  assert.equal(recognizeEntities('sinistres karimette', entries).entities.length, 0);
});
test('accent-fold collisions and conflicting RDF types produce ambiguity errors', async () => {
  const ambiguous = { ...catalog, results: { bindings: [...catalog.results.bindings, { entity: uri('Karim2'), type: uri('Expert'), label: literal('Kárim') }] } };
  await assert.rejects(fixture(empty, ambiguous).service.ask({ question: 'Sinistres évalués par Karim ?' }), code('NLP_AMBIGUOUS_ENTITY'));
  const disjoint = { ...catalog, results: { bindings: [...catalog.results.bindings, { entity: uri('Karim'), type: uri('Assuré') }] } };
  await assert.rejects(fixture(empty, disjoint).service.ask({ question: 'Sinistres de Karim ?' }), code('NLP_AMBIGUOUS_ENTITY'));
});
test('unsupported modifiers, negation, mutations and combined questions never execute SELECT plans', async () => {
  for (const question of ['Les sinistres rouges ?', 'Liste mes sinistres', 'Quels sinistres ne sont pas évalués par Karim ?', 'Supprime le sinistre S2026_014', 'Liste les sinistres et les contrats', 'Bonjour météo demain']) {
    const { service, plans } = fixture();
    await assert.rejects(service.ask({ question }), code('NLP_UNSUPPORTED_QUESTION'), question);
    assert.equal(plans.length, 0);
  }
});
test('missing expert, mismatched relationship and multiple individuals are not guessed', async () => {
  await assert.rejects(fixture().service.ask({ question: 'Quels sinistres sont évalués par un expert ?' }), code('NLP_ENTITY_REQUIRED'));
  await assert.rejects(fixture().service.ask({ question: 'Sinistres du contrat Karim' }), code('NLP_UNSUPPORTED_QUESTION'));
  await assert.rejects(fixture().service.ask({ question: 'Sinistres déclarés par Karim' }), code('NLP_UNSUPPORTED_QUESTION'));
  await assert.rejects(fixture().service.ask({ question: 'Sinistres de Karim Leila' }), code('NLP_AMBIGUOUS_QUESTION'));
  await assert.rejects(fixture().service.ask({ question: 'Sinistres de Martin' }), code('NLP_UNSUPPORTED_QUESTION'));
});
test('input validation rejects SPARQL, federation, injection, oversized text and extra parameters before catalogue access', async () => {
  for (const question of ['SELECT * WHERE {}', 'Sinistres SERVICE', 'INSERT DATA {}', 'DELETE WHERE {}', 'UPDATE sinistre', 'sinistre <http://evil>', 'sinistre; DROP ALL', 'a'.repeat(501), 'Sinistres\u0000Karim']) {
    const { service, calls } = fixture();
    await assert.rejects(service.ask({ question }));
    assert.equal(calls.length, 0);
  }
  assert.throws(() => questionInput({ question: 'Liste les sinistres', endpoint: 'http://evil' }));
  assert.throws(() => questionInput({ question: 5 }));
});
test('query builder rejects invalid template keys, entity types, and unsafe identifiers', () => {
  for (const plan of [
    { intent: 'delete' }, { intent: 'claims_by_expert' },
    { intent: 'list_claims', entity: { id: 'Karim', type: 'Expert' } },
    { intent: 'claims_by_expert', entity: { id: 'Karim', type: 'Contrat' } },
    { intent: 'claims_by_expert', entity: { id: 'Karim> SERVICE <http://evil', type: 'Expert' } },
  ]) assert.throws(() => buildNlpQuery(plan as QueryPlan));
});
test('Karim SELECT uses the real UTF-8 predicate and original namespace; detail query binds S2026_014', async () => {
  const expert = await fixture().service.ask({ question: 'Quels sinistres sont évalués par Karim ?' });
  assert.match(expert.sparql, /assurance:évaluéPar <http:\/\/www.example.org\/assurance#Karim>/);
  const detail = await fixture().service.ask({ question: 'Montre le sinistre S2026_014.' });
  assert.match(detail.sparql, /VALUES \?claim \{ <http:\/\/www.example.org\/assurance#S2026_014> \}/);
  assert.doesNotMatch(expert.sparql + detail.sparql, /\b(UPDATE|DELETE|INSERT|SERVICE)\b/);
});
test('empty results, count and truncation are derived only from mocked RDF responses', async () => {
  const answer = await fixture().service.ask({ question: 'Liste les sinistres' });
  assert.equal(answer.resultCount, 0); assert.match(answer.explanation, /Aucun résultat/);
  const count = await fixture({ head: { vars: ['count'] }, results: { bindings: [{ count: literal('17') }] } }).service.ask({ question: 'Combien de sinistres existent ?' });
  assert.equal(count.totalClaims, '17'); assert.equal(count.resultCount, 1);
  const large = { head: { vars: ['claim'] }, results: { bindings: Array.from({ length: 101 }, (_, i) => ({ claim: uri(`TEST_${i}`) })) } };
  const capped = await fixture(large).service.ask({ question: 'Liste les sinistres' });
  assert.equal(capped.truncated, true); assert.equal(capped.resultCount, 100);
  assert.equal(capped.results.results.bindings.length, 100);
});
test('catalogue overflow and malformed count fail closed', async () => {
  const overflow = { ...catalog, results: { bindings: Array.from({ length: 1001 }, () => catalog.results.bindings[0]!) } };
  await assert.rejects(fixture(empty, overflow).service.ask({ question: 'Liste les sinistres' }), code('NLP_CATALOG_LIMIT'));
  await assert.rejects(fixture(empty).service.ask({ question: 'Combien de sinistres ?' }), code('NLP_INVALID_COUNT'));
});
test('existing read-only client executes NLP plans through its injected SELECT transport only', async () => {
  const sent: string[] = [];
  const transport: typeof fetch = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:3030/assurance/query');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    assert.match(new Headers(init?.headers).get('Content-Type') ?? '', /sparql-query/);
    const query = String(init?.body); sent.push(query);
    return new Response(JSON.stringify(query.includes('?entity ?type ?label') ? catalog : { head: { vars: ['claim'] }, results: { bindings: [{ claim: uri('S2026_014') }] } }), { headers: { 'Content-Type': 'application/sparql-results+json' } });
  };
  const client = new SparqlClient('http://127.0.0.1:3030/assurance/query', 5000, transport);
  const result = await new NlpService(client).ask({ question: 'Sinistres évalués par Karim ?' });
  assert.equal(sent.length, 2);
  assert.equal(result.results.results.bindings[0]?.claim?.value, namespace + 'S2026_014');
});
test('controller uses the existing envelope and propagates controlled service failures', async () => {
  let response: unknown;
  const res = { json(body: unknown) { response = body; } } as Response;
  const controller = nlpController(fixture().service);
  await controller.ask({ body: { question: 'Liste les sinistres' } } as Request, res, () => {});
  assert.equal((response as { success: boolean }).success, true);
  await assert.rejects(async () => controller.ask({ body: { question: 'DELETE' } } as Request, res, () => {}), code('NLP_UNSAFE_INPUT'));
  controller.examples({} as Request, res, () => {});
  assert.deepEqual(response, { success: true, data: nlpExamples });
});
test('RDF failures propagate through the existing centralized error architecture', async () => {
  const reader: NlpReader = { async nlpEntities() { throw new AppError(502, 'RDF_UNAVAILABLE', 'mock'); }, async selectNlp() { throw new Error('must not execute'); } };
  await assert.rejects(new NlpService(reader).ask({ question: 'Liste les sinistres' }), code('RDF_UNAVAILABLE'));
});
