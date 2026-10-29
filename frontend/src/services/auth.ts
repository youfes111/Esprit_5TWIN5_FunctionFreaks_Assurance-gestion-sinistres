import { request,resetCsrf } from './api';
import type { AppUser, SetupLink, UserPage, UserInput } from '../types/auth';
const json=(body:unknown)=>({headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
let meRequest:Promise<AppUser>|null=null;
function invalidateSessionCache(){meRequest=null;resetCsrf();}
export const authApi={
  me:()=>{if(!meRequest){const pending=request<AppUser>('/auth/me');const tracked=pending.finally(()=>{if(meRequest===tracked)meRequest=null;});meRequest=tracked;}return meRequest;},
  login:async(email:string,password:string,captchaToken:string)=>{const user=await request<AppUser>('/auth/login',{method:'POST',...json({email,password,captchaToken})});invalidateSessionCache();return user;},
  logout:async()=>{await request('/auth/logout',{method:'POST'});invalidateSessionCache();},
  activate:async(token:string,password:string)=>request('/auth/activate',{method:'POST',...json({token,password})}),
  profile:(fullName:string)=>request<AppUser>('/auth/profile',{method:'PATCH',...json({fullName})}),
  changePassword:async(currentPassword:string,newPassword:string)=>{await request('/auth/change-password',{method:'POST',...json({currentPassword,newPassword})});resetCsrf();},
  users:(query:URLSearchParams)=>request<UserPage>(`/admin/users?${query}`),
  createUser:(input:UserInput)=>request<{user:AppUser}&SetupLink>('/admin/users',{method:'POST',...json(input)}),
  updateUser:(id:string,input:Partial<UserInput>&{status?:string})=>request<AppUser>(`/admin/users/${encodeURIComponent(id)}`,{method:'PATCH',...json(input)}),
  setupPassword:(id:string)=>request<SetupLink>(`/admin/users/${encodeURIComponent(id)}/password-setup`,{method:'POST'}),
};
