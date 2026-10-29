import type { ApiResponse, Health, OntologySummary } from '../types/api';

const baseUrl = (import.meta.env?.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
export class ApiError extends Error { constructor(message:string,readonly status:number,readonly code:string){super(message);} }
let csrfToken='';
let csrfRequest:Promise<{csrfToken:string;siteKey:string}>|null=null;
export function resetCsrf(){csrfToken='';csrfRequest=null;}
export function securityContext():Promise<{csrfToken:string;siteKey:string}> {
  if(csrfRequest)return csrfRequest;
  csrfRequest=(async()=>{
    const response=await fetch(`${baseUrl}/auth/csrf`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
    const body=await response.json();if(!response.ok||!body.success)throw new Error('Initialisation de sécurité impossible.');
    csrfToken=body.data.csrfToken;return body.data;
  })().catch(error=>{csrfRequest=null;throw error;});return csrfRequest;
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(30000);
  const headers=new Headers(options.headers);
  if(!['GET','HEAD'].includes(options.method??'GET')) {if(!csrfToken)await securityContext();headers.set('x-csrf-token',csrfToken);}
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers,credentials:'same-origin',cache:'no-store', signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
  let body: ApiResponse<T>;
  try { body = await response.json() as ApiResponse<T>; }
  catch { throw new Error(`Réponse serveur invalide (${response.status}).`); }
  if (!body.success) {
    const expectedUnauthenticated=['/auth/me','/auth/login','/auth/activate'].some(route=>path===route);
    if(response.status===401&&!expectedUnauthenticated&&typeof window!=='undefined')window.dispatchEvent(new Event('assurance-session-expired'));
    if(body.error.code==='CSRF_INVALID')resetCsrf();
    throw new ApiError(body.error.message,response.status,body.error.code);
  }
  if (!response.ok) throw new Error(`Le serveur a répondu avec le code ${response.status}.`);
  return body.data;
}
export const api = {
  health: (signal?: AbortSignal) => request<Health>('/health', { signal }),
  summary: (signal?: AbortSignal) => request<OntologySummary>('/ontology/summary', { signal }),
};
