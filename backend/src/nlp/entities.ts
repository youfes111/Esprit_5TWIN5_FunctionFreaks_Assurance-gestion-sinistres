import { AppError } from '../middleware/app-error.js';
import type { SelectResults } from '../sparql/client.js';
import { fold, normalize } from './preprocess.js';
import type { Entity, EntityType, RecognizedEntity } from './types.js';

export const namespace = 'http://www.example.org/assurance#';
export function safeEntityId(id: unknown): string {
  if (typeof id !== 'string' || !/^[\p{L}][\p{L}\p{N}_-]{0,95}$/u.test(id)) {
    throw new AppError(400, 'NLP_INVALID_ENTITY', 'Identifiant RDF non pris en charge.');
  }
  return id;
}
const types: EntityType[] = ['Expert', 'Sinistre', 'Contrat', 'Assuré'];
export function catalogFromResults(result: SelectResults): Entity[] {
  if (result.results.bindings.length > 1000) throw new AppError(422, 'NLP_CATALOG_LIMIT', 'Le catalogue dépasse 1000 lignes. Une recherche RDF indexée est nécessaire avant de résoudre les noms sans ambiguïté.');
  const entries = new Map<string, Entity>();
  for (const row of result.results.bindings) {
    if (row.entity?.type !== 'uri' || row.type?.type !== 'uri' || !row.entity.value.startsWith(namespace)) continue;
    const type = types.find((value) => row.type?.value === namespace + value);
    const id = row.entity.value.slice(namespace.length);
    if (!type || !/^[\p{L}][\p{L}\p{N}_-]{0,95}$/u.test(id)) continue;
    const key = `${row.entity.value}|${type}`;
    const item = entries.get(key) ?? { id, iri: row.entity.value, type, aliases: [id] };
    if (row.label?.type === 'literal' && row.label.value.length <= 120 && row.label.value.trim()) item.aliases.push(row.label.value);
    item.aliases = [...new Set(item.aliases)];
    entries.set(key, item);
  }
  return [...entries.values()];
}
export function recognizeEntities(normalized: string, catalog: Entity[]) {
  const text = fold(normalized);
  const candidates = new Map<string, Entity[]>();
  for (const entity of catalog) for (const alias of entity.aliases) {
    const key = fold(normalize(alias));
    if (!key) continue;
    const list = candidates.get(key) ?? [];
    if (!list.some((entry) => entry.iri === entity.iri && entry.type === entity.type)) list.push(entity);
    candidates.set(key, list);
  }
  let remainder = text;
  const entities: RecognizedEntity[] = [];
  for (const [alias, matches] of [...candidates].sort(([a], [b]) => b.length - a.length)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu');
    if (!pattern.test(remainder)) continue;
    if (matches.length !== 1) throw new AppError(422, 'NLP_AMBIGUOUS_ENTITY', `« ${alias} » correspond à plusieurs individus ou types. Utilisez un identifiant unique.`);
    const entity = matches[0]!;
    if (!entities.some((entry) => entry.iri === entity.iri && entry.type === entity.type)) entities.push({ ...entity, matchedText: alias });
    remainder = remainder.replace(pattern, ' ');
  }
  return { entities, remainder };
}
