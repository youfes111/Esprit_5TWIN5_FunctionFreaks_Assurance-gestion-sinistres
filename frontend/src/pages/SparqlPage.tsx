import { Code2, Play, FileCode2, Download, Braces, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { PageHeader } from '../components/PageHeader';
import { CopyButton } from '../components/CopyButton';
import { useEffect, useRef, useState } from 'react';
import { useResource } from '../hooks/useResource';
import { visualizationApi } from '../services/visualization';
import { DataState } from '../components/DataState';
import { SparqlCode } from '../components/SparqlCode';
import { RdfResultsTable } from '../components/RdfResultsTable';
import { resultsCsv, resultsJson, downloadResults } from '../utils/export-results';
import type { SelectResults } from '../types/visualization';
export function SparqlPage() {
    const catalogue = useResource(visualizationApi.catalogue);
    const [selected, setSelected] = useState('classes');
    const [results, setResults] = useState<SelectResults | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => pending.current?.abort(), []);
    const definition = catalogue.data?.find((entry) => entry.id === selected);
    async function execute() {
        if (!definition)
            return;
        const controller = new AbortController();
        pending.current?.abort();
        pending.current = controller;
        setBusy(true);
        setError('');
        setResults(null);
        setNotice('');
        try {
            const data = await visualizationApi.execute(definition.id, controller.signal);
            if (!controller.signal.aborted)
                setResults(data);
        }
        catch (cause) {
            if (!controller.signal.aborted)
                setError(cause instanceof Error ? cause.message : 'Exécution impossible.');
        }
        finally {
            if (!controller.signal.aborted)
                setBusy(false);
        }
    }
    return <div className="phase4-page"><PageHeader eyebrow="Developer workspace · SPARQL" title="Le graphe, à requête ouverte." description="Inspectez et exécutez les modèles SELECT approuvés. Les données restent intactes." actions={<Badge variant="outline"><ShieldCheck size={13} />Lecture seule</Badge>} />
    <DataState loading={catalogue.loading} error={catalogue.error} />
    <div className="sparql-workspace"><Card className="detail-card query-library"><h2>BIBLIOTHÈQUE DE REQUÊTES</h2><ScrollArea className="h-[460px] max-h-[60vh]"><nav aria-label="Catalogue des requêtes SELECT">{catalogue.data?.map((entry,index)=><Button variant="ghost" key={entry.id} className="query-choice" aria-pressed={selected === entry.id} disabled={busy} onClick={() => { setSelected(entry.id); setResults(null); setError(''); setNotice(''); }}><FileCode2 size={18} /><span>{entry.title}<small>SELECT · modèle {String(index+1).padStart(2,'0')}</small></span>{selected === entry.id && <ArrowRight size={13} className="ml-auto" />}</Button>)}</nav></ScrollArea><p className="data-caption px-3 pt-4">{catalogue.data?.length ?? '—'} définitions issues du backend.<br />Aucune requête arbitraire.</p></Card>
    <div className="query-editor">{definition && <Card className="detail-card code-card"><div className="code-card-head"><div><h2 className="flex items-center gap-2"><Code2 size={17} className="text-primary" />{definition.title}</h2><small>query.sparql · modèle approuvé</small></div><CopyButton value={definition.query} /></div><p className="data-caption px-6 py-4 m-0">{definition.description}</p><SparqlCode query={definition.query} /><div className="code-card-footer"><Badge variant="secondary"><ShieldCheck size={12} />SELECT uniquement</Badge><Button disabled={busy} onClick={() => { void execute(); }}><Play size={14} />{busy ? 'Exécution en cours…' : 'Exécuter la requête'}</Button></div></Card>}
    <DataState loading={busy} error={error} />{notice && <p role="status" className="data-caption">{notice}</p>}
    {results ? <Card className="detail-card"><div className="phase4-toolbar"><div><h2 className="flex items-center gap-2"><Braces size={18} className="text-primary" />Résultats du graphe <Badge variant="secondary">{results.results.bindings.length} ligne(s)</Badge></h2><p className="data-caption m-0">{results.head.vars.length} variable(s) · types RDF conservés</p></div><div className="phase4-actions"><Button variant="outline" onClick={() => downloadResults(resultsCsv(results), `${selected}.csv`, 'text/csv;charset=utf-8')}><Download size={13} />CSV</Button><Button variant="outline" onClick={() => downloadResults(resultsJson(results), `${selected}.json`, 'application/json;charset=utf-8')}><Download size={13} />JSON</Button></div></div><DataState empty={results.results.bindings.length === 0} label="Aucun résultat dans le dataset courant pour ce modèle." /><RdfResultsTable results={results} /><p className="data-caption">Limite du modèle : 1000 lignes. Une ligne n’est pas nécessairement un individu distinct.</p></Card> : !busy && !error && <Card className="detail-card"><DataState empty label="Votre espace de résultats est prêt. Exécutez une requête pour lire les assertions du graphe." /></Card>}
    </div></div>
  </div>;
}
