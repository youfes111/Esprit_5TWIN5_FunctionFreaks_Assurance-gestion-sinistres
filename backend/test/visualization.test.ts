import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import type { Quad } from '@rdfjs/types';
import { DashboardService, rdfCount, damageDistribution } from '../src/services/dashboard.service.js';
import { normalizeGraph, OntologyGraphService } from '../src/services/ontology-graph.service.js';
import { visualizationQueries } from '../src/sparql/visualization.queries.js';
import { queryCatalogue } from '../src/sparql/catalogue.js';
import { queries } from '../src/sparql/queries.js';
import { SparqlClient, type SelectResults, type SparqlTerm } from '../src/sparql/client.js';
import { graphView, noVisualizationInput } from '../src/validators/visualization.js';
import { visualizationController } from '../src/controllers/visualization.controller.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { SparqlError } from '../src/sparql/sparql-error.js';
import type { VisualizationQueryName } from '../src/sparql/visualization.queries.js';
import type { VisualizationReader } from '../src/types/visualization.js';
import type { Request, Response } from 'express';

const ns = 'http://www.example.org/assurance#';
const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const owl = 'http://www.w3.org/2002/07/owl#';
const rdfs = 'http://www.w3.org/2000/01/rdf-schema#';
const xsd = 'http://www.w3.org/2001/XMLSchema#';
const uri = (value: string): SparqlTerm => ({ type: 'uri', value });
const lit = (value: string, datatype = xsd + 'integer'): SparqlTerm => ({ type: 'literal', value, datatype });
const result = (bindings: Record<string, SparqlTerm>[]): SelectResults => ({ head: { vars: [...new Set(bindings.flatMap((row) => Object.keys(row)))] }, results: { bindings } });
const triple = (s: string, p: string, o: string) => ({ s: uri(s), p: uri(p), o: uri(o) });
function reader(values: Partial<Record<VisualizationQueryName, SelectResults>>): VisualizationReader {
  return { async selectVisualization(name) { return values[name] ?? result([]); } };
}

