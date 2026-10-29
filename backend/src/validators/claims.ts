import { AppError } from '../middleware/app-error.js';
import { claimStatuses, type ClaimInput, type ClaimPatch, type ClaimFilters } from '../types/claims.js';

export function invalid(message: string): never { throw new AppError(400, 'VALIDATION_ERROR', message); }
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value)) invalid('Identifiant invalide : lettre initiale, lettres ASCII, chiffres ou underscore, 64 caractères maximum.');
  return value;
}
export function revision(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) invalid('Révision manquante ou invalide. Rechargez le sinistre.');
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid('Un objet JSON est requis.');
  return value as Record<string, unknown>;
}
export function amount(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value)) invalid('Montant non négatif requis, sous forme de chaîne décimale (12 chiffres et 2 décimales maximum).');
  return value.includes('.') ? value : `${value}.0`;
}
export function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) invalid('Date ISO YYYY-MM-DD requise.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid('Date du calendrier invalide.');
  return value;
}
function field(key: string, value: unknown): unknown {
  switch (key) {
    case 'id': case 'insuredId': case 'contractId': return identifier(value);
    case 'expertId': case 'damageId': return value === null ? null : identifier(value);
    case 'damageAmount': return amount(value);
    case 'declarationDate': return date(value);
    case 'status': if (!claimStatuses.includes(value as ClaimInput['status'])) invalid('Statut non reconnu.'); return value;
    case 'fraudulent': if (typeof value !== 'boolean') invalid('Indicateur de fraude booléen requis.'); return value;
    case 'revision': return revision(value);
    default: return invalid(`Champ non autorisé : ${key}.`);
  }
}
export function createInput(value: unknown): ClaimInput {
  const input = object(value);
  const result: Record<string, unknown> = { expertId: null, damageAmount: null };
  for (const [key, val] of Object.entries(input)) {
    if (key === 'revision') invalid('Révision interdite lors de la création.');
    result[key] = field(key, val);
  }
  for (const key of ['id', 'insuredId', 'contractId', 'declarationDate', 'status', 'fraudulent']) {
    if (!(key in input)) invalid(`Champ requis : ${key}.`);
  }
  return result as unknown as ClaimInput;
}
export function patchInput(value: unknown): ClaimPatch {
  const input = object(value);
  revision(input.revision);
  if (Object.keys(input).length < 2) invalid('Aucune modification fournie.');
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (key === 'id') invalid('L’identité RDF ne peut pas être modifiée.');
    result[key] = field(key, val);
  }
  return result as ClaimPatch;
}
export function filters(value: unknown): ClaimFilters {
  const input = object(value);
  const output: ClaimFilters = { page: 1, pageSize: 20 };
  for (const [key, val] of Object.entries(input)) {
    if (key === 'page' || key === 'pageSize') {
      if (typeof val !== 'string' || !/^[1-9]\d{0,5}$/.test(val)) invalid('Pagination invalide.');
      const number = Number(val);
      if (number > (key === 'pageSize' ? 100 : 10000)) invalid('Pagination hors limites.');
      output[key] = number;
    } else if (key === 'status') output.status = field('status', val) as string;
    else if (key === 'search') output.search = identifier(val);
    else if (key === 'insuredId' || key === 'expertId' || key === 'contractId') output[key] = identifier(val);
    else invalid(`Filtre non autorisé : ${key}.`);
  }
  return output;
}
