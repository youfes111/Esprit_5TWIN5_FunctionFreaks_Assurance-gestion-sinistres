import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, RequestHandler } from 'express';
import { AppError } from '../middleware/app-error.js';
import { digest, type AuthService } from './service.js';
import { hasPermission, type Permission, type Role } from './types.js';
import type { AuthConfig } from './config.js';
export function cookieNames(config:AuthConfig) {const prefix=config.secureCookies?'__Host-':'';return {session:`${prefix}assurance-session`,csrf:`${prefix}assurance-csrf`};}
export function readCookie(req:Request,name:string) {const matches=(req.headers.cookie??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));if(matches.length!==1)return;const value=matches[0]!.slice(name.length+1);return /^[a-f0-9]{64}$/.test(value)?value:undefined;}
export function setSession(res:Response,config:AuthConfig,token:string){res.cookie(cookieNames(config).session,token,{httpOnly:true,secure:config.secureCookies,sameSite:'strict',path:'/',maxAge:config.lifetimeMs});}
export function clearSession(res:Response,config:AuthConfig){res.clearCookie(cookieNames(config).session,{httpOnly:true,secure:config.secureCookies,sameSite:'strict',path:'/'});}
export const requireAuth:RequestHandler=(req,_res,next)=>{if(!req.auth)throw new AppError(401,'AUTH_REQUIRED','Veuillez vous connecter.');next();};
export function requirePermission(permission:Permission):RequestHandler {return(req,res,next)=>{requireAuth(req,res,()=>{if(!hasPermission(req.auth!.user.role,permission))throw new AppError(403,'PERMISSION_DENIED','Accès non autorisé.');next();});};}
export function requireRole(...roles:Role[]):RequestHandler{return(req,res,next)=>{requireAuth(req,res,()=>{if(!roles.includes(req.auth!.user.role))throw new AppError(403,'PERMISSION_DENIED','Accès non autorisé.');next();});};}
export function authMiddleware(service:AuthService):RequestHandler{return(req,_res,next)=>{req.auth=service.session(readCookie(req,cookieNames(service.config).session));next();};}
export function securityHeaders(config:AuthConfig):RequestHandler {return(req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
  if(config.secureCookies)res.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  if(req.get('Sec-Fetch-Site')==='cross-site')throw new AppError(403,'CROSS_SITE_REQUEST','Origine non autorisée.');
  const origin=req.get('Origin');if(origin&&origin!==config.origin)throw new AppError(403,'CROSS_SITE_REQUEST','Origine non autorisée.');
  next();
};}
export const csrfValue=(token:string)=>digest('assurance-csrf:'+token);
export function issueCsrf(req:Request,res:Response,config:AuthConfig) {
  let source=req.auth?.token??readCookie(req,cookieNames(config).csrf);
  if(!source){source=randomBytes(32).toString('hex');res.cookie(cookieNames(config).csrf,source,{httpOnly:true,secure:config.secureCookies,sameSite:'strict',path:'/',maxAge:60*60_000});}
  return csrfValue(source);
}
export function csrfProtection(config:AuthConfig):RequestHandler {return(req,_res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method)){next();return;}
  const source=req.auth?.token??readCookie(req,cookieNames(config).csrf),supplied=req.get('x-csrf-token')??'';
  if(req.get('Origin')!==config.origin||!source||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(csrfValue(source)),Buffer.from(supplied)))throw new AppError(403,'CSRF_INVALID','Session de sécurité expirée. Rechargez la page.');
  next();
};}
