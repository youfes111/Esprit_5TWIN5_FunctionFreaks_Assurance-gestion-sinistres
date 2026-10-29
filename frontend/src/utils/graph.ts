import type { OntologyGraph, GraphCategory } from '../types/visualization';
export function visibleGraph(graph: OntologyGraph, category: GraphCategory | 'all') {
  const nodes = graph.nodes.filter((node) => category === 'all' || node.categories.includes(category));
  const ids = new Set(nodes.map((node) => node.id));
  return { ...graph, nodes, edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
}
export function graphElements(graph: OntologyGraph) {
  return [...graph.nodes.map((node) => ({ data: { ...node } })), ...graph.edges.map((edge) => ({ data: { ...edge } }))];
}
