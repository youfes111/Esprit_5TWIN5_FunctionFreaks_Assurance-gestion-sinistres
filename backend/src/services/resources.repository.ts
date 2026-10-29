import { AppError } from '../middleware/app-error.js';
import { isSelectResults, type SelectResults } from '../sparql/client.js';
import { validateUpdateEndpoint } from './claims.repository.js';
import type { StoreConfig } from './claims.repository.js';

export class ResourcesRepository {
  constructor(private readonly config:StoreConfig,private readonly transport:typeof fetch=fetch){
    validateUpdateEndpoint(config.queryEndpoint,config.updateEndpoint);
    if(!Number.isInteger(config.timeoutMs)||config.timeoutMs<1||config.timeoutMs>60000)throw new Error('Invalid RDF timeout.');
    if(config.enabled&&(!config.username||config.username.includes(':')||!config.password))throw new Error('Fuseki update credentials are required.');
  }
  async execute(query:string,write=false):Promise<SelectResults>{
    if(write&&!this.config.enabled)throw new AppError(403,'MUTATIONS_DISABLED','RDF mutations are disabled.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.config.timeoutMs);
    try{
      const headers:Record<string,string>={'Accept':'application/sparql-results+json','Content-Type':write?'application/sparql-update; charset=utf-8':'application/sparql-query; charset=utf-8'};
      if(write)headers.Authorization=`Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`;
      const response=await this.transport(write?this.config.updateEndpoint:this.config.queryEndpoint,{method:'POST',redirect:'error',headers,body:query,signal:controller.signal});
      if(!response.ok)throw new AppError(response.status===401||response.status===403?502:502,response.status===401||response.status===403?'FUSEKI_AUTH_FAILED':'RDF_HTTP_ERROR',response.status===401||response.status===403?'Le service RDF a refusé les identifiants de modification configurés.':'Le service RDF a refusé l’opération.');
      if(write){await response.body?.cancel();return {head:{vars:[]},results:{bindings:[]}};}
      const mime=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();if(!['application/json','application/sparql-results+json'].includes(mime??''))throw new AppError(502,'RDF_INVALID_RESPONSE','Format de réponse RDF invalide.');
      let body:unknown;try{body=await response.json();}catch{throw new AppError(502,'RDF_INVALID_RESPONSE','JSON RDF invalide.');}if(!isSelectResults(body))throw new AppError(502,'RDF_INVALID_RESPONSE','Résultats SELECT invalides.');return body;
    }catch(error){if(error instanceof AppError)throw error;if(write)throw new AppError(504,'MUTATION_OUTCOME_UNKNOWN','Résultat de modification incertain. Rechargez les données avant toute nouvelle tentative.');throw new AppError(controller.signal.aborted?504:502,controller.signal.aborted?'RDF_TIMEOUT':'RDF_UNAVAILABLE','Le service RDF est indisponible ou le délai est dépassé.');}
    finally{clearTimeout(timer);}
  }
}
