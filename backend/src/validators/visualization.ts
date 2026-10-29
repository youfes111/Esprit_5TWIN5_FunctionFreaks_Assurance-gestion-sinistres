import type { RequestHandler } from 'express';
import { AppError } from '../middleware/app-error.js';
import type { GraphView } from '../types/visualization.js';
export function graphView(query: unknown): GraphView {
  if (typeof query !== 'object' || query === null || Array.isArray(query)) throw new AppError(400, 'INVALID_GRAPH_VIEW', 'Vue de graphe invalide.');
  const input = query as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'view') || (input.view !== undefined && (typeof input.view !== 'string' || !['schema', 'individuals'].includes(input.view)))) throw new AppError(400, 'INVALID_GRAPH_VIEW', 'Utilisez uniquement view=schema ou view=individuals.');
  return (input.view ?? 'schema') as GraphView;
}
export const noVisualizationInput: RequestHandler = (req, _res, next) => {
  if (Object.keys(req.query).length || req.body !== undefined) throw new AppError(400, 'UNEXPECTED_INPUT', 'Cet endpoint n’accepte aucun paramètre ni corps de requête.');
  next();
};
