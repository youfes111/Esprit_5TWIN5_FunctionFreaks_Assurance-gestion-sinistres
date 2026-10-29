import type { RequestHandler } from 'express';
import type { ClaimsService } from '../services/claims.service.js';
import { createInput, patchInput, filters, identifier, revision } from '../validators/claims.js';

export function claimsController(service: ClaimsService, mutationsEnabled: boolean): Record<'list' | 'get' | 'create' | 'update' | 'delete' | 'options', RequestHandler> {
  return {
    list: async (req, res) => { res.json({ success: true, data: await service.list(filters(req.query)) }); },
    get: async (req, res) => {
      const claim = await service.get(identifier(req.params.id));
      if (claim.revision) res.setHeader('ETag', `"${claim.revision}"`);
      res.json({ success: true, data: claim });
    },
    options: async (_req, res) => { res.json({ success: true, data: { ...await service.options(), mutationsEnabled } }); },
    create: async (req, res) => {
      const result = await service.create(createInput(req.body));
      res.location(`/api/claims/${result.id}`).status(201).json({ success: true, data: result });
    },
    update: async (req, res) => { res.json({ success: true, data: await service.update(identifier(req.params.id), patchInput(req.body)) }); },
    delete: async (req, res) => { res.json({ success: true, data: await service.delete(identifier(req.params.id), revision(req.get('if-match')?.replace(/^"(.*)"$/, '$1'))) }); },
  };
}
