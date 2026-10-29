import { AppError } from '../middleware/app-error.js';
import { lexicon, preprocess, fold } from './preprocess.js';
import type { QueryPlan, RecognizedEntity } from './types.js';

const claims = lexicon('sinistre sinistres dossier dossiers réclamation réclamations reclamation reclamations');
const contracts = lexicon('contrat contrats police polices');
const experts = lexicon('expert experts experte expertes évalué évalués évaluée évaluées évaluer evaluer evalues evalue expertisé expertises');
const declarations = lexicon('déclaré déclarés déclarée déclarées declare declares declaree declarees');
const detail = lexicon('détail détails detail details information informations consulter consulte');
const counts = lexicon('combien nombre décompte decompte compter compte');
const actions = lexicon('liste lister listes affiche afficher affiches montre montrer montrez donne donner donnez voir rechercher cherche trouver trouve quels quelles quel quelle');
const fillers = lexicon('le la les l de des du d un une tous toutes tout sont est existent existe moi nous me vous s il te tu plait plaît veuillez peux peut pourriez pouvez bonjour svp assurance assurances associé associés associes associe lié liés lie lies appartenant appartient par pour concernant concerne avec au aux évalué évalués evalue evalues déclaré déclarés declares declaree déclarées');
const insuredWords = new Set(['assure', 'assures', 'assuree', 'assurees']);
const banned = lexicon('supprime supprimer effacer efface modifier modifie créer cree creer ajouter ajoute enregistrer insérer inserer retirer retire');
export function unsupported(message = 'Question non prise en charge. Essayez un exemple : liste des sinistres, expert, identifiant, contrat, assuré ou nombre de sinistres.'): never {
  throw new AppError(422, 'NLP_UNSUPPORTED_QUESTION', message);
}
export function checkLanguage(text: string) {
  const { tokens, stems } = preprocess(text);
  if (stems.some((value) => banned.has(value))) unsupported('Cet assistant consulte uniquement les données ; il ne peut pas les modifier.');
  if (tokens.some((value) => ['mes', 'mon', 'ma', 'nos', 'notre', 'vos', 'votre', 'ton', 'ta', 'tes'].includes(fold(value)))) unsupported('La notion de « mes » données nécessite une identité utilisateur. Précisez un assuré par son identifiant.');
  if (tokens.some((value) => ['pas', 'sans', 'sauf', 'non', 'ni', 'et', 'ou'].includes(fold(value)))) unsupported('Les négations et les questions combinées ne sont pas prises en charge. Posez une seule question positive.');
}
export function planQuestion(remainder: string, entities: RecognizedEntity[]): { plan: QueryPlan; rule: string } {
  const { tokens, stems } = preprocess(remainder);
  const has = (group: Set<string>) => stems.some((value) => group.has(value));
  const isClaims = has(claims), isContracts = has(contracts);
  const isInsured = tokens.some((value) => insuredWords.has(fold(value)));
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i]!, root = stems[i]!;
    if (![claims, contracts, experts, detail, counts, actions, fillers].some((set) => set.has(root)) && !insuredWords.has(fold(word))) {
      unsupported(`Le terme « ${word} » ne correspond pas au vocabulaire ou à une entité reconnue. Précisez l’identifiant et utilisez une question prise en charge.`);
    }
  }
  if (entities.length > 1) throw new AppError(422, 'NLP_AMBIGUOUS_QUESTION', 'Plusieurs individus sont mentionnés. Limitez la question à un seul identifiant ou une seule relation.');
  const entity = entities[0];
  if (!isClaims) {
    if (entity || has(counts) || (isContracts && isInsured) || has(experts)) unsupported();
    if (isContracts) return { plan: { intent: 'list_contracts' }, rule: 'Nom de domaine contrat/police, sans filtre individuel.' };
    if (isInsured) return { plan: { intent: 'list_insured' }, rule: 'Nom de domaine assuré, sans filtre individuel.' };
    return unsupported();
  }
  const relationTypes = [has(experts) ? 'Expert' : '', isContracts ? 'Contrat' : '', isInsured || has(declarations) ? 'Assuré' : ''].filter(Boolean);
  if (has(counts)) {
    if (entity || relationTypes.length) unsupported('Le comptage est disponible uniquement pour tous les sinistres, sans filtre.');
    return { plan: { intent: 'count_claims' }, rule: 'Marqueur de quantité et nom de domaine sinistre.' };
  }
  if (relationTypes.length > 1 || (entity && relationTypes.length && relationTypes[0] !== entity.type)) unsupported('La relation demandée et le type de l’individu ne correspondent pas, ou plusieurs relations sont demandées.');
  if (!entity) {
    if (relationTypes.length || has(detail)) throw new AppError(422, 'NLP_ENTITY_REQUIRED', 'Précisez un identifiant existant et unique pour le sinistre, l’expert, le contrat ou l’assuré.');
    return { plan: { intent: 'list_claims' }, rule: 'Nom de domaine sinistre, sans quantité ni filtre individuel.' };
  }
  const intent = { Expert: 'claims_by_expert', Sinistre: 'claim_details', Contrat: 'claims_by_contract', Assuré: 'claims_by_insured' } as const;
  if (has(detail) && entity.type !== 'Sinistre') unsupported('Pour les détails, précisez l’identifiant du sinistre.');
  return { plan: { intent: intent[entity.type], entity: { id: entity.id, type: entity.type } }, rule: `Domaine sinistre + individu RDF de type ${entity.type} résolu par identifiant/libellé unique.` };
}
