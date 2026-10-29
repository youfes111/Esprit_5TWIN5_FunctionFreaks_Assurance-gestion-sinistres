import { randomUUID } from 'node:crypto';
import { AppError } from '../middleware/app-error.js';
import { NS } from '../sparql/claims.queries.js';
import type { SelectResults } from '../sparql/client.js';
import type { ClaimsStore } from './claims.repository.js';
import type { Claim, ClaimFilters, ClaimInput, ClaimPatch } from '../types/claims.js';
import { createInput, identifier } from '../validators/claims.js';

function local(value: string | null): string | null {
  if (value === null) return null;
  if (!value.startsWith(NS)) throw new AppError(409, 'ONTOLOGY_CONFLICT', 'Une relation utilise un espace de noms non pris en charge.');
  return identifier(value.slice(NS.length));
}
export function mapClaims(results: SelectResults): Claim[] {
  const grouped = new Map<string, typeof results.results.bindings>();
  for (const row of results.results.bindings) {
    const claim = row.claim?.value;
    if (!claim) throw new AppError(502, 'RDF_INVALID_RESPONSE', 'Identité du sinistre absente.');
    grouped.set(claim, [...(grouped.get(claim) ?? []), row]);
  }
  return [...grouped].map(([uri, rows]) => {
    function scalar(key: string): string | null {
      const values = [...new Set(rows.flatMap((row) => row[key] ? [row[key]!.value] : []))];
      if (values.length > 1) throw new AppError(409, 'ONTOLOGY_CONFLICT', `Données contradictoires pour ${local(uri)} (${key}). Corrigez le jeu RDF avant modification.`);
      return values[0] ?? null;
    }
    scalar('damage');
    const fraud = scalar('fraudulent');
    if (fraud !== null && !['true', 'false', '1', '0'].includes(fraud)) throw new AppError(409, 'ONTOLOGY_CONFLICT', 'Valeur RDF de fraude invalide.');
    const id = local(uri)!;
    const revision = scalar('revision');
    return {
      id, insuredId: local(scalar('insured')), contractId: local(scalar('contract')),
      declarationDate: scalar('date'), status: scalar('status'), expertId: local(scalar('expert')),
      fraudulent: fraud === null ? null : fraud === 'true' || fraud === '1',
      damageAmount: scalar('amount'), damageId: scalar('damage')?.startsWith(NS) ? local(scalar('damage')) : null, revision, editable: revision !== null && id !== 'S2026_014',
    };
  });
}
export class ClaimsService {
  constructor(private readonly store: ClaimsStore) {}
  async list(filters: ClaimFilters) {
    const claims = mapClaims(await this.store.list(filters));
    return { items: claims.slice(0, filters.pageSize), page: filters.page, pageSize: filters.pageSize, hasMore: claims.length > filters.pageSize };
  }
  async get(id: string) {
    const item = mapClaims(await this.store.list({ page: 1, pageSize: 1 }, identifier(id)))[0];
    if (!item) throw new AppError(404, 'CLAIM_NOT_FOUND', 'Sinistre introuvable.');
    return item;
  }
  async options() {
    const result = { insured: [] as string[], contracts: [] as string[], experts: [] as string[], damages: [] as string[] };
    for (const row of (await this.store.options()).results.bindings) {
      const value = row.individual?.value, type = row.type?.value;
      if (!value || !value.startsWith(NS) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value.slice(NS.length))) continue;
      const key = type === `${NS}Assuré` ? 'insured' : type === `${NS}Contrat` ? 'contracts' : type === `${NS}Expert` ? 'experts' : type === `${NS}Dommage` ? 'damages' : null;
      if (key && !result[key].includes(value.slice(NS.length))) result[key].push(value.slice(NS.length));
    }
    return result;
  }
  private async checkReferences(input: ClaimInput) {
    if (!await this.store.references(input)) throw new AppError(422, 'INVALID_REFERENCES', 'Assuré, contrat ou expert manquant/incompatible : le contrat doit appartenir uniquement à cet assuré et les types Assuré/Expert doivent être cohérents.');
    if (input.damageId && !await this.store.damageReference(input.damageId)) throw new AppError(422, 'INVALID_REFERENCES', 'Le dommage sélectionné est introuvable ou n’est pas un dommage valide.');
  }
  private async confirm(id: string, revision: string) {
    try {
      if (await this.store.revision(id) !== revision) throw new AppError(409, 'WRITE_CONFLICT', 'La condition de modification a échoué ou les données ont changé. Rechargez le sinistre.');
    } catch (error) {
      if (error instanceof AppError && error.code === 'WRITE_CONFLICT') throw error;
      throw new AppError(504, 'MUTATION_OUTCOME_UNKNOWN', 'La modification a été envoyée mais sa confirmation est impossible. Rechargez avant toute nouvelle tentative.');
    }
  }
  async create(input: ClaimInput) {
    input = createInput(input);
    if (input.id === 'S2026_014') throw new AppError(403, 'PROTECTED_CLAIM', 'Cet identifiant est réservé au scénario d’origine.');
    if (await this.store.collision(input.id)) throw new AppError(409, 'DUPLICATE_IDENTIFIER', 'Cet identifiant RDF existe déjà ou a été réservé.');
    await this.checkReferences(input);
    const revision = randomUUID();
    await this.store.insert(input, revision);
    await this.confirm(input.id, revision);
    return { id: input.id, revision };
  }
  async update(id: string, patch: ClaimPatch) {
    const current = await this.get(id);
    if (!current.editable) throw new AppError(403, 'PROTECTED_CLAIM', 'Seuls les sinistres créés par cette application peuvent être modifiés.');
    if (patch.revision !== current.revision) throw new AppError(409, 'WRITE_CONFLICT', 'Cette révision est périmée. Rechargez le sinistre.');
    const { revision: expected, ...changes } = patch;
    const input = createInput({ id, insuredId: current.insuredId, contractId: current.contractId, declarationDate: current.declarationDate, status: current.status, expertId: current.expertId, fraudulent: current.fraudulent, damageAmount: current.damageAmount, damageId:current.damageId, ...changes });
    await this.checkReferences(input);
    const revision = randomUUID();
    await this.store.replace(input, expected, revision, Object.hasOwn(patch, 'damageAmount')||Object.hasOwn(patch,'damageId'));
    await this.confirm(id, revision);
    return { id, revision };
  }
  async delete(id: string, expected: string) {
    const current = await this.get(id);
    if (!current.editable || id === 'S2026_014') throw new AppError(403, 'PROTECTED_CLAIM', 'Suppression interdite pour cet individu d’origine.');
    if (current.revision !== expected) throw new AppError(409, 'WRITE_CONFLICT', 'Cette révision est périmée. Rechargez le sinistre.');
    const revision = randomUUID();
    await this.store.remove(id, expected, revision);
    await this.confirm(id, revision);
    return { id, deleted: true };
  }
}
