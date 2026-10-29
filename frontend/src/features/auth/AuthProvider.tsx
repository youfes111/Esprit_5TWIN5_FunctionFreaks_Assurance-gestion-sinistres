import {createContext,useContext,useEffect,useState,useCallback,useRef} from 'react';
import type {ReactNode} from 'react';
import {authApi} from '../../services/auth';
import {ApiError,resetCsrf} from '../../services/api';
import type {AppUser} from '../../types/auth';
export interface AuthState {user:AppUser|null;loading:boolean;error:string;reload():Promise<void>;setUser(user:AppUser|null):void;logout():Promise<void>}
export const AuthContext=createContext<AuthState|null>(null);
export function AuthProvider({children,client=authApi}:{children:ReactNode;client?:Pick<typeof authApi,'me'|'logout'>}) {
  const [user,setUserState]=useState<AppUser|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const authRevision=useRef(0);
  const setUser=useCallback((value:AppUser|null)=>{authRevision.current++;setUserState(value);setError('');setLoading(false);},[]);
  const reload=useCallback(async()=>{const revision=authRevision.current;setLoading(true);setError('');try{const current=await client.me();if(revision===authRevision.current)setUserState(current);}catch(error){if(revision===authRevision.current){setUserState(null);if(!(error instanceof ApiError&&error.status===401))setError('Session indisponible. Vérifiez la connexion au serveur.');}}finally{if(revision===authRevision.current)setLoading(false);}},[client]);
  useEffect(()=>{void reload();const expired=()=>{authRevision.current++;setUserState(null);setError('');setLoading(false);resetCsrf();};window.addEventListener('assurance-session-expired',expired);return()=>window.removeEventListener('assurance-session-expired',expired);},[reload]);
  const logout=useCallback(async()=>{await client.logout();setUser(null);},[client,setUser]);
  return <AuthContext.Provider value={{user,loading,error,reload,setUser,logout}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('AuthProvider is required.');return value;}
