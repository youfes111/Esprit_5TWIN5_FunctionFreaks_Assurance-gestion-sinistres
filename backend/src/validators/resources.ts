import { AppError } from '../middleware/app-error.js';
import type { ResourceKind, ResourceInput } from '../types/resources.js';
import { identifier, revision as parseRevision, date as parseDate, amount as parseAmount } from './claims.js';
const schemas: Record<ResourceKind, string[]> = {
  insured: ['id','name','email','phone','address'], contract: ['id','name','identifier','type','status','startDate','endDate','coverage','insuredId'],
  expert: ['id','name','specialization','email','phone','availability'], damage: ['id','name','type','description','amount','claimId'],
};
const required:Record<ResourceKind,string[]>={insured:['id','name'],contract:['id','name','identifier','insuredId','type','status','startDate','endDate','coverage'],expert:['id','name','specialization'],damage:['id','name','type','description','amount']};
const textLimits: Record<string, number> = { name:120, identifier:80, email:254, phone:40, address:300, type:100, status:40, coverage:1000, specialization:160, availability:80, description:1000 };
const optionalText=new Set(['email','phone','address','coverage','availability']);
function fail(message: string): never { throw new AppError(400,'VALIDATION_ERROR',message); }
export function resourceInput(kind: ResourceKind, value: unknown, partial = false): ResourceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Un objet JSON est requis.');
  const raw = value as Record<string, unknown>, allowed = schemas[kind];
  if(!partial&&'revision' in raw)fail('Revision is not accepted during creation.');
  if(partial&&'id' in raw)fail('The RDF identity cannot be changed.');
  for (const key of Object.keys(raw)) if (key !== 'revision' && !allowed.includes(key)) fail(`Champ non autorisé : ${key}.`);
  if (partial && !('revision' in raw)) fail('Révision manquante. Rechargez la fiche.');
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (!(key in raw)) { if (!partial && required[kind].includes(key)) fail(`Champ requis : ${key}.`); continue; }
    const value = raw[key];
    if (key === 'id' || key === 'insuredId' || key === 'claimId') out[key] = key === 'id' || value !== null ? identifier(value) : undefined;
    else if (key === 'startDate' || key === 'endDate') out[key] = parseDate(value);
    else if (key === 'amount') out[key] = parseAmount(value);
    else {
      if (typeof value !== 'string' || (!optionalText.has(key)&&value.trim().length === 0) || value.length > (textLimits[key] ?? 100)) fail(`${key} requis, limité à ${textLimits[key] ?? 100} caractères.`);
      if(key==='email'&&value!==''&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail('Adresse courriel invalide.');
      out[key] = value.trim();
    }
  }
  if (kind === 'contract') {
    if ((!partial || ('startDate' in out && 'endDate' in out)) && String(out.endDate) <= String(out.startDate)) fail('La date d’expiration doit suivre la date de début.');
    if ('identifier' in out && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(String(out.identifier))) fail('Numéro de contrat invalide.');
    if ('status' in out && !['Actif','Suspendu','Expiré','Résilié'].includes(String(out.status))) fail('Statut de contrat non reconnu.');
  }
  if (partial) parseRevision(raw.revision);
  return out as unknown as ResourceInput;
}
export function resourceQuery(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Filtres invalides.');
  const q=value as Record<string,unknown>;
  for(const key of Object.keys(q))if(!['page','pageSize','search','sort','direction','filter','status','type'].includes(key))fail(`Filtre non autorisé : ${key}.`);
  for(const key of ['page','pageSize','search','sort','direction','filter','status','type'])if(q[key]!==undefined&&typeof q[key]!=='string')fail(`Filtre invalide : ${key}.`);
  const page=Number(q.page??1), pageSize=Number(q.pageSize??20);
  if (!Number.isInteger(page)||page<1||page>10000||!Number.isInteger(pageSize)||pageSize<1||pageSize>100) fail('Pagination invalide.');
  const search=q.search===undefined?'':String(q.search); if(search.length>120) fail('Recherche trop longue.');
  const sort=String(q.sort??'id'); if(!['id','name','type','status','amount','startDate'].includes(sort)) fail('Tri non autorisé.');
  const direction=q.direction??'asc';if(direction!=='asc'&&direction!=='desc')fail('Ordre de tri invalide.');
  const filter=typeof q.filter==='string'&&q.filter.length<=80?q.filter:'';
  const status=typeof q.status==='string'&&q.status.length<=40?q.status:'';
  const type=typeof q.type==='string'&&q.type.length<=100?q.type:'';
  if((q.status!==undefined&&typeof q.status!=='string')||(q.type!==undefined&&typeof q.type!=='string'))fail('Filtre invalide.');
  return {page,pageSize,search,sort,direction,filter,status,type};
}
