import { queries, type QueryName } from './queries.js';
const descriptions: Record<QueryName, { title: string; description: string }> = {
  classes: { title: 'Classes OWL', description: 'Classes nommées explicitement déclarées et leurs libellés éventuels.' },
  individuals: { title: 'Individus nommés', description: 'Individus déclarés et leurs types RDF explicites.' },
  contracts: { title: 'Contrats', description: 'Contrats avec numéro et assuré quand ces données sont présentes.' },
  insured: { title: 'Assurés', description: 'Assurés, contrats et sinistres reliés dans les deux directions déclarées.' },
  claims: { title: 'Sinistres', description: 'Sinistres, contrats, dates, statuts et indicateurs de fraude.' },
  'claim-experts': { title: 'Sinistres et experts', description: 'Liens évaluéPar vers des experts explicitement typés.' },
  'example-karim': { title: 'Exemple Karim', description: 'Le sinistre S2026_014 évalué par Karim, selon le scénario original.' },
};
export function queryCatalogue() { return (Object.keys(queries) as QueryName[]).map((id) => ({ id, ...descriptions[id], query: queries[id] })); }
