import { test } from 'node:test';
import assert from 'node:assert/strict';
import cytoscape from 'cytoscape';
import { visibleGraph, graphElements } from '../src/utils/graph.ts';
import { resultsCsv, resultsJson } from '../src/utils/export-results.ts';
import type { OntologyGraph, SelectResults } from '../src/types/visualization.ts';

const graph: OntologyGraph = { view: 'individuals', source: 'mock', truncated: false,
  nodes: [
    { id: 'http://example.org/#S2026_014', iri: 'http://example.org/#S2026_014', label: 'Même nom', category: 'individual', categories: ['individual'], types: [] },
    { id: 'http://example.org/#Karim', iri: 'http://example.org/#Karim', label: 'Même nom', category: 'individual', categories: ['individual'], types: [] },
    { id: 'http://example.org/#Sinistre', iri: 'http://example.org/#Sinistre', label: 'Sinistre', category: 'class', categories: ['class'], types: [] },
  ],
  edges: [
    { id: 'edge:1', source: 'http://example.org/#S2026_014', target: 'http://example.org/#Karim', label: 'évaluéPar', predicate: 'http://example.org/#évaluéPar' },
    { id: 'edge:2', source: 'http://example.org/#S2026_014', target: 'http://example.org/#Sinistre', label: 'type', predicate: 'http://example.org/#type' },
  ],
};
test('category filtering keeps exactly the edges with both endpoints visible', () => {
  const filtered = visibleGraph(graph, 'individual');
  assert.equal(filtered.nodes.length, 2); assert.equal(filtered.edges.length, 1);
  assert.equal(visibleGraph(graph, 'class').edges.length, 0);
  assert.equal(visibleGraph(graph, 'all').edges.length, 2);
});
test('element conversion preserves stable full IRI IDs and headless Cytoscape can select/destroy safely', () => {
  // In-memory only: no container, browser, renderer, listener socket, or HTTP transport.
  const cy = cytoscape({ headless: true, elements: graphElements(graph), layout: { name: 'preset' } });
  assert.equal(cy.nodes().length, 3); assert.equal(cy.edges().length, 2);
  let events = 0;
  const handler = () => { events++; };
  cy.on('select', 'node', handler);
  cy.getElementById(graph.nodes[0]!.id).select(); assert.equal(events, 1);
  cy.off('select', 'node', handler); cy.destroy(); assert.equal(cy.destroyed(), true);
});
test('CSV escapes quotes, Unicode, commas, line breaks and missing bindings', () => {
  const result: SelectResults = { head: { vars: ['name', 'missing'] }, results: { bindings: [{ name: { type: 'literal', value: 'Évalué, "Karim"\nAutre' } }] } };
  const csv = resultsCsv(result);
  assert.ok(csv.startsWith('\uFEFF"name","missing"\r\n'));
  assert.ok(csv.includes('"Évalué, ""Karim""\nAutre",""'));
});
test('CSV neutralizes spreadsheet formulas without altering the JSON/RDF source', () => {
  for (const value of ['=CMD()', '+1', '-1', '@SUM()', '  =1', '\t=1', '\u0000=1']) {
    const result: SelectResults = { head: { vars: ['value'] }, results: { bindings: [{ value: { type: 'literal', value, datatype: 'http://www.w3.org/2001/XMLSchema#string' } }] } };
    assert.ok(resultsCsv(result).includes(`"'${value}"`));
    assert.deepEqual(JSON.parse(resultsJson(result)), result);
    assert.equal(result.results.bindings[0]?.value?.value, value);
  }
});
