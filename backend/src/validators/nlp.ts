import { AppError } from '../middleware/app-error.js';

export function questionInput(body: unknown): string {
  if (typeof body !== 'object' || body === null || Array.isArray(body)
    || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'question')) {
    throw new AppError(400, 'NLP_INVALID_INPUT', 'Envoyez uniquement un objet JSON contenant « question ».');
  }
  const value = (body as Record<string, unknown>).question;
  if (typeof value !== 'string' || value.trim().length < 3 || value.length > 500 || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new AppError(400, 'NLP_INVALID_INPUT', 'La question doit contenir entre 3 et 500 caractères, sans caractères de contrôle.');
  }
  if (/[{}<>;`\\$]/u.test(value) || /https?:\/\//i.test(value)
    || /\b(SELECT|ASK|CONSTRUCT|DESCRIBE|PREFIX|BASE|GRAPH|UPDATE|INSERT|DELETE|SERVICE|LOAD|CLEAR|DROP|CREATE|COPY|MOVE|ADD)\b/i.test(value)) {
    throw new AppError(400, 'NLP_UNSAFE_INPUT', 'Saisissez une question en français, sans code SPARQL, URL ni opération de modification.');
  }
  return value.trim();
}
