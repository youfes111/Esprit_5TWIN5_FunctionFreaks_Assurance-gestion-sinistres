import { isQueryName, queries, type QueryName } from './queries.js';
import { SparqlError } from './sparql-error.js';
import { buildNlpQuery, nlpEntityQuery } from '../nlp/queries.js';
import type { QueryPlan } from '../nlp/types.js';
import { visualizationQueries, isVisualizationQueryName, type VisualizationQueryName } from './visualization.queries.js';

export interface SparqlTerm {
  type: 'uri' | 'bnode' | 'literal';
  value: string;
  datatype?: string;
  'xml:lang'?: string;
}
export interface SelectResults {
  head: { vars: string[] };
  results: { bindings: Record<string, SparqlTerm>[] };
}
export interface SparqlReader { select(name: QueryName): Promise<SelectResults> }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isSelectResults(value: unknown): value is SelectResults {
  if (!record(value) || !record(value.head) || !Array.isArray(value.head.vars)
    || !value.head.vars.every((entry) => typeof entry === 'string')
    || !record(value.results) || !Array.isArray(value.results.bindings)) return false;
  return value.results.bindings.every((row: unknown) => record(row) && Object.entries(row).every(([key, term]) =>
    (value.head as SelectResults['head']).vars.includes(key) && record(term)
    && ['uri', 'bnode', 'literal'].includes(String(term.type)) && typeof term.value === 'string'
    && (term.datatype === undefined || typeof term.datatype === 'string')
    && (term['xml:lang'] === undefined || typeof term['xml:lang'] === 'string')));
}

export function validateQueryEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || !url.pathname.endsWith('/query')) {
    throw new Error('FUSEKI_QUERY_ENDPOINT must be an HTTP(S) /query URL without credentials, query parameters, or fragments.');
  }
  return url.href;
}

export class SparqlClient implements SparqlReader {
  private readonly endpoint: string;
  constructor(endpoint: string, private readonly timeoutMs = 5000, private readonly transport: typeof fetch = fetch) {
    this.endpoint = validateQueryEndpoint(endpoint);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) {
      throw new Error('SPARQL timeout must be an integer between 1 and 60000 ms.');
    }
  }

  async select(name: QueryName): Promise<SelectResults> {
    // Runtime guard also protects JavaScript callers that bypass TypeScript.
    if (!isQueryName(name)) throw new SparqlError('INVALID_SPARQL_OPERATION', 'Only registered read-only queries are allowed.', 400);
    return this.executeSelect(queries[name]);
  }

  nlpEntities(): Promise<SelectResults> { return this.executeSelect(nlpEntityQuery); }
  selectNlp(plan: QueryPlan): Promise<SelectResults> { return this.executeSelect(buildNlpQuery(plan)); }
  async selectVisualization(name: VisualizationQueryName): Promise<SelectResults> {
    if (!isVisualizationQueryName(name)) throw new SparqlError('INVALID_SPARQL_OPERATION', 'Only registered visualization SELECTs are allowed.', 400);
    return this.executeSelect(visualizationQueries[name]);
  }

  private async executeSelect(query: string): Promise<SelectResults> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.transport(this.endpoint, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/sparql-query; charset=utf-8' },
        body: query,
      });
      if (!response.ok) throw new SparqlError('SPARQL_HTTP_ERROR', 'The RDF query service rejected the request.', 502);
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (mime !== 'application/sparql-results+json' && mime !== 'application/json') {
        throw new SparqlError('SPARQL_INVALID_RESPONSE', 'The RDF query service returned an unsupported response format.', 502);
      }
      let body: unknown;
      try { body = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        throw new SparqlError('SPARQL_INVALID_RESPONSE', 'The RDF query service returned invalid JSON.', 502);
      }
      if (!isSelectResults(body)) throw new SparqlError('SPARQL_INVALID_RESPONSE', 'The RDF query service returned invalid SELECT results.', 502);
      return body;
    } catch (error) {
      if (controller.signal.aborted) throw new SparqlError('SPARQL_TIMEOUT', 'The RDF query service timed out.', 504);
      if (error instanceof SparqlError) throw error;
      throw new SparqlError('SPARQL_UNAVAILABLE', 'The RDF query service is unavailable.', 502);
    } finally { clearTimeout(timer); }
  }
}
