import type { ErrorRequestHandler, RequestHandler } from 'express';
import { SparqlError } from '../sparql/sparql-error.js';
import { AppError } from './app-error.js';

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API route not found.' } });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof SparqlError || error instanceof AppError) {
    if(error instanceof AppError&&error.status===429&&error.retryAfterSeconds!==undefined)res.set('Retry-After',String(error.retryAfterSeconds));
    res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    return;
  }
  const badJson = error instanceof SyntaxError && 'status' in error && error.status === 400;
  const tooLarge = typeof error === 'object' && error !== null && 'status' in error && error.status === 413;
  const status = badJson ? 400 : tooLarge ? 413 : 500;
  if (status === 500) console.error('Unhandled API error. Sensitive details suppressed.');
  res.status(status).json({ success: false, error: {
    code: badJson ? 'INVALID_JSON' : tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR',
    message: badJson ? 'Request body must be valid JSON.' : tooLarge ? 'Request body is too large.' : 'An unexpected server error occurred.',
  } });
};
