import { AppError } from '../middleware/app-error.js';
import type { AuthConfig } from './config.js';

type SiteverifyResult = {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  challenge_ts?: unknown;
  'error-codes'?: unknown;
};

const PASSING_TEST_SITE_KEY = '1x00000000000000000000AA';
const PASSING_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';
const INVALID_TOKEN_CODES = new Set(['invalid-input-response', 'timeout-or-duplicate']);

export class TurnstileVerifier {
  constructor(
    private readonly config:AuthConfig,
    private readonly transport:typeof fetch=fetch,
    private readonly now=Date.now,
    private readonly timeoutMs=5000,
    private readonly diagnose:(event:string,details:Record<string,string|number>)=>void=(event,details)=>console.warn(`[turnstile] ${event}`,details),
  ){}

  private diagnostic(event:string,result:SiteverifyResult|undefined,officialPassingTestPair:boolean,success:string,reason?:string) {
    // Metadata is emitted only in development. Never include the submitted token
    // or either key; Siteverify response fields are bounded before logging.
    if(this.config.environment!=='development')return;
    const safeField=(value:unknown)=>typeof value==='string'&&value.length<=253&&/^[a-zA-Z0-9._:-]+$/.test(value)?value:'missing';
    const details:Record<string,string|number>={
      siteverifySuccess:success,
      expectedHostname:this.config.hostname,
      returnedHostname:safeField(result?.hostname),
      expectedAction:'login',
      returnedAction:safeField(result?.action),
      testModeEnabled:String(this.config.turnstileTestMode),
      officialTestPairRecognized:String(officialPassingTestPair),
    };
    if(reason)details.reason=reason;
    this.diagnose(event,details);
  }

  recordReplay(officialPassingTestPair=false) {
    this.diagnostic('token_replayed',undefined,officialPassingTestPair,'true');
  }

  async verify(token:unknown):Promise<{officialTestToken:boolean}> {
    if(typeof token!=='string'||!token||token.length>2048)throw new AppError(400,'CAPTCHA_REQUIRED','Veuillez effectuer le contrôle de sécurité.');
    if(!this.config.turnstileSecret||!this.config.turnstileSiteKey)throw new AppError(503,'CAPTCHA_UNCONFIGURED','Le contrôle de sécurité doit être configuré par votre administrateur.');
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const officialPassingTestPair=(this.config.environment==='development'||this.config.environment==='test')
      && this.config.turnstileTestMode
      && this.config.turnstileSecret===PASSING_TEST_SECRET_KEY
      && this.config.turnstileSiteKey===PASSING_TEST_SITE_KEY;
    try {
      const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('SITEVERIFY_TIMEOUT'));},this.timeoutMs);});
      const operation=(async()=>{
        const response=await this.transport('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:this.config.turnstileSecret,response:token})});
        if(!response.ok)throw new Error(`SITEVERIFY_HTTP_${response.status}`);
        try {return await response.json() as SiteverifyResult;}
        catch {throw new Error('SITEVERIFY_INVALID_JSON');}
      })();
      const result=await Promise.race([operation,timeout]);
      const errorCodes=Array.isArray(result['error-codes'])
        ? result['error-codes'].filter((code):code is string=>typeof code==='string'&&/^[a-z-]{1,64}$/.test(code))
        : [];
      if(result.success!==true) {
        this.diagnostic('siteverify_failure',result,officialPassingTestPair,'false',errorCodes.length?errorCodes.join(','):'unspecified');
        if(errorCodes.includes('timeout-or-duplicate'))this.diagnostic('token_replayed',result,officialPassingTestPair,'false','timeout-or-duplicate');
        if(errorCodes.length>0&&errorCodes.every(code=>INVALID_TOKEN_CODES.has(code)))throw new AppError(400,'CAPTCHA_INVALID','Contrôle de sécurité invalide ou expiré. Réessayez.');
        throw new AppError(503,'CAPTCHA_UNAVAILABLE','Contrôle de sécurité indisponible. Réessayez plus tard.');
      }
      this.diagnostic('siteverify_success',result,officialPassingTestPair,'true');

      // Official test credentials can return test-specific or absent hostname/
      // action metadata. Siteverify success is still mandatory and this narrow
      // exception cannot be enabled by arbitrary keys or in production.
      if(!officialPassingTestPair&&(result.hostname!==this.config.hostname||result.action!=='login')) {
        this.diagnostic('metadata_mismatch',result,officialPassingTestPair,'true');
        throw new AppError(400,'CAPTCHA_INVALID','Contrôle de sécurité invalide ou expiré. Réessayez.');
      }
      if(!officialPassingTestPair) {
        const created=typeof result.challenge_ts==='string'?Date.parse(result.challenge_ts):NaN;
        if(!Number.isFinite(created)) {
          this.diagnostic('invalid_challenge_timestamp',result,officialPassingTestPair,'true');
          throw new AppError(400,'CAPTCHA_INVALID','Le contrôle de sécurité a une date invalide. Réessayez.');
        }
        if(this.now()-created>300_000) {
          this.diagnostic('token_expired',result,officialPassingTestPair,'true');
          throw new AppError(400,'CAPTCHA_INVALID','Le contrôle de sécurité a expiré. Réessayez.');
        }
        if(created>this.now()+30_000) {
          this.diagnostic('invalid_challenge_timestamp',result,officialPassingTestPair,'true');
          throw new AppError(400,'CAPTCHA_INVALID','Le contrôle de sécurité a une date invalide. Réessayez.');
        }
      }
      return {officialTestToken:officialPassingTestPair};
    } catch(error) {
      if(error instanceof AppError)throw error;
      const diagnostic=error instanceof Error?error.message:'SITEVERIFY_UNKNOWN_ERROR';
      this.diagnostic('siteverify_unavailable',undefined,officialPassingTestPair,'unavailable',/^SITEVERIFY_(?:TIMEOUT|HTTP_\d+|INVALID_JSON)$/.test(diagnostic)?diagnostic:'SITEVERIFY_NETWORK_ERROR');
      throw new AppError(503,'CAPTCHA_UNAVAILABLE','Contrôle de sécurité indisponible. Réessayez plus tard.');
    }
    finally {if(timer)clearTimeout(timer);}
  }
}
