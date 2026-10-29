import { Router } from 'express';
import { claimsController } from '../controllers/claims.controller.js';
import { authorizeClaims, type WritePolicy } from '../middleware/claims-auth.js';
import type { ClaimsService } from '../services/claims.service.js';

export function claimsRoutes(service: ClaimsService, policy: WritePolicy) {
  const router = Router();
  const controller = claimsController(service, policy.enabled);
  const authorize = authorizeClaims(policy);
  router.get('/', controller.list);
  router.get('/options', controller.options);
  router.get('/:id', controller.get);
  router.post('/', authorize, controller.create);
  router.patch('/:id', authorize, controller.update);
  router.delete('/:id', authorize, controller.delete);
  return router;
}
