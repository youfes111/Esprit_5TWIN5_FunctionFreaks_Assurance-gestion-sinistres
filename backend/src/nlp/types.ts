import type { SelectResults } from '../sparql/client.js';

export const intents = ['list_claims', 'claims_by_expert', 'claim_details', 'list_insured', 'list_contracts', 'count_claims', 'claims_by_contract', 'claims_by_insured'] as const;
export type Intent = typeof intents[number];
export type EntityType = 'Expert' | 'Sinistre' | 'Contrat' | 'Assuré';
export interface Entity { id: string; iri: string; type: EntityType; aliases: string[] }
export interface RecognizedEntity extends Entity { matchedText: string }
export interface QueryPlan { intent: Intent; entity?: { id: string; type: EntityType } }
export interface Preprocessed { normalized: string; tokens: string[]; stems: string[] }
export interface NlpReader {
  nlpEntities(): Promise<SelectResults>;
  selectNlp(plan: QueryPlan): Promise<SelectResults>;
}
export interface NlpAnswer {
  question: string; intent: Intent; entities: RecognizedEntity[]; preprocessing: Preprocessed;
  plan: QueryPlan; sparql: string; results: SelectResults; resultCount: number;
  totalClaims?: string; truncated: boolean; explanation: string; rule: string;
}
