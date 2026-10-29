import {createElement} from 'react';
import type {ReactNode} from 'react';
import {AuthContext} from '../src/features/auth/AuthProvider';
import type {AppUser} from '../src/types/auth';
export const viewer:AppUser={id:'00000000-0000-4000-8000-000000000001',fullName:'Test Viewer',email:'viewer@example.org',role:'VIEWER',status:'ACTIVE',createdAt:'2026-10-26T00:00:00Z',updatedAt:'2026-10-26T00:00:00Z',lastLoginAt:null,createdBy:null};
export function authFixture(child:ReactNode,user:AppUser|null=viewer,loading=false){return createElement(AuthContext.Provider,{value:{user,loading,error:'',reload:async()=>{},setUser:()=>{},logout:async()=>{}}},child);}
