import type { SelectResults } from '../types/visualization';
import { rdfFieldLabel, resultCountLabel } from '../utils/rdf-presentation';
import { RdfValue } from './RdfValue';
import { Card } from './ui/card';
import { Table, TableCaption, TableHeader, TableRow, TableHead, TableBody, TableCell } from './ui/table';

export const chatResultCardLimit = 3;

export function ChatbotResults({ results }: { results: SelectResults }) {
  const rows = results.results.bindings;
  const variables = results.head.vars;
  if (!rows.length) return <p className="chat-results-empty" role="status">{resultCountLabel(0)}</p>;
  if (rows.length <= chatResultCardLimit) return <div className="chat-result-cards">{rows.map((row, index) => {
    const fields = variables.filter(variable => row[variable] !== undefined);
    const primary = ['claim', 'contract', 'insured', 'expert'].find(variable => fields.includes(variable));
    return <Card className="chat-result-card" key={index}>
      <header><h3>{primary ? rdfFieldLabel(primary) : `Résultat ${index + 1}`}</h3>{primary && <RdfValue term={row[primary]!} />}</header>
      {fields.some(variable => variable !== primary) && <dl>{fields.filter(variable => variable !== primary).map(variable => <div key={variable}><dt>{rdfFieldLabel(variable)}</dt><dd><RdfValue term={row[variable]!} /></dd></div>)}</dl>}
      {!fields.length && <p>Aucune valeur liée dans ce résultat.</p>}
    </Card>;
  })}</div>;
  return <div className="chat-results-table">
    {variables.length > 3 && <p className="chat-table-hint">Faites défiler le tableau horizontalement pour voir tous les champs.</p>}
    <div className="chat-rdf-table-scroll" role="region" aria-label="Résultats du graphe, tableau défilant" tabIndex={0}>
      <Table className="chat-rdf-table" style={{ minWidth: `${Math.max(1, variables.length) * 112}px` }}>
        <TableCaption>{resultCountLabel(rows.length)} · valeurs issues du graphe</TableCaption>
        <TableHeader><TableRow>{variables.map(variable => <TableHead key={variable} scope="col">{rdfFieldLabel(variable)}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{rows.map((row, index) => <TableRow key={index}>{variables.map(variable => <TableCell key={variable}>{row[variable] ? <RdfValue term={row[variable]!} /> : <span className="rdf-unbound">Non renseigné</span>}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </div>
  </div>;
}
