import { isSelectResults, validateQueryEndpoint, type SelectResults } from '../sparql/client.js';
import { AppError } from '../middleware/app-error.js';
import * as query from '../sparql/claims.queries.js';
import type { ClaimInput, ClaimFilters } from '../types/claims.js';

export interface ClaimsStore {
  list(filters: ClaimFilters, id?: string): Promise<SelectResults>;
  options(): Promise<SelectResults>;
  collision(id: string): Promise<boolean>;
  references(input: ClaimInput): Promise<boolean>;
  damageReference(id:string):Promise<boolean>;
  revision(id: string): Promise<string | null>;
  insert(input: ClaimInput, revision: string): Promise<void>;
  replace(input: ClaimInput, expected: string, revision: string, changeDamage: boolean): Promise<void>;
  remove(id: string, expected: string, revision: string): Promise<void>;
}
export interface StoreConfig {
  queryEndpoint: string; updateEndpoint: string; timeoutMs: number;
  enabled: boolean; username: string; password: string;
}
export function validateUpdateEndpoint(queryEndpoint: string, updateEndpoint: string): string {
  const queryUrl = validateQueryEndpoint(queryEndpoint);
  const expected = queryUrl.replace(/\/query$/, '/update');
  if (new URL(updateEndpoint).href !== expected) throw new Error('Fuseki query/update endpoints must reference the same origin and dataset, with /query and /update paths.');
  return expected;
}
export class ClaimsRepository implements ClaimsStore {
  constructor(private readonly config: StoreConfig, private readonly transport: typeof fetch = fetch) {
    validateUpdateEndpoint(config.queryEndpoint, config.updateEndpoint);
    if (!Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 || config.timeoutMs > 60000) throw new Error('Invalid RDF timeout.');
    if (config.enabled && (!config.username || config.username.includes(':') || !config.password)) throw new Error('Fuseki update credentials are required.');
  }
  private async execute(text: string, write = false): Promise<SelectResults> {
    if (write && !this.config.enabled) throw new AppError(403, 'MUTATIONS_DISABLED', 'Les modifications sont désactivées.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/sparql-results+json',
        'Content-Type': write ? 'application/sparql-update; charset=utf-8' : 'application/sparql-query; charset=utf-8',
      };
      if (write) headers.Authorization = `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
      const response = await this.transport(write ? this.config.updateEndpoint : this.config.queryEndpoint, {
        method: 'POST', redirect: 'error', headers, body: text, signal: controller.signal,
      });
      if (!response.ok) {
        if (write && (response.status === 401 || response.status === 403)) {
          throw new AppError(502, 'FUSEKI_AUTH_FAILED', 'Le service RDF a refusé les identifiants de modification configurés.');
        }
        throw new AppError(502, 'RDF_HTTP_ERROR', 'Le service RDF a refusé l’opération.');
      }
      if (write) { await response.body?.cancel(); return { head: { vars: [] }, results: { bindings: [] } }; }
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!['application/json', 'application/sparql-results+json'].includes(mime ?? '')) throw new AppError(502, 'RDF_INVALID_RESPONSE', 'Format de réponse RDF invalide.');
      let body: unknown;
      try { body = await response.json(); }
      catch (error) { if (controller.signal.aborted) throw error; throw new AppError(502, 'RDF_INVALID_RESPONSE', 'JSON RDF invalide.'); }
      if (!isSelectResults(body)) throw new AppError(502, 'RDF_INVALID_RESPONSE', 'Résultats SELECT invalides.');
      return body;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (write) throw new AppError(504, 'MUTATION_OUTCOME_UNKNOWN', 'Résultat de modification incertain. Rechargez les données avant toute nouvelle tentative.');
      throw new AppError(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'RDF_TIMEOUT' : 'RDF_UNAVAILABLE', 'Le service RDF est indisponible ou le délai est dépassé.');
    } finally { clearTimeout(timer); }
  }
  list(filters: ClaimFilters, id?: string) { return this.execute(query.selectClaims(filters, id)); }
  options() { return this.execute(query.optionsQuery); }
  async collision(id: string) { return (await this.execute(query.collision(id))).results.bindings.length > 0; }
  async references(input: ClaimInput) { return (await this.execute(query.referenceIssues(input))).results.bindings.length > 0; }
  async damageReference(id:string) { return (await this.execute(query.damageReference(id))).results.bindings.length > 0; }
  async revision(id: string) {
    const rows = (await this.execute(query.revisionQuery(id))).results.bindings;
    return rows.length === 1 ? rows[0]?.revision?.value ?? null : null;
  }
  async insert(input: ClaimInput, revision: string) { await this.execute(query.insertClaim(input, revision), true); }
  async replace(input: ClaimInput, expected: string, revision: string, changeDamage: boolean) { await this.execute(query.replaceClaim(input, expected, revision, changeDamage), true); }
  async remove(id: string, expected: string, revision: string) { await this.execute(query.deleteClaim(id, expected, revision), true); }
}
