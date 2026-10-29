import { request } from './api';
import type { DashboardSummary, DashboardDistributions, OntologyGraph, QueryDefinition, SelectResults } from '../types/visualization';
export const visualizationApi = {
  summary: (signal?: AbortSignal) => request<DashboardSummary>('/dashboard/summary', { signal }),
  distributions: (signal?: AbortSignal) => request<DashboardDistributions>('/dashboard/distributions', { signal }),
  graph: (view: 'schema' | 'individuals', signal?: AbortSignal) => request<OntologyGraph>(`/ontology/graph?view=${view}`, { signal }),
  catalogue: (signal?: AbortSignal) => request<QueryDefinition[]>('/sparql/catalogue', { signal }),
  execute: (id: string, signal?: AbortSignal) => request<SelectResults>(`/sparql/${encodeURIComponent(id)}`, { signal }),
};
