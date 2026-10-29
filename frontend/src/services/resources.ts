import {request} from './api';
import type {ResourceInput,ResourceKind,ResourcePage,ResourceRecord} from '../types/resources';
const paths:Record<ResourceKind,string>={insured:'/insured',contract:'/contracts',expert:'/experts',damage:'/damages'};
const headers={'Content-Type':'application/json'};
export const resourcesApi={
 list:(kind:ResourceKind,params:URLSearchParams,signal?:AbortSignal)=>request<ResourcePage>(`${paths[kind]}?${params}`,{signal}),
 options:(kind:ResourceKind,signal?:AbortSignal)=>request<{items:{id:string;name:string}[];truncated:boolean;mutationsEnabled:boolean}>(`${paths[kind]}/options`,{signal}),
 get:(kind:ResourceKind,id:string,signal?:AbortSignal)=>request<ResourceRecord>(`${paths[kind]}/${encodeURIComponent(id)}`,{signal}),
 create:(kind:ResourceKind,input:ResourceInput)=>request<{id:string;revision:string}>(paths[kind],{method:'POST',headers,body:JSON.stringify(input)}),
 update:(kind:ResourceKind,id:string,input:Partial<ResourceInput>&{revision:string})=>request<{id:string;revision:string}>(`${paths[kind]}/${encodeURIComponent(id)}`,{method:'PATCH',headers,body:JSON.stringify(input)}),
 delete:(kind:ResourceKind,item:ResourceRecord)=>request<{id:string;deleted:boolean}>(`${paths[kind]}/${encodeURIComponent(item.id)}`,{method:'DELETE',headers:{...headers,'If-Match':`"${item.revision??''}"`}}),
};
