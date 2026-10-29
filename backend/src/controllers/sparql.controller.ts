import type { RequestHandler } from 'express';
import type { SparqlService } from '../services/sparql.service.js';
import type { QueryName } from '../sparql/queries.js';

export function sparqlResults(service: SparqlService, name: QueryName): RequestHandler {
  return async (_req, res) => {
    const results = await service.retrieve(name);
    res.json({ success: true, data: results });
  };
}
