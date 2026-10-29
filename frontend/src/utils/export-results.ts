import type { SelectResults } from '../types/visualization';
function cell(value: string): string {
  const safe = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function resultsCsv(results: SelectResults): string {
  return '\uFEFF' + [results.head.vars.map(cell).join(','), ...results.results.bindings.map((row) => results.head.vars.map((key) => cell(row[key]?.value ?? '')).join(','))].join('\r\n');
}
export function resultsJson(results: SelectResults): string { return JSON.stringify(results, null, 2); }
export function downloadResults(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
