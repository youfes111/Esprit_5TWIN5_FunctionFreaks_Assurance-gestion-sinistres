import { NativeSelect } from './ui/native-select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { statuses, type Claim, type ClaimInput, type ClaimOptions } from '../types/claims';
export function ClaimForm({ claim, options, busy, onSave, onCancel }: {
    claim: Claim | null;
    options: ClaimOptions;
    busy: boolean;
    onSave: (input: ClaimInput) => Promise<void>;
    onCancel: () => void;
}) {
    const [input, setInput] = useState<ClaimInput>({
        id: claim?.id ?? '', insuredId: claim?.insuredId ?? '', contractId: claim?.contractId ?? '',
        declarationDate: claim?.declarationDate ?? new Date().toISOString().slice(0, 10),
        status: claim?.status ?? 'Déclaré', expertId: claim?.expertId ?? null,
        fraudulent: claim?.fraudulent ?? false, damageAmount: claim?.damageAmount ?? null,
        damageId: claim?.damageId ?? null,
    });
    const [validation, setValidation] = useState('');
    const change = <K extends keyof ClaimInput>(key: K, value: ClaimInput[K]) => setInput((current) => ({ ...current, [key]: value }));
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (input.damageAmount !== null && !/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(input.damageAmount)) {
            setValidation('Montant positif ou nul, 12 chiffres maximum et 2 décimales.');
            return;
        }
        setValidation('');
        await onSave(input);
    }
    const select = (label: string, key: 'insuredId' | 'contractId' | 'expertId', choices: string[], required: boolean) => <label>{label}{required ? " *" : ""}<NativeSelect required={required} value={input[key] ?? ''} onChange={(event) => change(key, event.target.value || (key === 'expertId' ? null : ''))}><option value="">{required ? 'Sélectionner…' : 'Non affecté'}</option>{[...new Set([...choices, ...(input[key] ? [input[key]!] : [])])].map((id) => <option key={id} value={id}>{id}</option>)}</NativeSelect></label>;
    return <Card className="detail-card claims-editor" aria-labelledby="claim-form-title"><h3 id="claim-form-title" className="mt-4">Informations du dossier</h3><p>Les références proviennent du jeu RDF. Le contrat doit appartenir à l’assuré sélectionné.</p><form onSubmit={(event) => { void submit(event); }}>
    <fieldset disabled={busy}><div className="claim-form-grid">
      <label>Identifiant *<Input required readOnly={!!claim} pattern="[A-Za-z][A-Za-z0-9_]{0,63}" maxLength={64} value={input.id} onChange={(event) => change('id', event.target.value)} aria-describedby="id-help"/><small id="id-help">Lettre initiale, lettres ASCII, chiffres et underscore.</small></label>
      {select('Assuré', 'insuredId', options.insured, true)}
      {select('Contrat', 'contractId', options.contracts, true)}
      {select('Expert', 'expertId', options.experts, false)}
      <label>Dommage associé<NativeSelect value={input.damageId ?? ''} onChange={(event) => { const damageId=event.target.value||null; change('damageId',damageId); if(damageId)change('damageAmount',null); }}><option value="">Montant libre / aucun dommage</option>{[...new Set([...options.damages,...(input.damageId?[input.damageId]:[])])].map(id=><option key={id}>{id}</option>)}</NativeSelect></label>
      <label>Date de déclaration *<Input required type="date" min="0001-01-01" max="9999-12-31" value={input.declarationDate} onChange={(event) => change('declarationDate', event.target.value)}/></label>
      <label>Statut *<NativeSelect required value={input.status} onChange={(event) => change('status', event.target.value)}>{statuses.map((value) => <option key={value}>{value}</option>)}</NativeSelect></label>
      <label>Montant estimé du dommage<Input type="text" inputMode="decimal" disabled={!!input.damageId} placeholder={input.damageId?'Porté par le dommage sélectionné':'Aucun dommage associé'} value={input.damageAmount ?? ''} onChange={(event) => change('damageAmount', event.target.value === '' ? null : event.target.value)} aria-invalid={validation ? true : undefined} aria-describedby={validation ? "amount-help amount-error" : "amount-help"}/><small id="amount-help">Choisissez un dommage géré ou saisissez un montant pour créer un dommage associé.</small></label>
      <label className="checkbox-label"><input type="checkbox" checked={input.fraudulent} onChange={(event) => change('fraudulent', event.target.checked)}/>Indicateur de fraude</label>
    </div>{validation && <p id="amount-error" role="alert" className="error-message">{validation}</p>}<div className="claims-actions"><Button type="submit" className="primary-button" variant="default">{busy ? 'Enregistrement…' : 'Enregistrer'}</Button><Button type="button" onClick={onCancel} variant="outline">Annuler</Button></div></fieldset>
  </form></Card>;
}
