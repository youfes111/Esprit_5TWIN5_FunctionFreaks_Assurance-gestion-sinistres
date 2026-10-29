import {useState} from 'react';
import {Link} from 'react-router-dom';
import {LogOut,UserRound,Settings,ChevronUp} from 'lucide-react';
import {useAuth} from '../features/auth/AuthProvider';
import {Button} from './ui/button';
import {DataState} from './DataState';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from './ui/dropdown-menu';
export function UserMenu({collapsed=false}:{collapsed?:boolean}){
  const auth=useAuth(),[busy,setBusy]=useState(false),[error,setError]=useState('');if(!auth.user)return null;
  const initials=auth.user.fullName.split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  async function logout(){if(busy)return;setBusy(true);setError('');try{await auth.logout();}catch{setError('Déconnexion impossible. Réessayez.');}finally{setBusy(false);}}
  return <div className="sidebar-user"><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" className="sidebar-user-trigger" aria-label={`Compte de ${auth.user.fullName}, ${auth.user.role}`} title={collapsed?`${auth.user.fullName} · ${auth.user.role}`:undefined}><span className="project-monogram">{initials}</span>{!collapsed&&<><span className="sidebar-user-copy"><strong>{auth.user.fullName}</strong><small>{auth.user.role}</small></span><ChevronUp size={14}/></>}</Button></DropdownMenuTrigger><DropdownMenuContent side="top" align="start"><DropdownMenuItem asChild><Link to="/profile"><UserRound/>Mon profil</Link></DropdownMenuItem><DropdownMenuItem asChild><Link to="/profile"><Settings/>Changer mon mot de passe</Link></DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem disabled={busy} onSelect={()=>void logout()}><LogOut/>{busy?'Déconnexion…':'Se déconnecter'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>{error&&<DataState error={error}/>}</div>;
}
