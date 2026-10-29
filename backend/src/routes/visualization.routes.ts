import { Router } from 'express';
import { visualizationController } from '../controllers/visualization.controller.js';
import type { DashboardService } from '../services/dashboard.service.js';
import type { OntologyGraphService } from '../services/ontology-graph.service.js';
import { noVisualizationInput } from '../validators/visualization.js';
export function visualizationRoutes(dashboard: DashboardService, graph: OntologyGraphService) {
  const router = Router(); const controller = visualizationController(dashboard, graph);
  router.get('/dashboard/summary', noVisualizationInput, controller.summary);
  router.get('/dashboard/distributions', noVisualizationInput, controller.distributions);
  router.get('/ontology/graph', controller.graph);
  return router;
}
