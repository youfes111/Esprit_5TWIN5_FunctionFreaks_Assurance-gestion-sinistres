import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {ThemeProvider} from '../src/design/theme';
import {TooltipProvider} from '../src/components/ui/tooltip';
import {RequireAuth,safeReturnPath} from '../src/features/auth/RequireAuth';
import {AuthProvider} from '../src/features/auth/AuthProvider';
import {SidebarContent} from '../src/layouts/AppLayout';
import {LoginPage,ActivationPage} from '../src/pages/AuthPages';
import {UserMenu} from '../src/components/UserMenu';
import {authApi} from '../src/services/auth';
import {ApiError,request,resetCsrf} from '../src/services/api';
import {authFixture,viewer} from './auth-fixture';
const render=(node:ReturnType<typeof createElement>)=>renderToStaticMarkup(createElement(ThemeProvider,null,createElement(TooltipProvider,null,createElement(MemoryRouter,null,node))));
test('session loading and unauthenticated guards never render protected contents',()=>{
  const route=createElement(Routes,null,createElement(Route,{element:createElement(RequireAuth)},createElement(Route,{index:true,element:createElement('p',null,'PRIVATE_DATA')})));
  assert.ok(!render(authFixture(route,null,true)).includes('PRIVATE_DATA'));assert.ok(!render(authFixture(route,null)).includes('PRIVATE_DATA'));assert.ok(render(authFixture(route)).includes('PRIVATE_DATA'));
});
test('admin-only routing and navigation enforce viewer restrictions in presentation',()=>{
  const route=createElement(Routes,null,createElement(Route,{element:createElement(RequireAuth,{admin:true})},createElement(Route,{index:true,element:createElement('p',null,'ADMIN_ONLY')})));
  assert.ok(!render(authFixture(route)).includes('ADMIN_ONLY'));assert.ok(render(authFixture(route,{...viewer,role:'ADMIN'})).includes('ADMIN_ONLY'));
  const sidebar=createElement(SidebarContent,{channel:'test'});assert.ok(!render(authFixture(sidebar)).includes('href="/admin/users"'));assert.ok(render(authFixture(sidebar,{...viewer,role:'ADMIN'})).includes('href="/admin/users"'));
});
test('login has bounded labelled inputs, no signup, and activation has matching password fields',()=>{
  const html=render(authFixture(createElement(LoginPage),null));assert.match(html,/type="email"/);assert.match(html,/autocomplete="current-password"/i);assert.match(html,/Turnstile/);assert.match(html,/contactez votre administrateur/);assert.ok(!/href="\/(register|signup)"/.test(html));
  const setup=render(authFixture(createElement(ActivationPage),null));assert.match(setup,/minlength="12"/i);assert.match(setup,/new-password/);assert.match(setup,/Lien absent ou invalide/);
});
test('return destinations reject external and ambiguous URLs, while the user trigger identifies its account',()=>{
  for(const path of ['https://evil.example','//evil.example','/\\evil.example','/login','/activate#secret',null])assert.equal(safeReturnPath(path),'/');assert.equal(safeReturnPath('/sinistres?page=2'),'/sinistres?page=2');
  const html=render(authFixture(createElement(UserMenu,{collapsed:true})));assert.match(html,/Compte de Test Viewer, VIEWER/);assert.match(html,/TV/);
});
test('server rendering with an injected API client performs no authentication request',()=>{
  let calls=0;render(createElement(AuthProvider,{client:{me:async()=>{calls++;return viewer;},logout:async()=>{calls++;}},children:createElement('p',null,'SSR')}));assert.equal(calls,0);
});
test('login and logout use cookies and server-issued CSRF through mocked transports without localStorage',async()=>{
  const original=globalThis.fetch;resetCsrf();const calls:{url:string;options:RequestInit|undefined}[]=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify({success:true,data:String(url).endsWith('/csrf')?{csrfToken:'a'.repeat(64),siteKey:'mock-site'}:String(url).endsWith('/logout')?{loggedOut:true}:viewer}),{headers:{'Content-Type':'application/json'}});};
  try{await authApi.login(viewer.email,'private-password','mock-challenge');await authApi.logout();const login=calls.find(call=>call.url.endsWith('/login'))!;assert.equal(login.options?.credentials,'same-origin');assert.equal(new Headers(login.options?.headers).get('x-csrf-token'),'a'.repeat(64));assert.ok(String(login.options?.body).includes('mock-challenge'));assert.ok(calls.some(call=>call.url.endsWith('/logout')));}finally{globalThis.fetch=original;resetCsrf();}
});
test('concurrent session restoration deduplicates /me and treats its expected 401 silently',async()=>{
  const originalFetch=globalThis.fetch,windowDescriptor=Object.getOwnPropertyDescriptor(globalThis,'window'),fakeWindow=new EventTarget();let calls=0,expiredEvents=0;
  fakeWindow.addEventListener('assurance-session-expired',()=>{expiredEvents++;});Object.defineProperty(globalThis,'window',{configurable:true,value:fakeWindow});
  globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({success:false,error:{code:'AUTH_REQUIRED',message:'Veuillez vous connecter.'}}),{status:401,headers:{'Content-Type':'application/json'}});};
  try{const outcomes=await Promise.allSettled([authApi.me(),authApi.me()]);assert.equal(calls,1);assert.equal(expiredEvents,0);assert.ok(outcomes.every(outcome=>outcome.status==='rejected'&&outcome.reason instanceof ApiError&&outcome.reason.status===401));}
  finally{globalThis.fetch=originalFetch;if(windowDescriptor)Object.defineProperty(globalThis,'window',windowDescriptor);else Reflect.deleteProperty(globalThis,'window');}
});
test('API errors preserve server status and friendly 429 messages without adding a client lockout',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({success:false,error:{code:'AUTH_RATE_LIMIT',message:'Limite atteinte.'}}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'7'}});
  try{await assert.rejects(request('/auth/me'),(error:unknown)=>error instanceof ApiError&&error.status===429&&error.message==='Limite atteinte.');}finally{globalThis.fetch=original;}
});
