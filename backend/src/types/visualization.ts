import type { SelectResults } from '../sparql/client.js';
import type { VisualizationQueryName } from '../sparql/visualization.queries.js';
export interface VisualizationReader { selectVisualization(name: VisualizationQueryName): Promise<SelectResults> }
export type GraphView = 'schema' | 'individuals';
export type GraphCategory = 'class' | 'individual' | 'property';
export interface GraphNode { id: string; iri: string; label: string; category: GraphCategory; categories: GraphCategory[]; types: string[] }
export interface GraphEdge { id: string; source: string; target: string; predicate: string; label: string }
export interface OntologyGraph { view: GraphView; source: 'fuseki-default-graph'; nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }
