import { ChevronDown } from 'lucide-react';
import type { RdfTerm } from '../types/nlp';
import { rdfDisplayValue, iriLocalName } from '../utils/rdf-presentation';
import { CopyButton } from './CopyButton';

export function RdfValue({ term }: { term: RdfTerm }) {
  return <details className="rdf-value">
    <summary><span className="rdf-value-label">{rdfDisplayValue(term)}</span><ChevronDown size={12} aria-hidden="true" /><span className="sr-only">Afficher la valeur RDF exacte</span></summary>
    <div className="rdf-term-details">
      <dl><dt>Type RDF</dt><dd>{term.type === 'uri' ? 'Ressource (IRI)' : term.type === 'bnode' ? 'Nœud anonyme (identifiant local au résultat)' : 'Littéral'}</dd>
        <dt>{term.type === 'uri' ? 'URI complète' : 'Valeur exacte'}</dt><dd><code>{term.value}</code></dd>
        {term.datatype && <><dt>Type de données</dt><dd><code>{term.datatype}</code></dd></>}
        {term['xml:lang'] && <><dt>Langue</dt><dd>{term['xml:lang']}</dd></>}
      </dl><CopyButton value={term.value} label={term.type === 'uri' ? 'Copier l’URI' : 'Copier la valeur'} />
    </div>
    {term.type === 'literal' && (term['xml:lang'] || term.datatype) && <span className="rdf-literal-hint">{term['xml:lang'] ? `Langue : ${term['xml:lang']}` : `Type : ${iriLocalName(term.datatype!)}`}</span>}
  </details>;
}
