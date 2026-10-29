import { AppError } from '../middleware/app-error.js';
import type { SparqlTerm, SelectResults } from '../sparql/client.js';
import type { VisualizationReader } from '../types/visualization.js';

export function rdfCount(term: SparqlTerm | undefined): number {
  if (term?.type !== 'literal' || !/^\d+$/.test(term.value) || !Number.isSafeInteger(Number(term.value))
    || (term.datatype !== undefined && !/^http:\/\/www\.w3\.org\/2001\/XMLSchema#(integer|nonNegativeInteger|positiveInteger|int|long|short|byte|unsignedInt|unsignedLong|unsignedShort|unsignedByte)$/.test(term.datatype))) throw new AppError(502, 'RDF_INVALID_COUNT', 'Le service RDF a retourné un comptage invalide ou trop grand.');
  return Number(term.value);
}
export function resourceLabel(iri: string): string {
  const raw = iri.includes('#') ? iri.slice(iri.lastIndexOf('#') + 1) : iri.slice(iri.lastIndexOf('/') + 1);
  try { return decodeURIComponent(raw || iri); } catch { return raw || iri; }
}
function distribution(result: SelectResults, key: string, missing: string) {
  return { items: result.results.bindings.slice(0, 100).map((row) => ({
    label: row[key] ? row[key]!.type === 'uri' ? resourceLabel(row[key]!.value) : row[key]!.value : missing,
    iri: row[key]?.type === 'uri' ? row[key]!.value : undefined,
    value: rdfCount(row.count),
  })), truncated: result.results.bindings.length > 100 };
}
export function damageDistribution(result: SelectResults) {
  let missing = 0, invalid = 0;
  const items: { label: string; iri: string; value: number; exactValue: string }[] = [];
  for (const row of result.results.bindings.slice(0, 100)) {
    if (!row.amount) { missing++; continue; }
    const value = Number(row.amount.value);
    const datatype = row.amount.datatype ?? '';
    if (row.damage?.type !== 'uri' || row.amount.type !== 'literal'
      || !['http://www.w3.org/2001/XMLSchema#decimal', 'http://www.w3.org/2001/XMLSchema#integer'].includes(datatype)
      || !/^\+?(\d+(\.\d*)?|\.\d+)$/.test(row.amount.value)
      || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) { invalid++; continue; }
    items.push({ label: resourceLabel(row.damage.value), iri: row.damage.value, value, exactValue: row.amount.value });
  }
  return { items, missing, invalid, truncated: result.results.bindings.length > 100 };
}
export class DashboardService {
  constructor(private readonly reader: VisualizationReader) {}
  async summary() {
    const result = await this.reader.selectVisualization('summary');
    const row = result.results.bindings[0];
    if (!row || result.results.bindings.length !== 1) throw new AppError(502, 'RDF_INVALID_COUNT', 'Résumé RDF incomplet.');
    return {
      source: 'fuseki-default-graph' as const,
      classes: rdfCount(row.classes), individuals: rdfCount(row.individuals), claims: rdfCount(row.claims),
      contracts: rdfCount(row.contracts), insured: rdfCount(row.insured), experts: rdfCount(row.experts), damages:rdfCount(row.damages), triples: rdfCount(row.triples),
    };
  }
  async distributions() {
    const [statuses, experts, instances, damages] = await Promise.all([
      this.reader.selectVisualization('statuses'), this.reader.selectVisualization('experts'),
      this.reader.selectVisualization('instances'), this.reader.selectVisualization('damages'),
    ]);
    return {
      source: 'fuseki-default-graph' as const,
      statuses: distribution(statuses, 'status', 'Statut non renseigné'),
      experts: distribution(experts, 'expert', 'Aucun expert typé'),
      instances: distribution(instances, 'type', 'Type non renseigné'),
      damages: damageDistribution(damages),
      contractTypes: { available: false as const, reason: 'Le modèle déclare Contrat sans catégories de contrats exploitables. Aucun graphique de types n’est inventé.' },
    };
  }
}
