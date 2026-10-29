import { Router } from 'express';
import { sparqlResults } from '../controllers/sparql.controller.js';
import { readOnlySparql } from '../validators/read-only-sparql.js';
import { queries, type QueryName } from '../sparql/queries.js';
import type { SparqlService } from '../services/sparql.service.js';
import { queryCatalogue } from '../sparql/catalogue.js';

export function sparqlRoutes(service: SparqlService) {
  const router = Router();
  router.use(readOnlySparql);
  router.get('/catalogue', (_req, res) => { res.json({ success: true, data: queryCatalogue() }); });
  for (const name of Object.keys(queries) as QueryName[]) router.get(`/${name}`, sparqlResults(service, name));
  return router;
}
