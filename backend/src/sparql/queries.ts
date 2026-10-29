const prefixes = `PREFIX assurance: <http://www.example.org/assurance#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX app: <urn:assurance:application:>`;

// Closed, server-owned SELECT templates. Never interpolate HTTP input here.
export const queries = Object.freeze({
  classes: `${prefixes}
SELECT DISTINCT ?class ?label WHERE {
  ?class rdf:type owl:Class . FILTER(isIRI(?class))
  OPTIONAL { ?class rdfs:label ?label }
} ORDER BY ?class ?label LIMIT 1000`,
  individuals: `${prefixes}
SELECT DISTINCT ?individual ?type WHERE {
  ?individual rdf:type owl:NamedIndividual . FILTER(isIRI(?individual))
  FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?individual app:deleted true } }
  OPTIONAL { ?individual rdf:type ?type . FILTER(?type != owl:NamedIndividual) }
} ORDER BY ?individual ?type LIMIT 1000`,
  contracts: `${prefixes}
SELECT DISTINCT ?contract ?number ?insured WHERE {
  ?contract rdf:type assurance:Contrat .
  FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?contract app:deleted true } }
  OPTIONAL { ?contract assurance:numéroContrat ?number }
  OPTIONAL { ?contract (assurance:estSouscritPar|^assurance:aSouscrit) ?insured }
} ORDER BY ?contract ?number ?insured LIMIT 1000`,
  insured: `${prefixes}
SELECT DISTINCT ?insured ?contract ?claim WHERE {
  ?insured rdf:type assurance:Assuré .
  FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?insured app:deleted true } }
  OPTIONAL { ?insured (assurance:aSouscrit|^assurance:estSouscritPar) ?contract }
  OPTIONAL { ?insured (assurance:déclareSinistre|^assurance:estDéclaréPar) ?claim }
} ORDER BY ?insured ?contract ?claim LIMIT 1000`,
  claims: `${prefixes}
SELECT DISTINCT ?claim ?contract ?date ?status ?fraudulent WHERE {
  ?claim rdf:type assurance:Sinistre .
  OPTIONAL { ?claim assurance:concerneContrat ?contract }
  OPTIONAL { ?claim assurance:dateDéclaration ?date }
  OPTIONAL { ?claim assurance:statutSinistre ?status }
  OPTIONAL { ?claim assurance:estFrauduleux ?fraudulent }
} ORDER BY ?claim ?contract ?date ?status ?fraudulent LIMIT 1000`,
  'claim-experts': `${prefixes}
SELECT DISTINCT ?claim ?expert WHERE {
  ?claim rdf:type assurance:Sinistre ; assurance:évaluéPar ?expert .
  ?expert rdf:type assurance:Expert .
} ORDER BY ?claim ?expert LIMIT 1000`,
  'example-karim': `${prefixes}
SELECT DISTINCT ?claim ?expert ?contract ?status WHERE {
  VALUES ?claim { assurance:S2026_014 }
  VALUES ?expert { assurance:Karim }
  ?claim rdf:type assurance:Sinistre ; assurance:évaluéPar ?expert .
  ?expert rdf:type assurance:Expert .
  OPTIONAL { ?claim assurance:concerneContrat ?contract }
  OPTIONAL { ?claim assurance:statutSinistre ?status }
} ORDER BY ?claim ?expert ?contract ?status LIMIT 1000`,
});

export type QueryName = keyof typeof queries;
export function isQueryName(value: unknown): value is QueryName {
  return typeof value === 'string' && Object.hasOwn(queries, value);
}
