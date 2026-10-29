import {useEffect,useRef,useState} from 'react';
import {Button} from '../../components/ui/button';
interface TurnstileClient {render(container:HTMLElement,options:Record<string,unknown>):string;remove(id:string):void}
declare global {interface Window {turnstile?:TurnstileClient}}
let scriptPromise:Promise<void>|null=null;
function loadScript(){
  if(window.turnstile)return Promise.resolve();
  if(!scriptPromise)scriptPromise=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
    const timer=setTimeout(()=>{script.remove();reject(new Error('Chargement du contrôle de sécurité expiré.'));},15000);
    script.onload=()=>{clearTimeout(timer);if(window.turnstile)resolve();else reject(new Error('Contrôle de sécurité indisponible.'));};script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Le contrôle de sécurité ne peut pas être chargé.'));};document.head.append(script);
  }).catch(error=>{scriptPromise=null;throw error;});
  return scriptPromise;
}
export function Turnstile({siteKey,onToken,resetKey}:{siteKey:string;onToken(token:string):void;resetKey:number}){
  const container=useRef<HTMLDivElement>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!siteKey)return;let cancelled=false,id:string|undefined;onToken('');setError('');
    void loadScript().then(()=>{if(cancelled||!container.current)return;id=window.turnstile!.render(container.current,{sitekey:siteKey,action:'login',theme:'auto',size:'flexible',callback:(token:string)=>onToken(token),'expired-callback':()=>{onToken('');setError('Contrôle expiré. Réessayez.');},'error-callback':()=>{onToken('');setError('Échec du contrôle de sécurité. Réessayez.');}});}).catch(error=>{if(!cancelled)setError(error.message);});
    return()=>{cancelled=true;if(id&&window.turnstile)window.turnstile.remove(id);};
  },[siteKey,onToken,resetKey,retry]);
  return <div className="turnstile-control"><div ref={container}/>{error&&<p role="alert">{error}<Button type="button" variant="link" onClick={()=>setRetry(value=>value+1)}>Réessayer</Button></p>}{!siteKey&&<p role="alert">Turnstile doit être configuré par votre administrateur.</p>}</div>;
}
