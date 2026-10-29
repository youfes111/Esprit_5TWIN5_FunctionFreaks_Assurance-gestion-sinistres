const parts = /("(?:\\.|[^"\\])*"|<[^>]*>|\?[A-Za-z]\w*|\b(?:PREFIX|SELECT|DISTINCT|WHERE|OPTIONAL|FILTER|ORDER|BY|LIMIT|VALUES|AS|GROUP|COUNT)\b)/g;
export function SparqlCode({ query }: { query: string }) {
  return <pre className="sparql-code" tabIndex={0} aria-label="Requête SPARQL SELECT, lecture seule"><code>{query.split(parts).map((part, index) => <span key={index} className={part.startsWith('?') ? 'syntax-variable' : part.startsWith('<') ? 'syntax-iri' : part.startsWith('"') ? 'syntax-literal' : /^[A-Z]+$/.test(part) ? 'syntax-keyword' : undefined}>{part}</span>)}</code></pre>;
}
