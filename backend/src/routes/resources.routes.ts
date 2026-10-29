import { Router } from 'express';
import type { ResourceKind } from '../types/resources.js';
import type { ResourcesService } from '../services/resources.service.js';
import { resourcesController } from '../controllers/resources.controller.js';
import { authorizeClaims, type WritePolicy } from '../middleware/claims-auth.js';
export function resourcesRoutes(service:ResourcesService,kind:ResourceKind,policy:WritePolicy){
 const router=Router(),controller=resourcesController(service,kind),authorize=authorizeClaims(policy);
 router.get('/',controller.list);router.get('/options',controller.options);router.get('/:id',controller.get);
 router.post('/',authorize,controller.create);router.patch('/:id',authorize,controller.update);router.delete('/:id',authorize,controller.delete);
 return router;
}
