import type { RequestHandler } from 'express';
import { NlpService, nlpExamples } from '../services/nlp.service.js';

export function nlpController(service: NlpService): { ask: RequestHandler; examples: RequestHandler } {
  return {
    ask: async (req, res) => { res.json({ success: true, data: await service.ask(req.body) }); },
    examples: (_req, res) => { res.json({ success: true, data: nlpExamples }); },
  };
}
