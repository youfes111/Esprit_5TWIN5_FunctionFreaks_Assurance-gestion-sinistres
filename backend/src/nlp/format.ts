import { AppError } from '../middleware/app-error.js';
import type { SelectResults } from '../sparql/client.js';
import type { QueryPlan } from './types.js';
import { resultLimit } from './queries.js';

export function formatResults(plan: QueryPlan, results: SelectResults) {
  if (plan.intent === 'count_claims') {
    const count = results.results.bindings[0]?.count;
    if (results.results.bindings.length !== 1 || count?.type !== 'literal' || !/^\d+$/.test(count.value)) throw new AppError(502, 'NLP_INVALID_COUNT', 'Le service RDF n’a pas renvoyé un comptage valide.');
    return { results, resultCount: 1, totalClaims: count.value, truncated: false, explanation: `Le graphe interrogé contient ${count.value} sinistre(s) explicitement typé(s).` };
  }
  const truncated = results.results.bindings.length > resultLimit;
  const displayed = { ...results, results: { bindings: results.results.bindings.slice(0, resultLimit) } };
  const resultCount = displayed.results.bindings.length;
  return { results: displayed, resultCount, truncated, explanation: resultCount === 0
    ? 'Aucun résultat RDF ne correspond à cette requête. Aucun enregistrement n’est inventé.'
    : `${resultCount} ligne(s) RDF retournée(s)${truncated ? ' ; limite de 100 lignes atteinte, résultats partiels' : ''}. Plusieurs relations peuvent produire plusieurs lignes pour un même individu.` };
}
