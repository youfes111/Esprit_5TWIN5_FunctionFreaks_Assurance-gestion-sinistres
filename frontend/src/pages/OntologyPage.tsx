import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui/badge';
import { Search, RefreshCw, Network } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { TableCaption, TableHead, TableRow, TableHeader, TableCell, TableBody, Table } from '../components/ui/table';
import { useCallback, useMemo, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { visualizationApi } from '../services/visualization';
import { DataState } from '../components/DataState';
import { OntologyCanvas } from '../components/OntologyCanvas';
import { GraphNodeDetails } from '../components/GraphNodeDetails';
import { visibleGraph } from '../utils/graph';
import type { GraphCategory } from '../types/visualization';
export function OntologyPage() {
    const [view, setView] = useState<'schema' | 'individuals'>('schema');
    const load = useCallback((signal: AbortSignal) => visualizationApi.graph(view, signal), [view]);
    const graph = useResource(load);
    const [category, setCategory] = useState<GraphCategory | 'all'>('all');
    const [labels, setLabels] = useState(true);
    const [search, setSearch] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [selected, setSelected] = useState<string | null>(null);
    const filtered = useMemo(() => graph.data ? visibleGraph(graph.data, category) : null, [graph.data, category]);
    const matches = filtered?.nodes.filter((node) => (node.label + ' ' + node.iri).toLocaleLowerCase('fr').includes(appliedSearch.toLocaleLowerCase('fr'))).length ?? 0;
    return <div className="phase4-page"><PageHeader eyebrow="Knowledge workspace · ontologie" title="L’intelligence prend forme." description="Explorez les concepts, individus et relations de votre domaine d’assurance." actions={<Button variant="outline" disabled={graph.loading} onClick={graph.refresh}><RefreshCw size={14}/>Actualiser</Button>} /><div className="phase4-toolbar"><Tabs value={view} onValueChange={(value)=>{setView(value as typeof view);setSelected(null);setCategory('all');setSearch('');setAppliedSearch('');}}><TabsList><TabsTrigger value="schema"><Network size={14}/>Structure de l’ontologie</TabsTrigger><TabsTrigger value="individuals">Individus & relations</TabsTrigger></TabsList></Tabs><Badge variant="outline">Source RDF · Lecture seule</Badge></div><div className="graph-legend" aria-label="Légende"><span><i className="legend-class"/>Classes</span><span><i className="legend-individual"/>Individus nommés</span><span><i className="legend-property"/>Propriétés objet</span><span>Flèches : relations explicites</span></div>
    <DataState loading={graph.loading} error={graph.error} empty={graph.data?.nodes.length === 0} label="Aucun nœud dans cette vue du dataset."/>{graph.data && <><p className="data-caption">{graph.data.nodes.length} nœuds · {graph.data.edges.length} arêtes. {graph.data.truncated ? 'Vue partielle : limite de 2000 lignes atteinte.' : 'Source : graphe par défaut Fuseki.'} Les restrictions anonymes et les propriétés de données ne sont pas représentées.</p><div className="graph-workspace"><Card className="detail-card graph-card"><OntologyCanvas graph={graph.data} category={category} onCategory={(value) => { setCategory(value); setSelected(null); }} labels={labels} onLabels={setLabels} search={appliedSearch} selected={selected} onSelect={setSelected} toolbar={<div className="graph-search-block"><form className="graph-search graph-search-inline" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search); }}><label className="phase4-label"><span className="sr-only">Rechercher un nœud</span><Input type="search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={150} placeholder="Nom ou IRI, par exemple Karim"/></label><Button type="submit" variant="outline"><Search size={14}/>Rechercher</Button></form>{appliedSearch && <p role="status">{matches} nœud(s) correspondant(s) dans la catégorie visible.</p>}
    </div>}/></Card><GraphNodeDetails node={graph.data.nodes.find((node) => node.id === selected)} graph={graph.data}/></div>
    <Card className="detail-card graph-accessibility"><details><summary>Consulter la représentation textuelle accessible</summary><h2 className="mt-5">Nœuds et relations du graphe</h2><div className="data-table-scroll"><Table className="data-table"><TableCaption>Nœuds de la catégorie visible</TableCaption><TableHeader><TableRow><TableHead scope="col">Nom</TableHead><TableHead scope="col">Catégories</TableHead><TableHead scope="col">IRI</TableHead></TableRow></TableHeader><TableBody>{filtered?.nodes.map((node) => <TableRow key={node.id}><TableHead scope="row"><Button onClick={() => setSelected(node.id)} aria-pressed={selected === node.id} variant="outline">{node.label}</Button></TableHead><TableCell>{node.categories.join(', ')}</TableCell><TableCell>{node.iri}</TableCell></TableRow>)}</TableBody></Table></div><details><summary>Relations de la catégorie visible</summary><div className="data-table-scroll"><Table className="data-table"><TableCaption>Arêtes RDF, sans doublons</TableCaption><TableHeader><TableRow><TableHead scope="col">Source</TableHead><TableHead scope="col">Prédicat</TableHead><TableHead scope="col">Cible</TableHead></TableRow></TableHeader><TableBody>{filtered?.edges.map((edge) => <TableRow key={edge.id}><TableCell>{edge.source}</TableCell><TableCell>{edge.predicate}</TableCell><TableCell>{edge.target}</TableCell></TableRow>)}</TableBody></Table></div></details></details></Card></>}
  </div>;
}
