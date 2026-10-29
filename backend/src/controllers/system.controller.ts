import type { RequestHandler } from 'express';
import type { OntologySummary } from '../services/ontology.service.js';

export const health: RequestHandler = (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'assurance-api' } });
};
export function ontologySummary(summary: Readonly<OntologySummary>): RequestHandler {
  return (_req, res) => { res.json({ success: true, data: summary }); };
}
