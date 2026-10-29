export interface RdfTerm { type: 'uri' | 'literal' | 'bnode'; value: string; datatype?: string; 'xml:lang'?: string }
export interface NlpAnswer {
  question: string;
  intent: string;
  entities: { id: string; iri: string; type: string; matchedText: string }[];
  preprocessing: { normalized: string; tokens: string[]; stems: string[] };
  plan: { intent: string; entity?: { id: string; type: string } };
  sparql: string;
  results: { head: { vars: string[] }; results: { bindings: Record<string, RdfTerm>[] } };
  resultCount: number;
  totalClaims?: string;
  truncated: boolean;
  explanation: string;
  rule: string;
}
