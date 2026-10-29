const prefix = `PREFIX a: <http://www.example.org/assurance#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>`;
const countType = (name: string, type: string, individual = false) => `{ SELECT (COUNT(DISTINCT ?s) AS ?${name}) WHERE { ?s rdf:type ${type} . FILTER(isIRI(?s)) ${individual ? '?s rdf:type owl:NamedIndividual .' : ''} FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?s <urn:assurance:application:deleted> true } } } }`;
const schemaPatterns = `
  { ?s rdf:type owl:Class . FILTER(isIRI(?s)) BIND(rdf:type AS ?p) BIND(owl:Class AS ?o) }
  UNION { ?s rdf:type owl:ObjectProperty . FILTER(isIRI(?s)) BIND(rdf:type AS ?p) BIND(owl:ObjectProperty AS ?o) }
  UNION { ?s rdf:type owl:Class ; rdfs:subClassOf ?o . FILTER(isIRI(?s) && isIRI(?o)) BIND(rdfs:subClassOf AS ?p) }
  UNION { ?s rdf:type owl:ObjectProperty ; ?p ?o . VALUES ?p { rdfs:domain rdfs:range owl:inverseOf } FILTER(isIRI(?s) && isIRI(?o)) }
`;
const individualPatterns = `
  { ?s rdf:type owl:NamedIndividual . FILTER(isIRI(?s)) BIND(rdf:type AS ?p) BIND(owl:NamedIndividual AS ?o) }
  UNION { ?s rdf:type owl:NamedIndividual ; rdf:type ?o . FILTER(isIRI(?s) && isIRI(?o) && ?o != owl:NamedIndividual) BIND(rdf:type AS ?p) }
  UNION { ?p rdf:type owl:ObjectProperty . ?s rdf:type owl:NamedIndividual ; ?p ?o . ?o rdf:type owl:NamedIndividual . FILTER(isIRI(?s) && isIRI(?o)) }
  FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?s <urn:assurance:application:deleted> true } }
  FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?o <urn:assurance:application:deleted> true } }
`;
const graph = (patterns: string) => `${prefix}
SELECT DISTINCT ?s ?p ?o ?sLabel ?oLabel WHERE {
  { ${patterns} }
  OPTIONAL { ?s rdfs:label ?sLabel } OPTIONAL { ?o rdfs:label ?oLabel }
} ORDER BY ?s ?p ?o ?sLabel ?oLabel LIMIT 2001`;

// Separate from the seven Phase 1 routes; every operation is a fixed SELECT.
export const visualizationQueries = Object.freeze({
  summary: `${prefix} SELECT ?classes ?individuals ?claims ?contracts ?insured ?experts ?damages ?triples WHERE {
    ${countType('classes', 'owl:Class')}
    ${countType('individuals', 'owl:NamedIndividual')}
    ${countType('claims', 'a:Sinistre', true)}
    ${countType('contracts', 'a:Contrat', true)}
    ${countType('insured', 'a:Assuré', true)}
    ${countType('experts', 'a:Expert', true)}
    ${countType('damages', 'a:Dommage', true)}
    { SELECT (COUNT(*) AS ?triples) WHERE { ?s ?p ?o } }
  } LIMIT 1`,
  statuses: `${prefix} SELECT ?status (COUNT(DISTINCT ?claim) AS ?count) WHERE {
    ?claim rdf:type owl:NamedIndividual, a:Sinistre . FILTER(isIRI(?claim)) OPTIONAL { ?claim a:statutSinistre ?status }
  } GROUP BY ?status ORDER BY DESC(?count) ?status LIMIT 101`,
  experts: `${prefix} SELECT ?expert (COUNT(DISTINCT ?claim) AS ?count) WHERE {
    ?claim rdf:type owl:NamedIndividual, a:Sinistre . FILTER(isIRI(?claim))
    OPTIONAL { ?claim a:évaluéPar ?expert . ?expert rdf:type owl:NamedIndividual, a:Expert FILTER(isIRI(?expert)) }
  } GROUP BY ?expert ORDER BY DESC(?count) ?expert LIMIT 101`,
  instances: `${prefix} SELECT ?type (COUNT(DISTINCT ?individual) AS ?count) WHERE {
    VALUES ?type { a:Sinistre a:Contrat a:Assuré a:Expert a:Dommage }
    OPTIONAL { ?individual rdf:type owl:NamedIndividual ; rdf:type ?type FILTER(isIRI(?individual)) FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?individual <urn:assurance:application:deleted> true } } }
  } GROUP BY ?type ORDER BY ?type LIMIT 10`,
  damages: `${prefix} SELECT DISTINCT ?damage ?amount WHERE {
    ?damage rdf:type owl:NamedIndividual, a:Dommage . FILTER(isIRI(?damage)) OPTIONAL { ?damage a:montantEstimé ?amount }
    FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?damage <urn:assurance:application:deleted> true } }
  } ORDER BY ?damage ?amount LIMIT 101`,
  schema: graph(schemaPatterns),
  individuals: graph(individualPatterns),
});
export type VisualizationQueryName = keyof typeof visualizationQueries;
export const isVisualizationQueryName = (value: unknown): value is VisualizationQueryName => typeof value === 'string' && Object.hasOwn(visualizationQueries, value);
