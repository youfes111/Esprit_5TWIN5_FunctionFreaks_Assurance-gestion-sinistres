import type { RdfTerm } from './nlp';
export interface SelectResults { head: { vars: string[] }; results: { bindings: Record<string, RdfTerm>[] } }
export interface DashboardSummary { source: string; classes: number; individuals: number; claims: number; contracts: number; insured: number; experts: number; damages:number; triples: number }
export interface ChartItem { label: string; value: number; iri?: string; exactValue?: string }
export interface Distribution { items: ChartItem[]; truncated: boolean }
export interface DashboardDistributions { source: string; statuses: Distribution; experts: Distribution; instances: Distribution; damages: Distribution & { missing: number; invalid: number }; contractTypes: { available: boolean; reason: string } }
export type GraphCategory = 'class' | 'individual' | 'property';
export interface GraphNode { id: string; iri: string; label: string; category: GraphCategory; categories: GraphCategory[]; types: string[] }
export interface GraphEdge { id: string; source: string; target: string; predicate: string; label: string }
export interface OntologyGraph { view: 'schema' | 'individuals'; source: string; nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean }
export interface QueryDefinition { id: string; title: string; description: string; query: string }
