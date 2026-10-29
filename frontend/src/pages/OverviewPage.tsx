import { motion, useReducedMotion } from 'motion/react';
import { Boxes, Users, FileWarning, Files, UserRound, BadgeCheck, RefreshCw, CarFront } from 'lucide-react';
import { DashboardQuickActions } from '../components/DashboardQuickActions';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { staggerChildren } from '../design/motion';
import { Card } from '../components/ui/card';
import { visualizationApi } from '../services/visualization';
import { useResource } from '../hooks/useResource';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { StatusBadge } from '../components/StatusBadge';
import { StatisticCard } from '../components/StatisticCard';
import { AnalyticsChart } from '../components/AnalyticsChart';
import { DataState } from '../components/DataState';
export function OverviewPage() {
    const summary = useResource(visualizationApi.summary);
    const distributions = useResource(visualizationApi.distributions);
    const system = useSystemStatus();
    const reduce = useReducedMotion();
    const cards = [
        { label: 'Classes OWL déclarées', icon: Boxes, value: summary.data?.classes, note: 'Concepts, pas des dossiers métier' },
        { label: 'Individus nommés', icon: Users, value: summary.data?.individuals, note: 'Déclarations owl:NamedIndividual' },
        { label: 'Sinistres', icon: FileWarning, value: summary.data?.claims, note: 'Individus explicitement typés Sinistre' },
        { label: 'Contrats', icon: Files, value: summary.data?.contracts, note: 'Individus explicitement typés Contrat' },
        { label: 'Assurés', icon: UserRound, value: summary.data?.insured, note: 'Individus explicitement typés Assuré' },
        { label: 'Experts', icon: BadgeCheck, value: summary.data?.experts, note: 'Individus explicitement typés Expert' },
        { label: 'Dommages', icon: CarFront, value: summary.data?.damages, note: 'Individus explicitement typés Dommage' },
    ];
    return <div className="phase4-page"><PageHeader eyebrow="Command center · RDF" title="Une vision claire. Des décisions éclairées." description="Votre activité d’assurance, directement reliée aux faits du graphe." actions={<StatusBadge status={system.status} />} />
        <div className="phase4-toolbar"><span>{summary.data ? `${summary.data.triples.toLocaleString('fr-FR')} triplets dans le graphe par défaut` : 'Source : Fuseki · graphe par défaut'}</span><Button onClick={() => { summary.refresh(); distributions.refresh(); system.refresh(); }} disabled={summary.loading || distributions.loading} variant="outline"><RefreshCw size={14} />Actualiser les données</Button></div>
    <DataState error={summary.error}/><motion.div className="dashboard-stats" aria-live="polite" variants={staggerChildren} initial={reduce ? false : "hidden"} animate="show">{cards.map((card) => <StatisticCard key={card.label} {...card} loading={summary.loading}/>)}</motion.div>
    <DashboardQuickActions /><div className="source-note"><strong>Deux sources distinctes</strong><p>Ces cartes reflètent le dataset courant. Le fichier source original reste inchangé : {system.summary ? `${system.summary.classCount} classes déclarées et ${system.summary.individualCount} individus nommés` : 'statistiques locales indisponibles'}. La connexion backend n’indique pas la disponibilité de Fuseki.</p>{system.error && <p role="status">{system.error}</p>}</div>
    <DataState loading={distributions.loading} error={distributions.error}/>{distributions.data && <><div className="analytics-grid">
      <AnalyticsChart title="Sinistres par statut" description="Un statut absent est signalé. Un dossier portant plusieurs statuts peut apparaître dans plusieurs groupes." data={distributions.data.statuses}/>
      <AnalyticsChart title="Sinistres par expert" description="Relations évaluéPar vers des experts nommés et typés ; aucun expert ajouté artificiellement." data={distributions.data.experts}/>
      <AnalyticsChart title="Instances du domaine" description="Individus nommés explicitement typés. Une ressource peut appartenir à plusieurs classes." data={distributions.data.instances}/>
      <AnalyticsChart title="Montants estimés des dommages" description="Valeurs de montantEstimé, sans somme ni devise inventée. Les valeurs exactes figurent dans le tableau." data={distributions.data.damages} amount/>
    </div><p className="data-caption">Montants absents : {distributions.data.damages.missing} · lignes non numériques ou non exploitables : {distributions.data.damages.invalid}.</p><Card className="detail-card"><h2>Types de contrats</h2><p className="data-caption">{distributions.data.contractTypes.reason}</p></Card></>}
  </div>;
}
