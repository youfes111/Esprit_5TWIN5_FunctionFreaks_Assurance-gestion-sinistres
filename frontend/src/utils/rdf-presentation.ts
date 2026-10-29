import type { NlpAnswer, RdfTerm } from '../types/nlp';

function decodeLabel(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** Display only: never use this label as an identifier or mutate the RDF term. */
export function iriLocalName(iri: string): string {
  const fragment = iri.lastIndexOf('#');
  if (fragment >= 0 && fragment < iri.length - 1) return decodeLabel(iri.slice(fragment + 1));
  try {
    const url = new URL(iri);
    const last = url.pathname.split('/').filter(Boolean).at(-1);
    return last ? decodeLabel(last) : iri;
  } catch { return iri; }
}

export function rdfDisplayValue(term: RdfTerm): string {
  if (term.type === 'uri') return iriLocalName(term.value);
  if (term.type === 'bnode') return `Nœud anonyme ${term.value.startsWith('_:') ? term.value : `_:${term.value}`}`;
  // Preserve the lexical form: no rounding, date conversion or boolean coercion.
  return term.value;
}

const fieldLabels: Record<string, string> = {
  claim: 'Sinistre', contract: 'Contrat', expert: 'Expert', insured: 'Assuré',
  date: 'Date de déclaration', status: 'Statut', number: 'Numéro du contrat',
  count: 'Nombre de sinistres', fraudulent: 'Fraude signalée',
};
export function rdfFieldLabel(variable: string): string { return fieldLabels[variable] ?? variable; }

/** A result is a binding row, not necessarily a distinct resource. */
export function resultCountLabel(count: number): string {
  return count === 0 ? 'Aucun résultat trouvé' : count === 1 ? '1 résultat trouvé' : `${count.toLocaleString('fr-FR')} résultats trouvés`;
}

export function chatExplanation(answer: NlpAnswer): string {
  if (/^\d+ ligne\(s\) RDF retournée\(s\)/.test(answer.explanation)) return 'Voici les informations retournées par le graphe d’assurance.';
  if (answer.totalClaims !== undefined && /^Le graphe interrogé contient \d+ sinistre\(s\)/.test(answer.explanation)) {
    return `Le graphe interrogé contient ${answer.totalClaims} ${answer.totalClaims === '1' ? 'sinistre explicitement typé' : 'sinistres explicitement typés'}.`;
  }
  if (answer.explanation === 'Aucun résultat RDF ne correspond à cette requête. Aucun enregistrement n’est inventé.') return 'Aucune information ne correspond à votre question dans le graphe interrogé.';
  return answer.explanation;
}
