import { Router } from 'express';
import type { NlpService } from '../services/nlp.service.js';
import { nlpController } from '../controllers/nlp.controller.js';

export function nlpRoutes(service: NlpService) {
  const router = Router();
  const controller = nlpController(service);
  router.get('/examples', controller.examples);
  router.post('/ask', controller.ask);
  return router;
}
