import { TableCaption, TableHead, TableRow, TableHeader, TableCell, TableBody, Table } from './ui/table';
import type { SelectResults } from '../types/visualization';
export function RdfResultsTable({ results }: {
    results: SelectResults;
}) {
    return <div className="data-table-scroll"><Table className="data-table"><TableCaption>Résultats SELECT : {results.results.bindings.length} ligne(s), sans inférence</TableCaption><TableHeader><TableRow>{results.head.vars.map((variable) => <TableHead scope="col" key={variable}>{variable}</TableHead>)}</TableRow></TableHeader><TableBody>{results.results.bindings.map((row, index) => <TableRow key={index}>{results.head.vars.map((variable) => <TableCell key={variable}>{row[variable] ? <><span>{row[variable]!.value}</span><small>{row[variable]!.type}{row[variable]!['xml:lang'] ? ` · ${row[variable]!['xml:lang']}` : ''}{row[variable]!.datatype ? ` · ${row[variable]!.datatype}` : ''}</small></> : 'Non lié'}</TableCell>)}</TableRow>)}</TableBody></Table></div>;
}
