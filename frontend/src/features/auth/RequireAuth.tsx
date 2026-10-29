import {Navigate,Outlet,useLocation} from 'react-router-dom';
import {useAuth} from './AuthProvider';
import {DataState} from '../../components/DataState';
import {Button} from '../../components/ui/button';
export function safeReturnPath(value:unknown){return typeof value==='string'&&/^\/(?!\/)/.test(value)&&!/[\\\u0000-\u001f]/.test(value)&&!value.startsWith('/login')&&!value.startsWith('/activate')?value:'/';}
export function RequireAuth({admin=false}:{admin?:boolean}){
  const auth=useAuth(),location=useLocation();
  if(auth.loading)return <div className="auth-loading"><DataState loading /></div>;
  if(auth.error)return <div className="auth-loading"><DataState error={auth.error}/><Button onClick={()=>void auth.reload()}>Réessayer</Button></div>;
  if(!auth.user)return <Navigate to="/login" replace state={{from:safeReturnPath(location.pathname+location.search)}}/>;
  if(admin&&auth.user.role!=='ADMIN')return <div className="detail-card"><h1>Accès réservé aux administrateurs</h1><p>Votre rôle ne permet pas de gérer les utilisateurs.</p></div>;
  return <Outlet/>;
}
