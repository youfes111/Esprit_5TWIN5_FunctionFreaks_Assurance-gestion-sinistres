import { AppError } from '../middleware/app-error.js';
import { roles, type Role } from './types.js';
export function invalid(message='Données invalides.'):never { throw new AppError(400,'INVALID_AUTH_INPUT',message); }
export function object(value:unknown,keys:string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))) invalid();
  return value as Record<string,unknown>;
}
export function email(value:unknown):string {
  if(typeof value!=='string'||value.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) invalid('Adresse email invalide.');
  return value.trim().toLowerCase();
}
export function name(value:unknown):string { if(typeof value!=='string'||value.trim().length<2||value.trim().length>120||/[\u0000-\u001f]/.test(value)) invalid('Le nom doit contenir entre 2 et 120 caractères.');return value.trim(); }
export function password(value:unknown):string { if(typeof value!=='string'||value.length<12||value.length>128) invalid('Le mot de passe doit contenir entre 12 et 128 caractères.');return value; }
export function role(value:unknown):Role { if(!roles.includes(value as Role)) invalid('Rôle invalide.');return value as Role; }
export function id(value:unknown):string { if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) invalid();return value; }
export function token(value:unknown):string { if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value)) invalid('Lien invalide ou expiré.');return value; }
