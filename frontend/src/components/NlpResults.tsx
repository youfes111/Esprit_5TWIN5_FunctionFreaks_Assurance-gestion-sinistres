import { motion, useReducedMotion } from 'motion/react';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './ui/accordion';
import { RdfResultsTable } from './RdfResultsTable';
import { ChatbotResults } from './ChatbotResults';
import { SparqlCode } from './SparqlCode';
import { CopyButton } from './CopyButton';
import { DataState } from './DataState';
import { entrance } from '../design/motion';
import type { NlpAnswer } from '../types/nlp';
const labels: Record<string,string> = { list_claims:'Liste des sinistres', claims_by_expert:'Sinistres par expert', claim_details:'Détails d’un sinistre', list_insured:'Liste des assurés', list_contracts:'Liste des contrats', count_claims:'Nombre de sinistres', claims_by_contract:'Sinistres par contrat', claims_by_insured:'Sinistres par assuré' };
export function NlpResults({ answer, defaultTab = 'results', compact = false }: { answer: NlpAnswer; defaultTab?: 'results' | 'analysis' | 'sparql'; compact?: boolean }) {
  const reduce = useReducedMotion();
  const steps = [
    { title:'Question originale', body:<p>{answer.question}</p> },
    { title:'Question normalisée', body:<p>{answer.preprocessing.normalized}</p> },
    { title:'Tokens · natural français', body:<p className="nlp-token-list">{answer.preprocessing.tokens.map((value,i)=><code key={i}>{value}</code>)}</p> },
    { title:'Racines linguistiques françaises', body:<p className="nlp-token-list">{answer.preprocessing.stems.map((value,i)=><code key={i}>{value}</code>)}</p> },
    { title:`Intention · ${answer.intent}`, body:<p>{answer.rule}</p> },
    { title:'Résolution des entités RDF', body:<p>{answer.entities.length ? answer.entities.map((entity)=>`« ${entity.matchedText} » → ${entity.id} (${entity.type})`).join(' ; ') : 'Requête générale, sans filtre individuel.'}</p> },
    { title:'Plan de requête approuvé', body:<p>Le modèle SELECT est validé puis exécuté via la connexion de lecture Fuseki. L’onglet SPARQL présente la requête exacte.</p> },
    { title:'Résultats issus du graphe', body:<><p>{answer.resultCount} {answer.resultCount === 1 ? 'ligne RDF affichée' : 'lignes RDF affichées'}. Plusieurs relations peuvent produire plusieurs lignes pour un même individu.</p><p>{answer.explanation}</p></> },
  ];
  return <div className={`nlp-answer${compact ? ' nlp-answer-compact' : ''}`}><div className="nlp-intent"><strong>{labels[answer.intent] ?? answer.intent}</strong><Badge variant="secondary">{answer.resultCount} {answer.resultCount === 1 ? 'ligne RDF' : 'lignes RDF'}</Badge></div>{!compact && <><p>{answer.explanation}</p>{answer.totalClaims !== undefined && <p className="nlp-count">Sinistres identifiés <strong>{answer.totalClaims}</strong></p>}<div className="nlp-entities"><strong>Entités reconnues</strong>{answer.entities.length ? <ul>{answer.entities.map((entity)=><li key={`${entity.iri}:${entity.type}`}><code>{entity.id}</code><Badge variant="outline">{entity.type}</Badge></li>)}</ul> : <p className="text-muted-foreground">Aucun filtre individuel.</p>}</div></>}
    <Tabs defaultValue={defaultTab} className={compact ? 'mt-3' : 'mt-6'}><TabsList className="w-full sm:w-auto"><TabsTrigger value="results">Résultats</TabsTrigger><TabsTrigger value="analysis">Analyse NLP</TabsTrigger><TabsTrigger value="sparql">SPARQL</TabsTrigger></TabsList><TabsContent value="results" className="pt-3">{compact ? <ChatbotResults results={answer.results} /> : answer.resultCount > 0 ? <RdfResultsTable results={answer.results} /> : <DataState empty label="Aucune ligne trouvée. Vérifiez l’individu demandé et les données importées." />}{answer.truncated && <p className="data-caption" role="status">Résultats limités à 100 lignes. Le nombre d’individus peut différer du nombre de lignes.</p>}</TabsContent>
    <TabsContent value="analysis" className="nlp-trace"><Accordion type="multiple">{steps.map((step,index)=><AccordionItem value={`step-${index}`} key={step.title}><AccordionTrigger className="text-xs"><span className="flex items-center gap-3"><span className="text-primary tabular-nums">{String(index+1).padStart(2,'0')}</span>{step.title}</span></AccordionTrigger><AccordionContent><motion.div {...entrance(reduce)}>{step.body}</motion.div></AccordionContent></AccordionItem>)}</Accordion></TabsContent>
    <TabsContent value="sparql" className="pt-3"><div className="flex items-center justify-between gap-4"><p className="data-caption">SELECT généré · lecture seule</p><CopyButton value={answer.sparql} label="Copier le SELECT" /></div><SparqlCode query={answer.sparql} /></TabsContent></Tabs>
  </div>;
}
