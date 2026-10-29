import { randomUUID } from 'node:crypto';
import { identifier } from '../validators/claims.js';
import type { ClaimInput, ClaimFilters } from '../types/claims.js';

export const NS = 'http://www.example.org/assurance#';
export const META = '<urn:assurance:application:metadata>';
export const prefix = `PREFIX a: <${NS}>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX app: <urn:assurance:application:>`;
export const iri = (id: string) => `<${NS}${identifier(id)}>`;
// JSON string escaping is also valid for these SPARQL double-quoted literals.
export const literal = (value: string) => JSON.stringify(value).replace(/\u007f/g, '\\u007F');
const typed = (value: string, type: string) => `${literal(value)}^^xsd:${type}`;

export function referenceGuard(input: ClaimInput): string {
  const insured = iri(input.insuredId), contract = iri(input.contractId);
  return `${insured} rdf:type a:Assuré . ${contract} rdf:type a:Contrat .
  ${insured} (a:aSouscrit|^a:estSouscritPar) ${contract} .
  FILTER NOT EXISTS { ${insured} rdf:type a:Expert }
  FILTER NOT EXISTS { ${contract} (a:estSouscritPar|^a:aSouscrit) ?otherOwner . FILTER(?otherOwner != ${insured}) }
  FILTER NOT EXISTS { GRAPH ${META} { ${insured} app:deleted true } }
  FILTER NOT EXISTS { GRAPH ${META} { ${contract} app:deleted true } }
  ${input.expertId ? `${iri(input.expertId)} rdf:type a:Expert . FILTER NOT EXISTS { ${iri(input.expertId)} rdf:type a:Assuré } FILTER NOT EXISTS { GRAPH ${META} { ${iri(input.expertId)} app:deleted true } }` : ''}
  ${input.damageId ? `${iri(input.damageId)} rdf:type a:Dommage . FILTER NOT EXISTS { GRAPH ${META} { ${iri(input.damageId)} app:deleted true } }` : ''}`;
}
export function referenceIssues(input: ClaimInput): string {
  return `${prefix} SELECT ?valid WHERE { ${referenceGuard(input)} BIND("yes" AS ?valid) } LIMIT 1`;
}
export function damageReference(id:string):string { return `${prefix} SELECT ?valid WHERE { ${iri(id)} rdf:type a:Dommage . FILTER NOT EXISTS { GRAPH ${META} { ${iri(id)} app:deleted true } } BIND("yes" AS ?valid) } LIMIT 1`; }
export function collision(id: string): string {
  const c = iri(id);
  return `${prefix} SELECT ?found WHERE {
    { ${c} ?p ?o } UNION { ?s ?p ${c} } UNION { GRAPH ?g { ${c} ?p ?o } } UNION { GRAPH ?g { ?s ?p ${c} } }
    BIND("yes" AS ?found)
  } LIMIT 1`;
}
const fields = `OPTIONAL { ?claim (a:estDéclaréPar|^a:déclareSinistre) ?insured }
  OPTIONAL { ?claim a:concerneContrat ?contract }
  OPTIONAL { ?claim a:dateDéclaration ?date }
  OPTIONAL { ?claim a:statutSinistre ?status }
  OPTIONAL { ?claim a:évaluéPar ?expert }
  OPTIONAL { ?claim a:estFrauduleux ?fraudulent }
  OPTIONAL { ?claim a:produitDommage ?damage . FILTER NOT EXISTS { GRAPH ${META} { ?damage app:deleted true } } OPTIONAL { ?damage a:montantEstimé ?amount } }
  OPTIONAL { GRAPH ${META} { ?claim app:revision ?revision . FILTER NOT EXISTS { ?claim app:deleted true } } }`;
export function selectClaims(filter: ClaimFilters, id?: string): string {
  const constraints = [
    id ? `VALUES ?claim { ${iri(id)} }` : '',
    filter.search ? `FILTER(CONTAINS(LCASE(STRAFTER(STR(?claim), ${literal(NS)})), LCASE(${literal(identifier(filter.search))})))` : '',
    filter.status ? `?claim a:statutSinistre ${typed(filter.status, 'string')} .` : '',
    filter.insuredId ? `?claim (a:estDéclaréPar|^a:déclareSinistre) ${iri(filter.insuredId)} .` : '',
    filter.expertId ? `?claim a:évaluéPar ${iri(filter.expertId)} .` : '',
    filter.contractId ? `?claim a:concerneContrat ${iri(filter.contractId)} .` : '',
  ].join('\n');
  return `${prefix}
SELECT DISTINCT ?claim ?insured ?contract ?date ?status ?expert ?fraudulent ?damage ?amount ?revision WHERE {
  { SELECT DISTINCT ?claim WHERE { ?claim rdf:type a:Sinistre . FILTER(STRSTARTS(STR(?claim), ${literal(NS)})) ${constraints} }
    ORDER BY ?claim LIMIT ${id ? 1 : filter.pageSize + 1} OFFSET ${id ? 0 : (filter.page - 1) * filter.pageSize} }
  ${fields}
} ORDER BY ?claim`;
}
export const optionsQuery = `${prefix} SELECT DISTINCT ?individual ?type WHERE {
  VALUES ?type { a:Assuré a:Contrat a:Expert a:Dommage } ?individual rdf:type ?type .
  FILTER(STRSTARTS(STR(?individual), ${literal(NS)}))
  FILTER NOT EXISTS { GRAPH ${META} { ?individual app:deleted true } }
} ORDER BY ?individual ?type LIMIT 1000`;

