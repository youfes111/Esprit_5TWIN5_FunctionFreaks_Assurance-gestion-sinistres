import { Router } from 'express';
import { health, ontologySummary } from '../controllers/system.controller.js';
import type { OntologySummary } from '../services/ontology.service.js';
import type { SparqlService } from '../services/sparql.service.js';
import { sparqlRoutes } from './sparql.routes.js';

export function apiRoutes(summary: Readonly<OntologySummary>, sparql: SparqlService) {
  const router = Router();
  router.get('/health', health);
  router.get('/ontology/summary', ontologySummary(summary));
  router.use('/sparql', sparqlRoutes(sparql));
  return router;
}
