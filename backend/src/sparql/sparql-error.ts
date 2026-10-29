export class SparqlError extends Error {
  constructor(
    public readonly code: 'INVALID_SPARQL_OPERATION' | 'SPARQL_TIMEOUT' | 'SPARQL_UNAVAILABLE' | 'SPARQL_HTTP_ERROR' | 'SPARQL_INVALID_RESPONSE',
    message: string,
    public readonly status: number,
  ) { super(message); this.name = 'SparqlError'; }
}