function claimTriples(input: ClaimInput, damage: string | null): string {
  const c = iri(input.id);
  return `${c} rdf:type owl:NamedIndividual, a:Sinistre ;
  a:concerneContrat ${iri(input.contractId)} ; a:estDéclaréPar ${iri(input.insuredId)} ;
  a:dateDéclaration ${typed(input.declarationDate, 'date')} ;
  a:statutSinistre ${typed(input.status, 'string')} ; a:estFrauduleux ${typed(String(input.fraudulent), 'boolean')} .
  ${iri(input.insuredId)} a:déclareSinistre ${c} .
  ${input.expertId ? `${c} a:évaluéPar ${iri(input.expertId)} .` : ''}
  ${input.damageId ? `${c} a:produitDommage ${iri(input.damageId)} .` : damage ? `${c} a:produitDommage ${damage} . ${damage} rdf:type owl:NamedIndividual, a:Dommage ; a:montantEstimé ${typed(input.damageAmount!, 'decimal')} .` : ''}`;
}
export function insertClaim(input: ClaimInput, revision: string): string {
  const c = iri(input.id);
  const damage = input.damageId||input.damageAmount === null ? null : `<urn:assurance:damage:${randomUUID()}>`;
  return `${prefix} INSERT { ${claimTriples(input, damage)}
    GRAPH ${META} { ${c} app:revision ${literal(revision)} . ${damage ? `${damage} app:owner ${c} .` : ''} }
  } WHERE { ${referenceGuard(input)}
    ${input.id === 'S2026_014' ? 'FILTER(false)' : ''}
    FILTER NOT EXISTS { ${c} ?p ?o } FILTER NOT EXISTS { ?s ?p ${c} }
    FILTER NOT EXISTS { GRAPH ?g { ${c} ?p ?o } }
    FILTER NOT EXISTS { GRAPH ?g { ?s ?p ${c} } }
  }`;
}
const managed = 'a:concerneContrat, a:estDéclaréPar, a:dateDéclaration, a:statutSinistre, a:évaluéPar, a:estFrauduleux, a:produitDommage';
// Only remove orphan damage predicates created by this application; never original/shared nodes.
function cleanup(c: string, revision: string): string {
  return `DELETE { ?damage ?dp ?dv . GRAPH ${META} { ?damage app:owner ${c} } }
  WHERE { GRAPH ${META} { ?damage app:owner ${c} . ${c} app:revision ${literal(revision)} }
    FILTER NOT EXISTS { ?any ?link ?damage }
    FILTER NOT EXISTS { GRAPH ?g { ?any ?link ?damage } }
    FILTER NOT EXISTS { GRAPH ${META} { ?damage app:owner ?otherClaim . FILTER(?otherClaim != ${c}) } }
    ?damage ?dp ?dv . FILTER(?dp = a:montantEstimé || (?dp = rdf:type && ?dv IN (owl:NamedIndividual, a:Dommage)))
  }`;
}
export function replaceClaim(input: ClaimInput, expected: string, revision: string, changeDamage = true): string {
  const c = iri(input.id);
  const damage = !changeDamage || input.damageId || input.damageAmount === null ? null : `<urn:assurance:damage:${randomUUID()}>`;
  const predicates = changeDamage ? managed : managed.replace(', a:produitDommage', '');
  return `${prefix}
  DELETE { ${c} ?p ?o . ?insured a:déclareSinistre ${c} . GRAPH ${META} { ${c} app:revision ${literal(expected)} } }
  INSERT { ${claimTriples(input, damage)} GRAPH ${META} { ${c} app:revision ${literal(revision)} . ${damage ? `${damage} app:owner ${c} .` : ''} } }
  WHERE {
    GRAPH ${META} { ${c} app:revision ${literal(expected)} . FILTER NOT EXISTS { ${c} app:deleted true } }
    ${c} rdf:type a:Sinistre . ${referenceGuard(input)}
    ${input.id === 'S2026_014' ? 'FILTER(false)' : ''}
    OPTIONAL { ${c} ?p ?o . FILTER(?p IN (${predicates})) }
    OPTIONAL { ?insured a:déclareSinistre ${c} }
  }${changeDamage ? `; ${cleanup(c, revision)}` : ''}`;
}
export function deleteClaim(id: string, expected: string, revision: string): string {
  const c = iri(id);
  return `${prefix}
  DELETE { ${c} ?p ?o . ?insured a:déclareSinistre ${c} . GRAPH ${META} { ${c} app:revision ${literal(expected)} } }
  INSERT { GRAPH ${META} { ${c} app:revision ${literal(revision)} ; app:deleted true } }
  WHERE {
    GRAPH ${META} { ${c} app:revision ${literal(expected)} . FILTER NOT EXISTS { ${c} app:deleted true } }
    ${c} rdf:type a:Sinistre .
    ${id === 'S2026_014' ? 'FILTER(false)' : ''}
    OPTIONAL { ${c} ?p ?o . FILTER(?p IN (${managed}) || (?p = rdf:type && ?o IN (owl:NamedIndividual, a:Sinistre))) }
    OPTIONAL { ?insured a:déclareSinistre ${c} }
  }; ${cleanup(c, revision)}`;
}
export function revisionQuery(id: string): string {
  return `${prefix} SELECT ?revision WHERE { GRAPH ${META} { ${iri(id)} app:revision ?revision } } LIMIT 2`;
}
