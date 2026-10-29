import type { SelectResults } from '../sparql/client.js';
import type { VisualizationReader, GraphNode, GraphCategory, GraphView, OntologyGraph, GraphEdge } from '../types/visualization.js';
import { resourceLabel } from './dashboard.service.js';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export function normalizeGraph(view: GraphView, result: SelectResults): OntologyGraph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const rows = result.results.bindings.slice(0, 2000);
  const labels = new Map<string, { value: string; rank: number }>();
  for (const row of rows) for (const [resource, label] of [['s', 'sLabel'], ['o', 'oLabel']] as const) {
    const term = row[label], uri = row[resource];
    if (uri?.type !== 'uri' || term?.type !== 'literal' || !term.value.trim()) continue;
    const rank = term['xml:lang']?.toLowerCase().startsWith('fr') ? 0 : term['xml:lang'] ? 2 : 1;
    const previous = labels.get(uri.value);
    if (!previous || rank < previous.rank || (rank === previous.rank && term.value < previous.value)) labels.set(uri.value, { value: term.value, rank });
  }
  function node(iri: string, category: GraphCategory) {
    const existing = nodes.get(iri);
    const item = existing ?? { id: iri, iri, label: labels.get(iri)?.value ?? resourceLabel(iri), category, categories: [], types: [] };
    if (!item.categories.includes(category)) item.categories.push(category);
    item.category = item.categories.includes('individual') ? 'individual' : item.categories.includes('property') ? 'property' : 'class';
    nodes.set(iri, item);
    return item;
  }
  // Declarations first so a relationship endpoint never overwrites an actual category.
  for (const row of rows) {
    if (row.s?.type !== 'uri' || row.p?.value !== RDF_TYPE || row.o?.type !== 'uri') continue;
    const type = row.o.value;
    if ([OWL + 'Class', OWL + 'ObjectProperty', OWL + 'NamedIndividual'].includes(type)) {
      const item = node(row.s.value, type === OWL + 'Class' ? 'class' : type === OWL + 'ObjectProperty' ? 'property' : 'individual');
      if (!item.types.includes(type)) item.types.push(type);
    }
  }
  for (const row of rows) {
    if (row.s?.type !== 'uri' || row.p?.type !== 'uri' || row.o?.type !== 'uri') continue;
    const s = row.s.value, p = row.p.value, o = row.o.value;
    if (p === RDF_TYPE && [OWL + 'Class', OWL + 'ObjectProperty', OWL + 'NamedIndividual'].includes(o)) continue;
    if (view === 'schema') {
      if (![RDFS + 'subClassOf', RDFS + 'domain', RDFS + 'range', OWL + 'inverseOf'].includes(p)) continue;
      node(s, p === RDFS + 'subClassOf' ? 'class' : 'property');
      node(o, p === OWL + 'inverseOf' ? 'property' : 'class');
    } else {
      node(s, 'individual');
      node(o, p === RDF_TYPE ? 'class' : 'individual');
      if (p === RDF_TYPE) {
        const item = nodes.get(s)!;
        if (!item.types.includes(o)) item.types.push(o);
      }
    }
    const id = 'edge:' + JSON.stringify([s, p, o]);
    edges.set(id, { id, source: s, target: o, predicate: p, label: resourceLabel(p) });
  }
  return { view, source: 'fuseki-default-graph', nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)), edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)), truncated: result.results.bindings.length > 2000 };
}
export class OntologyGraphService {
  constructor(private readonly reader: VisualizationReader) {}
  async graph(view: GraphView) { return normalizeGraph(view, await this.reader.selectVisualization(view)); }
}
