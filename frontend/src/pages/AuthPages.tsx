import {useCallback,useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {Navigate,Link,useLocation,useNavigate} from 'react-router-dom';
import {motion,useReducedMotion} from 'motion/react';
import {ShieldCheck,Eye,EyeOff,ArrowRight,Network,LockKeyhole} from 'lucide-react';
import {Card} from '../components/ui/card';
import {Button} from '../components/ui/button';
import {Input} from '../components/ui/input';
import {DataState} from '../components/DataState';
import {authApi} from '../services/auth';
import {securityContext} from '../services/api';
import {useAuth} from '../features/auth/AuthProvider';
import {Turnstile} from '../features/auth/Turnstile';
import {safeReturnPath} from '../features/auth/RequireAuth';
import {entrance} from '../design/motion';
function AuthFrame({title,description,children}:{title:string;description:string;children:ReactNode}){
  const reduce=useReducedMotion();return <main className="auth-page"><section className="auth-brand-panel"><div className="auth-wordmark"><ShieldCheck/>assurance</div><div className="auth-illustration" aria-hidden="true"><Network/><span/><span/><span/></div><div><p className="eyebrow">INTELLIGENCE · CONFIANCE · ASSURANCE</p><h1>Vos données reliées.<br/>Votre accès protégé.</h1><p>Un espace commun pour comprendre les sinistres et explorer le graphe d’assurance.</p></div><small>ESPRIT · Function Freaks · 5TWIN5</small></section><section className="auth-form-panel"><motion.div {...entrance(reduce)}><Card className="auth-card"><span className="metric-icon"><LockKeyhole/></span><h2>{title}</h2><p>{description}</p>{children}</Card></motion.div></section></main>;
}
export function LoginPage(){
  const auth=useAuth(),location=useLocation(),navigate=useNavigate();
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[captcha,setCaptcha]=useState(''),[siteKey,setSiteKey]=useState(''),[reset,setReset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const onToken=useCallback((token:string)=>setCaptcha(token),[]);
  useEffect(()=>{let active=true;void securityContext().then(data=>{if(active)setSiteKey(data.siteKey);}).catch(()=>{if(active)setError('La sécurité de connexion est indisponible. Réessayez après rechargement.');});return()=>{active=false;};},[]);
  const destination=safeReturnPath(location.state?.from);
  if(auth.user)return <Navigate to={destination} replace/>;
  async function submit(event:React.FormEvent){event.preventDefault();if(busy||!captcha)return;setBusy(true);setError('');try{const user=await authApi.login(email,password,captcha);setPassword('');auth.setUser(user);navigate(destination,{replace:true});}catch(error){setError(error instanceof Error?error.message:'Connexion impossible.');}finally{setBusy(false);setCaptcha('');setReset(value=>value+1);}}
  return <AuthFrame title="Bienvenue dans votre espace" description="Connectez-vous avec votre compte professionnel."><form className="auth-form" onSubmit={event=>void submit(event)}><label>Email<Input type="email" autoComplete="username" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/></label><label>Mot de passe<div className="password-field"><Input type={visible?'text':'password'} autoComplete="current-password" required maxLength={128} value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/><Button type="button" size="icon" variant="ghost" aria-label={visible?'Masquer le mot de passe':'Afficher le mot de passe'} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>{visible?<EyeOff/>:<Eye/>}</Button></div></label><Turnstile siteKey={siteKey} onToken={onToken} resetKey={reset}/><DataState error={error}/><Button type="submit" disabled={busy||!captcha||auth.loading}>{busy?'Connexion…':'Se connecter'}<ArrowRight size={16}/></Button><p className="auth-access-note">Pour obtenir un accès ou réinitialiser votre mot de passe, contactez votre administrateur.</p></form></AuthFrame>;
}
export function ActivationPage(){
  const [token]=useState(()=>new URLSearchParams(typeof window==='undefined'?'':window.location.hash.slice(1)).get('token')??'');
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  useEffect(()=>{window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);},[]);
  async function submit(event:React.FormEvent){event.preventDefault();if(busy)return;if(password!==confirm){setError('Les mots de passe ne correspondent pas.');return;}setBusy(true);setError('');try{await authApi.activate(token,password);setDone(true);setPassword('');setConfirm('');}catch(error){setError(error instanceof Error?error.message:'Activation impossible.');}finally{setBusy(false);}}
  return <AuthFrame title="Définir votre mot de passe" description="Ce lien confidentiel est personnel et utilisable une seule fois.">{done?<div role="status"><p>Votre mot de passe a été enregistré. Vous pouvez vous connecter.</p><Button asChild><Link to="/login">Aller à la connexion</Link></Button></div>:<form className="auth-form" onSubmit={event=>void submit(event)}>{!token&&<DataState error="Lien absent ou invalide. Contactez votre administrateur."/>}<label>Nouveau mot de passe<Input type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={password} onChange={event=>setPassword(event.target.value)}/></label><small>Entre 12 et 128 caractères. Une phrase longue et unique est recommandée.</small><label>Confirmer le mot de passe<Input type="password" minLength={12} maxLength={128} autoComplete="new-password" required value={confirm} onChange={event=>setConfirm(event.target.value)}/></label><DataState error={error}/><Button type="submit" disabled={busy||!token}>{busy?'Enregistrement…':'Enregistrer mon mot de passe'}</Button><Link to="/login">Retour à la connexion</Link></form>}</AuthFrame>;
}
