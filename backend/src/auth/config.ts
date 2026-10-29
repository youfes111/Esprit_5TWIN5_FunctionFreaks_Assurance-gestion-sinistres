import { resolve } from 'node:path';
import {fileURLToPath} from 'node:url';
const backendRoot=fileURLToPath(new URL('../../',import.meta.url));
export interface AuthConfig {
  databasePath:string; origin:string; secureCookies:boolean; idleMs:number; lifetimeMs:number;
  turnstileSecret:string; turnstileSiteKey:string; turnstileTestMode:boolean; hostname:string; environment:'development'|'test'|'production';
}
export function authConfig(source:NodeJS.ProcessEnv = process.env):AuthConfig {
  const configuredMode=source.NODE_ENV??'development';
  if(!['development','test','production'].includes(configuredMode))throw new Error('NODE_ENV must be development, test or production.');
  const mode=configuredMode as NonNullable<AuthConfig['environment']>;
  const production = mode === 'production';
  const origin = source.APP_ORIGIN ?? (production ? '' : 'http://127.0.0.1:5173');
  let url:URL; try { url = new URL(origin); } catch { throw new Error('APP_ORIGIN is required and must be an origin.'); }
  if (url.origin !== origin || url.username || url.password || !['http:','https:'].includes(url.protocol)) throw new Error('APP_ORIGIN must contain only a trusted HTTP(S) origin.');
  if (production && url.protocol !== 'https:') throw new Error('Production requires HTTPS.');
  const testMode = source.TURNSTILE_TEST_MODE === 'true';
  const secret = source.TURNSTILE_SECRET_KEY ?? '';
  const siteKey = source.TURNSTILE_SITE_KEY ?? '';
  const isTestKey = (key:string)=>/^[123]x0+/.test(key);
  if (production && (testMode || isTestKey(secret) || isTestKey(siteKey))) throw new Error('Turnstile test configuration is forbidden in production.');
  if (!testMode && (isTestKey(secret) || isTestKey(siteKey))) throw new Error('Test credentials require explicit TURNSTILE_TEST_MODE=true.');
  if (production && (!secret || !siteKey)) throw new Error('Production requires real Turnstile keys.');
  if (testMode && !['development','test'].includes(mode)) throw new Error('Turnstile test mode requires development or test.');
  return { databasePath:resolve(backendRoot,source.AUTH_DATABASE_PATH ?? '../.local/auth/auth.sqlite'), origin,
    secureCookies:url.protocol === 'https:', idleMs:30*60_000, lifetimeMs:8*60*60_000,
    turnstileSecret:secret,turnstileSiteKey:siteKey,turnstileTestMode:testMode,hostname:url.hostname,environment:mode };
}
