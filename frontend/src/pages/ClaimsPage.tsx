import { Plus, Search, RefreshCw, MoreHorizontal, Eye, Pencil, Trash2, ShieldCheck, RotateCcw, FileWarning } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet';
import {useAuth} from '../features/auth/AuthProvider';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '../components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '../components/ui/dropdown-menu';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from '../components/ui/table';
import { NativeSelect } from '../components/ui/native-select';
import { PageHeader } from '../components/PageHeader';
import { DataState } from '../components/DataState';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { entrance } from '../design/motion';
import { useEffect, useRef, useState } from 'react';
import { claimsApi } from '../services/claims';
import { ClaimForm } from '../components/ClaimForm';
import { ClaimDetails } from '../components/ClaimDetails';
import { statuses, type Claim, type ClaimInput, type ClaimOptions, type ClaimPage } from '../types/claims';

export function ClaimsPage() {
  const [data, setData] = useState<ClaimPage | null>(null);
  const [options, setOptions] = useState<ClaimOptions | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ search: '', status: '', insuredId: '', expertId: '', contractId: '' });
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const {user}=useAuth();
  const [selected, setSelected] = useState<Claim | null>(null);
  const [editor, setEditor] = useState<{ claim: Claim | null } | null>(null);
  const [deleting, setDeleting] = useState<Claim | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const reduce = useReducedMotion();
  function restoreFocus(event: Event) { event.preventDefault(); if(actionTrigger.current?.isConnected) actionTrigger.current.focus(); else document.querySelector<HTMLElement>('main h1')?.focus({preventScroll:true}); }
  const detailRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { detailRequest.current?.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setData(null);
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
    void Promise.all([claimsApi.list(params, controller.signal), claimsApi.options(controller.signal)])
      .then(([claims, choices]) => { if (!controller.signal.aborted) { setData(claims); setOptions(choices); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Chargement impossible.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, page, refresh]);
  const writable = options?.mutationsEnabled && (user?.role==='ADMIN'||user?.role==='AGENT');
  function changed(key: keyof typeof filter, value: string) { setFilter((current) => ({ ...current, [key]: value })); setPage(1); }
  async function open(id: string, edit = false) {
    detailRequest.current?.abort();
    const controller = new AbortController(); detailRequest.current = controller;
    setBusy(true); setError(''); setEditor(null); setSelected(null);
    try {
      const claim = await claimsApi.get(id, controller.signal);
      if (!controller.signal.aborted) { if (edit) setEditor({ claim }); else setSelected(claim); }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Lecture impossible.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function save(input: ClaimInput) {
    setBusy(true); setError(''); setSuccess('');
    try {
      if (editor?.claim) {
        const { id, damageAmount, damageId, ...fields } = input;
        await claimsApi.update(id, { ...fields, ...(damageAmount !== editor.claim.damageAmount ? { damageAmount } : {}), ...(damageId !== editor.claim.damageId ? { damageId } : {}), revision: editor.claim.revision! });
      } else await claimsApi.create(input);
      setSuccess(`Sinistre ${input.id} enregistré.`); setEditor(null); setSelected(null); setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enregistrement impossible. Rechargez les données avant de réessayer.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || confirmation !== deleting.id) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await claimsApi.delete(deleting);
      setSuccess(`Sinistre ${deleting.id} supprimé.`); setDeleting(null); setSelected(null); setPage(1); setRefresh((value) => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Suppression impossible. Rechargez avant de réessayer.'); }
    finally { setBusy(false); }
  }
  return <div className="claims-page">
    <PageHeader eyebrow="Opérations · sinistres" title="Chaque dossier, sous contrôle." description="Consultez et gérez les déclarations reliées à votre graphe d’assurance." actions={<Button disabled={!writable || busy || loading} onClick={(event) => { actionTrigger.current = event.currentTarget; setEditor({ claim: null }); setSelected(null); setError(''); }}><Plus />Nouveau sinistre</Button>} />
    <Card className="detail-card demo-access"><ShieldCheck size={20} className="text-primary shrink-0" /><div><Badge variant="secondary">{writable?'Écriture autorisée':'Lecture seule'}</Badge><p>{!options?.mutationsEnabled?'Les modifications RDF restent désactivées. Les dossiers sont consultables.':!writable?'Votre rôle autorise la consultation uniquement.':'Votre session autorise les modifications des dossiers applicatifs. Les dossiers d’origine restent protégés.'}</p></div></Card>
    <Card className="detail-card claims-filters"><div className="filter-fields"><form onSubmit={(event) => { event.preventDefault(); changed('search', search); }}><label>Identifiant<Input value={search} maxLength={64} pattern="[A-Za-z][A-Za-z0-9_]{0,63}" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un dossier…" /></label><Button type="submit" variant="outline" aria-label="Rechercher le sinistre"><Search /></Button></form><label>Statut<NativeSelect value={filter.status} onChange={(event) => changed('status', event.target.value)}><option value="">Tous les statuts</option>{statuses.map((value) => <option key={value}>{value}</option>)}</NativeSelect></label>{(['insuredId', 'contractId', 'expertId'] as const).map((key) => <label key={key}>{key === 'insuredId' ? 'Assuré' : key === 'contractId' ? 'Contrat' : 'Expert'}<NativeSelect value={filter[key]} onChange={(event) => changed(key, event.target.value)}><option value="">Tous</option>{(key === 'insuredId' ? options?.insured : key === 'contractId' ? options?.contracts : options?.experts)?.map((value) => <option key={value}>{value}</option>)}</NativeSelect></label>)}</div><div className="filter-actions"><Button variant="ghost" aria-label="Réinitialiser les filtres" title="Réinitialiser les filtres" disabled={busy} onClick={() => { setFilter({ search: '', status: '', insuredId: '', expertId: '', contractId: '' }); setSearch(''); setPage(1); }}><RotateCcw /></Button><Button variant="outline" disabled={busy} onClick={() => { setSelected(null); setEditor(null); setDeleting(null); setRefresh((value) => value + 1); }}><RefreshCw />Actualiser</Button></div></Card>
    <AnimatePresence mode="wait">{error && !editor && !deleting ? <motion.div key="error" {...entrance(reduce)}><DataState error={error} /></motion.div> : success ? <motion.div key={success} {...entrance(reduce)} className="claims-success" role="status">{success}</motion.div> : null}</AnimatePresence>
    {loading ? <DataState loading /> : data && <Card className="detail-card claims-table-card"><Table><TableCaption className="sr-only">Liste des sinistres, page {page}</TableCaption><TableHeader><TableRow><TableHead>Identifiant</TableHead><TableHead>Assuré / Contrat</TableHead><TableHead>Déclaration</TableHead><TableHead>Statut</TableHead><TableHead>Expert</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{data.items.map((claim) => <TableRow key={claim.id}><TableCell><span className="claim-id">{claim.id}</span>{!claim.editable && <small><ShieldCheck size={10} className="inline mr-1" />Origine protégée</small>}</TableCell><TableCell>{claim.insuredId ?? '—'}<small>{claim.contractId ?? '—'}</small></TableCell><TableCell className="tabular-nums">{claim.declarationDate ?? '—'}</TableCell><TableCell><Badge className="claim-status" data-tone={claim.status === 'Rejeté' ? 'danger' : claim.status === 'Clôturé' || claim.status === 'Accepté' ? 'success' : 'warning'} variant="secondary">{claim.status ?? 'Non renseigné'}</Badge></TableCell><TableCell>{claim.expertId ?? 'Non affecté'}</TableCell><TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" disabled={busy} onClick={(event) => { actionTrigger.current = event.currentTarget; }} aria-label={`Actions pour ${claim.id}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { void open(claim.id); }}><Eye />Consulter les détails</DropdownMenuItem><DropdownMenuItem disabled={!writable || !claim.editable || busy} onSelect={() => { void open(claim.id, true); }}><Pencil />Modifier le dossier</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" disabled={!writable || !claim.editable || busy} onSelect={() => { setDeleting(claim); setConfirmation(''); setEditor(null); }}><Trash2 />Supprimer</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}</TableBody></Table>
    {data.items.length === 0 && <div className="data-empty"><FileWarning /><strong>Aucun dossier ne correspond.</strong><p>Modifiez vos filtres ou actualisez les données.</p></div>}<div className="claims-pagination"><span>Page {page} · {data.items.length} dossier(s) affiché(s)</span><Button variant="outline" disabled={page === 1 || busy} onClick={() => setPage((value) => value - 1)}>Précédent</Button><Button variant="outline" disabled={!data.hasMore || busy} onClick={() => setPage((value) => value + 1)}>Suivant</Button></div></Card>}
    <Sheet open={selected !== null} onOpenChange={(value) => { if (!value) setSelected(null); }}><SheetContent className="form-sheet" onCloseAutoFocus={restoreFocus}><SheetHeader><SheetTitle>Détails du sinistre</SheetTitle><SheetDescription>Identité RDF et informations actuellement connues.</SheetDescription></SheetHeader>{selected && <ClaimDetails claim={selected} onClose={() => setSelected(null)} />}</SheetContent></Sheet>
    <Sheet open={editor !== null} onOpenChange={(value) => { if (!value && !busy) setEditor(null); }}><SheetContent className="form-sheet" onCloseAutoFocus={restoreFocus} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onInteractOutside={(event) => { if (busy) event.preventDefault(); }}><SheetHeader><SheetTitle>{editor?.claim ? `Modifier ${editor.claim.id}` : 'Nouveau sinistre'}</SheetTitle><SheetDescription>Renseignez le dossier. Les références et autorisations sont vérifiées à l’enregistrement.</SheetDescription></SheetHeader>{error && <div className="sheet-errors"><DataState error={error} /></div>}{editor && options && <motion.div {...entrance(reduce)}><ClaimForm key={editor.claim?.id ?? 'new'} claim={editor.claim} options={options} busy={busy} onSave={save} onCancel={() => setEditor(null)} /></motion.div>}</SheetContent></Sheet>
    <AlertDialog open={deleting !== null} onOpenChange={(value) => { if (!value && !busy) setDeleting(null); }}><AlertDialogContent onCloseAutoFocus={restoreFocus} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}><AlertDialogHeader><AlertDialogTitle>Supprimer {deleting?.id} ?</AlertDialogTitle><AlertDialogDescription>Cette action retire le sinistre. Les assurés, contrats, experts et individus d’origine sont conservés. Retapez l’identifiant pour confirmer.</AlertDialogDescription></AlertDialogHeader><label className="confirmation-field">Identifiant de confirmation<Input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>{error && <DataState error={error} />}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Conserver le dossier</AlertDialogCancel><Button variant="destructive" disabled={!writable || busy || confirmation !== deleting?.id} onClick={() => { void remove(); }}>{busy ? 'Suppression…' : 'Confirmer la suppression'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
