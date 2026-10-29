import type { RequestHandler } from 'express';
import { AppError } from './app-error.js';
import { requirePermission } from '../auth/middleware.js';

export interface WritePolicy { enabled: boolean }
export function authorizeClaims(policy: WritePolicy): RequestHandler {
  return (req, _res, next) => {
    requirePermission('claims:write')(req, _res, () => {
      if (!policy.enabled) throw new AppError(403, 'MUTATIONS_DISABLED', 'Les modifications RDF sont désactivées.');
      next();
    });
  };
}
