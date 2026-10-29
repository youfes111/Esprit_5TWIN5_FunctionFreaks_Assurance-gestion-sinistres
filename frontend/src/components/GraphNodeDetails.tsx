import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Network, ArrowRight, MousePointer2 } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { ScrollArea } from './ui/scroll-area';
import { entrance } from '../design/motion';
import type { GraphNode, OntologyGraph } from '../types/visualization';
export function GraphNodeDetails({ node, graph }: { node: GraphNode | undefined; graph: OntologyGraph }) {
  const reduce = useReducedMotion();
  const relationships = node ? graph.edges.filter(edge=>edge.source===node.id||edge.target===node.id) : [];
  const label = (id:string) => graph.nodes.find(entry=>entry.id===id)?.label ?? id;
  return <AnimatePresence mode="wait" initial={false}><motion.aside key={node?.id ?? 'empty'} {...entrance(reduce)}><Card className="detail-card node-details" aria-live="polite"><div className="flex items-center justify-between mb-4"><span className="metric-icon"><Network size={18}/></span><Badge variant="outline">{node ? 'Ressource RDF' : 'Exploration'}</Badge></div><h2>{node?.label ?? 'Inspecter une ressource'}</h2>{node ? <><div className="flex flex-wrap gap-2 mt-3">{node.categories.map(category=><Badge variant="secondary" key={category}>{category}</Badge>)}</div><dl><dt>Identité complète</dt><dd><code>{node.iri}</code></dd><dt>Types RDF explicites</dt><dd>{node.types.length ? node.types.map(type=><p key={type}>{type}</p>) : 'Classe ou propriété référencée ; aucun type déclaré inclus dans cette vue.'}</dd></dl><Separator className="my-5" /><h3>Relations connues <Badge variant="secondary">{relationships.length}</Badge></h3>{relationships.length ? <ScrollArea className="h-[320px] pr-3"><ul>{relationships.map(edge=><li key={edge.id}><span>{label(edge.source)}</span><span className="flex items-center gap-2 my-1 text-primary"><ArrowRight size={12}/><strong>{edge.label}</strong></span><span>{label(edge.target)}</span><small>{edge.predicate}</small></li>)}</ul></ScrollArea> : <p className="data-caption">Aucune relation incluse dans cette vue.</p>}</> : <div className="text-muted-foreground"><MousePointer2 size={24} className="my-5 text-primary"/><p>Sélectionnez un nœud dans le graphe ou dans le tableau pour découvrir ses types et relations.</p></div>}</Card></motion.aside></AnimatePresence>;
}
