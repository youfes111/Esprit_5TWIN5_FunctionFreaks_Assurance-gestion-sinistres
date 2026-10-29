import type { RequestHandler } from 'express';

export const readOnlySparql: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'SPARQL resources only support GET.' } });
    return;
  }
  if (Object.keys(req.query).length > 0 || req.body !== undefined
    || req.headers['transfer-encoding'] !== undefined || Number(req.headers['content-length'] ?? 0) > 0) {
    res.status(400).json({ success: false, error: { code: 'SPARQL_INPUT_NOT_ALLOWED', message: 'Query parameters and request bodies are not accepted. Use a registered resource path.' } });
    return;
  }
  next();
};