test('dashboard counts distinguish declared classes, named individuals and typed records', async () => {
  const summary = await new DashboardService(reader({ summary: result([{ classes: lit('20'), individuals: lit('5'), claims: lit('1'), contracts: lit('1'), insured: lit('1'), experts: lit('1'), damages:lit('1'), triples: lit('112') }]) })).summary();
  assert.equal(summary.classes, 20); assert.equal(summary.individuals, 5); assert.equal(summary.claims, 1); assert.equal(summary.triples, 112);
  assert.match(visualizationQueries.summary, /owl:Class/);
  assert.match(visualizationQueries.summary, /owl:NamedIndividual/);
  assert.match(visualizationQueries.summary, /a:Sinistre[\s\S]*owl:NamedIndividual/);
});
test('empty aggregate values remain actual zeros; missing or invalid counts are not fabricated', async () => {
  const zero = Object.fromEntries(['classes', 'individuals', 'claims', 'contracts', 'insured', 'experts','damages', 'triples'].map((key) => [key, lit('0')]));
  assert.equal((await new DashboardService(reader({ summary: result([zero]) })).summary()).individuals, 0);
  await assert.rejects(new DashboardService(reader({})).summary());
  for (const term of [undefined, lit('-1'), lit('1.5'), lit('9007199254740993'), lit('1', xsd + 'boolean')]) assert.throws(() => rdfCount(term));
});
test('distribution mapping preserves missing values as explicit buckets, without invented records', async () => {
  const data = await new DashboardService(reader({
    statuses: result([{ status: lit('En cours', xsd + 'string'), count: lit('1') }, { count: lit('2') }]),
    experts: result([{ expert: uri(ns + 'Karim'), count: lit('1') }, { count: lit('1') }]),
    instances: result([{ type: uri(ns + 'Sinistre'), count: lit('1') }]),
  })).distributions();
  assert.deepEqual(data.statuses.items.map((item) => item.value), [1, 2]);
  assert.equal(data.statuses.items[1]?.label, 'Statut non renseigné');
  assert.equal(data.experts.items[0]?.label, 'Karim'); assert.equal(data.experts.items[1]?.label, 'Aucun expert typé');
  assert.equal(data.contractTypes.available, false); assert.deepEqual(data.damages.items, []);
});
test('damage chart conversion preserves exact decimals and omits missing or invalid amounts', () => {
  const values = damageDistribution(result([
    { damage: uri(ns + 'PareChoc'), amount: lit('1450.00', xsd + 'decimal') },
    { damage: uri(ns + 'NoAmount') }, { damage: uri(ns + 'Bad'), amount: lit('NaN', xsd + 'decimal') },
    { damage: uri(ns + 'Negative'), amount: lit('-1.5', xsd + 'decimal') },
    { damage: uri(ns + 'String'), amount: lit('42', xsd + 'string') },
    { damage: uri(ns + 'Zero'), amount: lit('0.0', xsd + 'decimal') },
  ]));
  assert.equal(values.items[0]?.value, 1450); assert.equal(values.items[0]?.exactValue, '1450.00');
  assert.equal(values.items[1]?.value, 0); assert.equal(values.missing, 1); assert.equal(values.invalid, 3);
});
test('chart limits report truncation rather than silently claiming complete data', async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ status: lit(String(index), xsd + 'string'), count: lit('1') }));
  const values = await new DashboardService(reader({ statuses: result(rows) })).distributions();
  assert.equal(values.statuses.items.length, 100); assert.equal(values.statuses.truncated, true);
});
test('schema graph represents named hierarchy and object-property domain/range/inverse relationships', () => {
  const data = result([
    triple(ns + 'Acteur', rdf + 'type', owl + 'Class'), triple(ns + 'Expert', rdf + 'type', owl + 'Class'),
    triple(ns + 'Expert', rdfs + 'subClassOf', ns + 'Acteur'),
    triple(ns + 'évaluéPar', rdf + 'type', owl + 'ObjectProperty'),
    triple(ns + 'évaluéPar', rdfs + 'range', ns + 'Expert'),
    triple(ns + 'évaluéPar', rdfs + 'domain', ns + 'Sinistre'),
  ]);
  const graph = normalizeGraph('schema', data);
  assert.equal(graph.nodes.find((node) => node.id === ns + 'évaluéPar')?.category, 'property');
  assert.equal(graph.edges.length, 3);
  assert.ok(graph.edges.some((edge) => edge.predicate === rdfs + 'subClassOf'));
  assert.ok(!graph.nodes.some((node) => node.id === owl + 'Class'));
});
test('graph node and edge IDs are stable and collision-free despite duplicate labels/rows', () => {
  const edge = { ...triple(ns + 'One', rdfs + 'subClassOf', ns + 'Two'), sLabel: lit('Même nom', xsd + 'string'), oLabel: lit('Même nom', xsd + 'string') };
  const a = normalizeGraph('schema', result([edge, edge]));
  const b = normalizeGraph('schema', result([edge]));
  assert.equal(a.nodes.length, 2); assert.equal(a.edges.length, 1);
  assert.notEqual(a.nodes[0]?.id, a.nodes[1]?.id);
  assert.equal(a.edges[0]?.id, b.edges[0]?.id);
});
test('individual graph retains RDF types and the S2026_014 → évaluéPar → Karim regression', async () => {
  const rows = [triple(ns + 'S2026_014', rdf + 'type', owl + 'NamedIndividual'), triple(ns + 'S2026_014', rdf + 'type', ns + 'Sinistre'), triple(ns + 'Karim', rdf + 'type', owl + 'NamedIndividual'), triple(ns + 'Karim', rdf + 'type', ns + 'Expert'), triple(ns + 'S2026_014', ns + 'évaluéPar', ns + 'Karim')];
  const graph = await new OntologyGraphService(reader({ individuals: result(rows) })).graph('individuals');
  assert.ok(graph.edges.some((edge) => edge.source === ns + 'S2026_014' && edge.target === ns + 'Karim' && edge.label === 'évaluéPar'));
  assert.ok(graph.nodes.find((node) => node.id === ns + 'Karim')?.types.includes(ns + 'Expert'));
  assert.match(visualizationQueries.individuals, /\?p rdf:type owl:ObjectProperty/);
});
test('graph limits are explicit and no dangling edges are emitted', () => {
  const rows = Array.from({ length: 2001 }, (_, index) => triple(ns + 'Child' + index, rdfs + 'subClassOf', ns + 'Root'));
  const graph = normalizeGraph('schema', result(rows));
  assert.equal(graph.truncated, true); assert.equal(graph.edges.length, 2000);
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.ok(graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
});
test('view and input validation refuse arbitrary query fragments and arrays', () => {
  assert.equal(graphView({}), 'schema'); assert.equal(graphView({ view: 'individuals' }), 'individuals');
  for (const query of [{ view: ['schema'] }, { view: 'SERVICE' }, { query: 'SELECT {}' }]) assert.throws(() => graphView(query));
  assert.throws(() => noVisualizationInput({ query: { raw: 'DELETE {}' } } as unknown as Request, {} as Response, () => {}));
});
test('query catalogue exactly reuses the seven approved Phase 1 definitions', () => {
  const catalogue = queryCatalogue(); assert.equal(catalogue.length, 7);
  assert.deepEqual(catalogue.map((entry) => entry.id), Object.keys(queries));
  for (const item of catalogue) { assert.equal(item.query, queries[item.id]); assert.ok(item.description); assert.match(item.query, /SELECT/); }
});
test('visualization transport is query-only and rejects unknown operations before HTTP mocks', async () => {
  const calls: string[] = [];
  const transport: typeof fetch = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:3030/assurance/query');
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    assert.match(new Headers(init?.headers).get('Content-Type') ?? '', /sparql-query/);
    calls.push(String(init?.body));
    return new Response(JSON.stringify(result([])), { headers: { 'Content-Type': 'application/sparql-results+json' } });
  };
  const client = new SparqlClient('http://127.0.0.1:3030/assurance/query', 5000, transport);
  for (const name of Object.keys(visualizationQueries) as VisualizationQueryName[]) await client.selectVisualization(name);
  await assert.rejects(client.selectVisualization('DELETE' as VisualizationQueryName));
  assert.equal(calls.length, 7);
  for (const query of calls) { assert.match(query, /SELECT/); assert.doesNotMatch(query, /\b(INSERT|DELETE|UPDATE|SERVICE|LOAD|DROP|CLEAR)\b/i); assert.match(query, /LIMIT/); }
});
test('upstream error/timeout remain controlled through the centralized handler', async () => {
  const transport: typeof fetch = (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('mock timeout')), { once: true }); });
  const client = new SparqlClient('http://127.0.0.1:3030/assurance/query', 5, transport);
  await assert.rejects(client.selectVisualization('summary'), (error: unknown) => error instanceof SparqlError && error.status === 504);
  let status = 0; let body: unknown;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; } } as Response;
  errorHandler(new SparqlError('SPARQL_HTTP_ERROR', 'Controlled error', 502), {} as Request, response, () => {});
  assert.equal(status, 502); assert.deepEqual(body, { success: false, error: { code: 'SPARQL_HTTP_ERROR', message: 'Controlled error' } });
  const controller = visualizationController(new DashboardService(reader({})), new OntologyGraphService(reader({})));
  await assert.rejects(async () => controller.summary({} as Request, response, () => {}));
});
test('offline parsing confirms the source graph has 112 triples, 20 declared classes, 5 named individuals and the original expert edge', async () => {
  const xml = await readFile(new URL('../../ontology/assurance.owl', import.meta.url), 'utf8');
  const parser = new RdfXmlParser({ baseIRI: 'http://www.example.org/assurance' });
  const quads: Quad[] = [];
  const done = new Promise<void>((resolve, reject) => { parser.on('data', (quad: Quad) => quads.push(quad)); parser.on('end', resolve); parser.on('error', reject); });
  parser.end(xml); await done;
  assert.equal(quads.length, 112);
  const classes = new Set(quads.filter((quad) => quad.predicate.value === rdf + 'type' && quad.object.value === owl + 'Class').map((quad) => quad.subject.value));
  const individuals = new Set(quads.filter((quad) => quad.predicate.value === rdf + 'type' && quad.object.value === owl + 'NamedIndividual').map((quad) => quad.subject.value));
  assert.equal(classes.size, 20); assert.equal(individuals.size, 5);
  const bindings = quads.filter((quad) => quad.subject.termType === 'NamedNode' && quad.object.termType === 'NamedNode' && individuals.has(quad.subject.value) && (quad.predicate.value === rdf + 'type' || individuals.has(quad.object.value))).map((quad) => triple(quad.subject.value, quad.predicate.value, quad.object.value));
  assert.ok(normalizeGraph('individuals', result(bindings)).edges.some((edge) => edge.source === ns + 'S2026_014' && edge.target === ns + 'Karim' && edge.predicate === ns + 'évaluéPar'));
});
