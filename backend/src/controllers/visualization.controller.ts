import type { RequestHandler } from 'express';
import type { DashboardService } from '../services/dashboard.service.js';
import type { OntologyGraphService } from '../services/ontology-graph.service.js';
import { graphView } from '../validators/visualization.js';
export function visualizationController(dashboard: DashboardService, graph: OntologyGraphService): Record<'summary' | 'distributions' | 'graph', RequestHandler> {
  return {
    summary: async (_req, res) => { res.json({ success: true, data: await dashboard.summary() }); },
    distributions: async (_req, res) => { res.json({ success: true, data: await dashboard.distributions() }); },
    graph: async (req, res) => { res.json({ success: true, data: await graph.graph(graphView(req.query)) }); },
  };
}
