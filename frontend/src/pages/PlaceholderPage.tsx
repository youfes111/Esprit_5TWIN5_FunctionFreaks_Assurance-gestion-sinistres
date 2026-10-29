import { Construction, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
export function PlaceholderPage({ title }: { title:string }) {
  return <div className="phase4-page"><PageHeader eyebrow="Espace de travail" title={title} description="Retrouvez les fonctionnalités disponibles depuis votre navigation." /><Card className="detail-card items-center text-center py-16"><span className="metric-icon mb-5"><Construction /></span><h2>Cet espace n’est pas disponible.</h2><p className="max-w-md mb-6">Les modules actifs restent accessibles depuis le menu. Aucune fonctionnalité supplémentaire n’est simulée.</p><Button asChild variant="outline"><Link to="/"><ArrowLeft />Revenir au Dashboard</Link></Button></Card></div>;
}
