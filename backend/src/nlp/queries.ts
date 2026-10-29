import { AppError } from "../middleware/app-error.js";
import { namespace, safeEntityId } from "./entities.js";
import { intents, type QueryPlan, type EntityType } from "./types.js";

export const resultLimit = 100;
const prefixes = `PREFIX assurance: <${namespace}>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`;
export const nlpEntityQuery = `${prefixes}
SELECT DISTINCT ?entity ?type ?label WHERE {
  VALUES ?type { assurance:Expert assurance:Sinistre assurance:Contrat assurance:Assuré }
  ?entity rdf:type ?type . FILTER(isIRI(?entity))
  FILTER(STRSTARTS(STR(?entity), "${namespace}"))
  FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?entity <urn:assurance:application:deleted> true } }
  OPTIONAL { ?entity rdfs:label ?label }
} ORDER BY ?entity ?type ?label LIMIT 1001`;
const entityTypes: Partial<Record<QueryPlan["intent"], EntityType>> = {
  claims_by_expert: "Expert",
  claim_details: "Sinistre",
  claims_by_contract: "Contrat",
  claims_by_insured: "Assuré",
};
export function buildNlpQuery(plan: QueryPlan): string {
  if (
    !plan ||
    !intents.includes(plan.intent) ||
    Object.keys(plan).some((key) => !["intent", "entity"].includes(key))
  )
    throw new AppError(
      400,
      "NLP_INVALID_PLAN",
      "Plan de requête non autorisé.",
    );
  const expected = entityTypes[plan.intent];
  if (
    (expected && (!plan.entity || plan.entity.type !== expected)) ||
    (!expected && plan.entity)
  )
    throw new AppError(
      400,
      "NLP_INVALID_PLAN",
      "Paramètre incompatible avec le modèle SELECT.",
    );
  const entity = plan.entity
    ? `<${namespace}${safeEntityId(plan.entity.id)}>`
    : "";
  const template = {
    list_claims: "?claim rdf:type assurance:Sinistre .",
    claims_by_expert: `?claim rdf:type assurance:Sinistre ; assurance:évaluéPar ${entity} . ${entity} rdf:type assurance:Expert . FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ${entity} <urn:assurance:application:deleted> true } }`,
    claim_details: `VALUES ?claim { ${entity} } ?claim rdf:type assurance:Sinistre .`,
    claims_by_contract: `?claim rdf:type assurance:Sinistre ; assurance:concerneContrat ${entity} . ${entity} rdf:type assurance:Contrat . FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ${entity} <urn:assurance:application:deleted> true } }`,
    claims_by_insured: `?claim rdf:type assurance:Sinistre . ?claim (assurance:estDéclaréPar|^assurance:déclareSinistre) ${entity} . ${entity} rdf:type assurance:Assuré . FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ${entity} <urn:assurance:application:deleted> true } }`,
  };
  if (plan.intent === "count_claims")
    return `${prefixes}\nSELECT (COUNT(DISTINCT ?claim) AS ?count) WHERE { ?claim rdf:type assurance:Sinistre . } LIMIT 1`;
  if (plan.intent === "list_contracts")
    return `${prefixes}\nSELECT DISTINCT ?contract ?number WHERE { ?contract rdf:type assurance:Contrat . FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?contract <urn:assurance:application:deleted> true } } OPTIONAL { ?contract assurance:numéroContrat ?number } } ORDER BY ?contract ?number LIMIT ${resultLimit + 1}`;
  if (plan.intent === "list_insured")
    return `${prefixes}\nSELECT DISTINCT ?insured WHERE { ?insured rdf:type assurance:Assuré . FILTER NOT EXISTS { GRAPH <urn:assurance:application:metadata> { ?insured <urn:assurance:application:deleted> true } } } ORDER BY ?insured LIMIT ${resultLimit + 1}`;
  return `${prefixes}
SELECT DISTINCT ?claim ?contract ?date ?status ?expert ?insured WHERE {
  ${template[plan.intent]}
  OPTIONAL { ?claim assurance:concerneContrat ?contract }
  OPTIONAL { ?claim assurance:dateDéclaration ?date }
  OPTIONAL { ?claim assurance:statutSinistre ?status }
  OPTIONAL { ?claim assurance:évaluéPar ?expert }
  OPTIONAL { ?claim (assurance:estDéclaréPar|^assurance:déclareSinistre) ?insured }
} ORDER BY ?claim ?contract ?date ?status ?expert ?insured LIMIT ${resultLimit + 1}`;
}
