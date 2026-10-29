import { Button } from './ui/button';
import { Card } from './ui/card';
import type { Claim } from '../types/claims';
export function ClaimDetails({ claim, onClose }: {
    claim: Claim;
    onClose: () => void;
}) {
    const entries = [
        ['Assuré', claim.insuredId], ['Contrat', claim.contractId], ['Expert', claim.expertId],
        ['Date', claim.declarationDate], ['Statut', claim.status],
        ['Fraude', claim.fraudulent === null ? null : claim.fraudulent ? 'Oui' : 'Non'],
        ['Montant estimé', claim.damageAmount], ['Gestion', claim.editable ? 'Créé par l’application' : 'Individu d’origine · lecture seule'],
    ];
    return <Card className="detail-card" aria-labelledby="claim-details-title"><div className="claims-section-title"><h2 id="claim-details-title">Sinistre {claim.id}</h2><Button onClick={onClose} variant="outline">Fermer</Button></div><dl className="claim-detail-grid">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? 'Non renseigné'}</dd></div>)}</dl></Card>;
}
