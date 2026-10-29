import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import type {Request,Response} from 'express';
import {AuthDatabase} from '../src/auth/database.js';
import {AuthService,digest} from '../src/auth/service.js';
import {authConfig,type AuthConfig} from '../src/auth/config.js';
import {passwordHasher,type PasswordHasher} from '../src/auth/password.js';
import {TurnstileVerifier} from '../src/auth/turnstile.js';
import {requireAuth,requirePermission,csrfProtection,csrfValue,cookieNames,setSession,authMiddleware,securityHeaders} from '../src/auth/middleware.js';
import {authRoutes,userRoutes} from '../src/auth/routes.js';
import {AppError} from '../src/middleware/app-error.js';
import {errorHandler} from '../src/middleware/error-handler.js';
const cleanups:(()=>void)[]=[];
afterEach(()=>{for(const cleanup of cleanups.splice(0))cleanup();});
const config:AuthConfig={databasePath:':memory:',origin:'http://127.0.0.1:5173',secureCookies:false,idleMs:1000,lifetimeMs:5000,turnstileSecret:'mock-secret',turnstileSiteKey:'mock-site',turnstileTestMode:false,hostname:'127.0.0.1',environment:'development'};
const hasher:PasswordHasher={hash:async(value)=>`mock:${digest(value)}`,verify:async(hash,value)=>hash===`mock:${digest(value)}`};
const pass='A long private password';
const code=(expected:string)=>(error:unknown)=>error instanceof AppError&&error.code===expected;
function fixture(){const directory=mkdtempSync(join(tmpdir(),'assurance-auth-test-')),path=join(directory,'auth.sqlite');const store=new AuthDatabase(path);let now=Date.parse('2026-10-26T12:00:00Z');const service=new AuthService(store,{...config,databasePath:path},hasher,()=>now);cleanups.push(()=>{store.close();assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'assurance-auth-test-'));rmSync(directory,{recursive:true,force:true});});return {store,service,path,tick:(ms:number)=>{now+=ms;}};}
async function admin(service:AuthService){return service.bootstrap('Initial Admin','Admin@Example.org',pass);}
const linkToken=(url:string)=>new URLSearchParams(new URL(url).hash.slice(1)).get('token')!;
function request(role?:'ADMIN'|'AGENT'|'VIEWER'){return {method:'POST',headers:{},auth:role?{user:{role}}:undefined,get:()=>undefined} as unknown as Request;}
async function runLoginHandler(service:AuthService,verifier:TurnstileVerifier,captchaToken:string,password=pass){
  const route=authRoutes(service,verifier).stack.find(layer=>layer.route?.path==='/login')!.route!;let body:unknown,sessionToken='';
  const req={body:{email:'admin@example.org',password,captchaToken},headers:{},ip:'127.0.0.1'} as Request;
  const res={json:(value:unknown)=>{body=value;},cookie:(_name:string,value:string)=>{sessionToken=value;}} as unknown as Response;
  await route.stack[0]!.handle(req,res,()=>{});return {body,sessionToken};
}

test('versioned migrations and users persist when a separate SQLite connection reopens the same temporary file',async()=>{
  const f=fixture();const user=await admin(f.service);const reopened=new AuthDatabase(f.path);try{assert.equal(reopened.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()!.n,1);assert.equal(reopened.db.prepare('SELECT email FROM users WHERE id=?').get(user.id)!.email,'admin@example.org');}finally{reopened.close();}
});
test('bootstrap creates one hashed administrator and refuses duplicates or overwrites',async()=>{const {service,store}=fixture();const user=await admin(service);assert.equal(user.role,'ADMIN');assert.ok(!('password_hash' in user));assert.notEqual(service.user(user.id)!.password_hash,pass);await assert.rejects(admin(service),code('ADMIN_EXISTS'));assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n,1);});
test('production hashing uses Argon2id with independent salts and verifies without plaintext storage',async()=>{const a=await passwordHasher.hash(pass),b=await passwordHasher.hash(pass);assert.match(a,/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);assert.notEqual(a,b);assert.ok(await passwordHasher.verify(a,pass));assert.equal(await passwordHasher.verify(a,'wrong'),false);});
test('login issues rotated opaque sessions, hashes stored tokens and records last login',async()=>{const {service,store}=fixture();const user=await admin(service);const first=await service.login('ADMIN@example.org',pass);const second=await service.login(user.email,pass,first.token);assert.notEqual(first.token,second.token);assert.equal(service.session(first.token),undefined);assert.ok(service.session(second.token));const row=store.db.prepare('SELECT token_hash FROM sessions').get()!;assert.equal(row.token_hash,digest(second.token));assert.notEqual(row.token_hash,second.token);assert.ok(second.user.lastLoginAt);assert.ok(!('token' in second.user));});
test('wrong password, unknown email, pending and disabled users share generic authentication failure and audits contain no secrets',async()=>{const {service,store}=fixture();const owner=await admin(service);for(const [email,password] of [[owner.email,'wrong'],['missing@example.org',pass]])await assert.rejects(service.login(email,password),code('INVALID_CREDENTIALS'));const pending=service.create(owner.id,{fullName:'Pending User',email:'pending@example.org'});await assert.rejects(service.login(pending.user.email,pass),code('INVALID_CREDENTIALS'));service.update(owner.id,pending.user.id,{status:'DISABLED'});await assert.rejects(service.login(pending.user.email,pass),code('INVALID_CREDENTIALS'));const events=JSON.stringify(store.db.prepare('SELECT * FROM audit_events').all());assert.ok(!events.includes(pass));assert.ok(events.includes('LOGIN_FAILED'));});
test('sessions enforce idle and absolute expiry and persistent logout revokes them',async()=>{const f=fixture();await admin(f.service);const a=await f.service.login('admin@example.org',pass);f.tick(1001);assert.equal(f.service.session(a.token),undefined);const b=await f.service.login('admin@example.org',pass);f.tick(5001);assert.equal(f.service.session(b.token),undefined);const c=await f.service.login('admin@example.org',pass);f.service.logout(c.token);assert.equal(f.service.session(c.token),undefined);});
test('role changes, disabling and password changes revoke active sessions',async()=>{const {service}=fixture();const owner=await admin(service);const created=service.create(owner.id,{fullName:'Agent User',email:'agent@example.org',role:'AGENT'});await service.activate({token:linkToken(created.activationUrl),password:pass});const login=await service.login(created.user.email,pass);service.update(owner.id,created.user.id,{role:'VIEWER'});assert.equal(service.session(login.token),undefined);const next=await service.login(created.user.email,pass);service.update(owner.id,created.user.id,{status:'DISABLED'});assert.equal(service.session(next.token),undefined);service.update(owner.id,created.user.id,{status:'ACTIVE'});const again=await service.login(created.user.email,pass);await service.changePassword(created.user.id,{currentPassword:pass,newPassword:'A different private password'});assert.equal(service.session(again.token),undefined);await assert.rejects(service.login(created.user.email,pass),code('INVALID_CREDENTIALS'));});
test('admin creation defaults to pending VIEWER, normalizes unique email and rejects invalid roles or self profile escalation',async()=>{const {service}=fixture();const owner=await admin(service);const result=service.create(owner.id,{fullName:'New User',email:' New@Example.org '});assert.equal(result.user.role,'VIEWER');assert.equal(result.user.status,'PENDING');assert.equal(result.user.createdBy,owner.id);assert.throws(()=>service.create(owner.id,{fullName:'Other User',email:'new@example.org'}),code('EMAIL_EXISTS'));assert.throws(()=>service.create(owner.id,{fullName:'Other User',email:'other@example.org',role:'ROOT'}),code('INVALID_AUTH_INPUT'));assert.throws(()=>service.profile(result.user.id,{fullName:'Name',role:'ADMIN'}),code('INVALID_AUTH_INPUT'));assert.throws(()=>service.list({role:['ADMIN']}),code('INVALID_AUTH_INPUT'));});
test('last active administrator cannot be disabled or demoted; safeguards remain transactional',async()=>{const {service}=fixture();const owner=await admin(service);assert.throws(()=>service.update(owner.id,owner.id,{status:'DISABLED'}),code('LAST_ADMIN'));assert.throws(()=>service.update(owner.id,owner.id,{role:'VIEWER'}),code('LAST_ADMIN'));const second=service.create(owner.id,{fullName:'Second Admin',email:'second@example.org',role:'ADMIN'});await service.activate({token:linkToken(second.activationUrl),password:pass});service.update(second.user.id,owner.id,{role:'AGENT'});assert.equal(service.user(owner.id)!.role,'AGENT');assert.throws(()=>service.update(second.user.id,second.user.id,{role:'VIEWER'}),code('LAST_ADMIN'));});
test('setup tokens are hashed, expire and are consumed atomically with replay prevention',async()=>{const f=fixture();const owner=await admin(f.service);const created=f.service.create(owner.id,{fullName:'New User',email:'new@example.org'}),token=linkToken(created.activationUrl);const stored=f.store.db.prepare('SELECT token_hash FROM account_tokens').get()!;assert.equal(stored.token_hash,digest(token));await f.service.activate({token,password:pass});await assert.rejects(f.service.activate({token,password:pass}),code('INVALID_ACCOUNT_LINK'));const next=f.service.create(owner.id,{fullName:'Expired User',email:'expired@example.org'});f.tick(3600001);await assert.rejects(f.service.activate({token:linkToken(next.activationUrl),password:pass}),code('INVALID_ACCOUNT_LINK'));});
test('admin resets invalidate previous links, revoke sessions and cannot activate disabled accounts',async()=>{const {service}=fixture();const owner=await admin(service),created=service.create(owner.id,{fullName:'New User',email:'new@example.org'});await service.activate({token:linkToken(created.activationUrl),password:pass});const session=await service.login(created.user.email,pass);const first=service.reset(owner.id,created.user.id),second=service.reset(owner.id,created.user.id);assert.equal(service.session(session.token),undefined);await assert.rejects(service.activate({token:linkToken(first.activationUrl),password:pass}),code('INVALID_ACCOUNT_LINK'));await service.activate({token:linkToken(second.activationUrl),password:'Reset private password'});await service.login(created.user.email,'Reset private password');const disabled=service.reset(owner.id,created.user.id);service.update(owner.id,created.user.id,{status:'DISABLED'});await assert.rejects(service.activate({token:linkToken(disabled.activationUrl),password:pass}),code('INVALID_ACCOUNT_LINK'));});
test('the remaining auth-operation limiter resets at its window while CAPTCHA replay is rejected',()=>{const f=fixture();f.service.rateLimit('other-auth-operation',2,1000);f.service.rateLimit('other-auth-operation',2,1000);let blocked:unknown;assert.throws(()=>f.service.rateLimit('other-auth-operation',2,1000),(error:unknown)=>{blocked=error;return code('AUTH_RATE_LIMIT')(error);});assert.equal((blocked as AppError).retryAfterSeconds,1);f.tick(1001);f.service.rateLimit('other-auth-operation',2,1000);f.service.useCaptcha('unique');assert.throws(()=>f.service.useCaptcha('unique'),code('CAPTCHA_INVALID'));});
test('login has no IP/email lockout after repeated failures; CAPTCHA verification and authentication still run',async()=>{
  const {service,store}=fixture();await admin(service);let verifications=0;
  const verifier=new TurnstileVerifier(config,async()=>{verifications++;return new Response(JSON.stringify({success:true,hostname:config.hostname,action:'login',challenge_ts:new Date().toISOString()}));});
  for(let attempt=0;attempt<20;attempt++)await assert.rejects(runLoginHandler(service,verifier,`unique-login-challenge-${attempt}`,'wrong password'),code('INVALID_CREDENTIALS'));
  assert.equal(verifications,20);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get()!.n,0);assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event='LOGIN_FAILED'").get()!.n,20);
});
test('successful logout clears the session cookie, revokes the database session and does not create rate limit records',async()=>{
  const {service,store}=fixture();await admin(service);const login=await service.login('admin@example.org',pass),routes=authRoutes(service);
  const route=routes.stack.find(layer=>layer.route?.path==='/logout')!.route!,req={auth:service.session(login.token)} as Request;
  let payload:unknown,cookieCleared=false;const res={clearCookie:()=>{cookieCleared=true;},json:(value:unknown)=>{payload=value;}} as unknown as Response;
  route.stack[0]!.handle(req,res,()=>route.stack[1]!.handle(req,res,()=>{}));
  assert.deepEqual(payload,{success:true,data:{loggedOut:true}});assert.ok(cookieCleared);assert.equal(service.session(login.token),undefined);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get()!.n,0);assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event='LOGOUT'").get()!.n,1);
});
test('session restoration does not consume login rate limits and 429 responses include Retry-After',()=>{
  const {store,service}=fixture();const meRoute=authRoutes(service).stack.find(layer=>layer.route?.path==='/me')!.route!;
  assert.throws(()=>meRoute.stack[0]!.handle({} as Request,{} as Response,()=>{}),code('AUTH_REQUIRED'));
  let retryAfter='';let status=0;const response={set:(name:string,value:string)=>{if(name==='Retry-After')retryAfter=value;},status:(value:number)=>{status=value;return response;},json:()=>response} as unknown as Response;
  errorHandler(new AppError(429,'AUTH_RATE_LIMIT','Trop de tentatives.',37),{} as Request,response,(()=>{}) as never);
  assert.equal(status,429);assert.equal(retryAfter,'37');assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get()!.n,0);
});
test('middleware distinguishes 401/403, ignores demo-token headers and rejects CSRF/origin mismatch',()=>{const res={} as Response;assert.throws(()=>requireAuth(request(),res,()=>{}),code('AUTH_REQUIRED'));assert.throws(()=>requirePermission('users:manage')(request('AGENT'),res,()=>{}),code('PERMISSION_DENIED'));let allowed=false;requirePermission('read')(request('VIEWER'),res,()=>{allowed=true;});assert.ok(allowed);const token='a'.repeat(64);const req={...request(),headers:{cookie:`${cookieNames(config).csrf}=${token}`},get:(name:string)=>name==='Origin'?config.origin:csrfValue(token)} as unknown as Request;assert.doesNotThrow(()=>csrfProtection(config)(req,res,()=>{}));req.get=()=>undefined;assert.throws(()=>csrfProtection(config)(req,res,()=>{}),code('CSRF_INVALID'));});
test('session middleware uses database state and secure cookies have explicit HTTPS protections',async()=>{const {service}=fixture();await admin(service);const login=await service.login('admin@example.org',pass);const req={headers:{cookie:`assurance-session=${login.token}`}} as Request;authMiddleware(service)(req,{} as Response,()=>{});assert.equal(req.auth?.user.role,'ADMIN');let options:Record<string,unknown>={};let name='';setSession({cookie:(key:string,_value:string,value:Record<string,unknown>)=>{name=key;options=value;}} as unknown as Response,{...config,secureCookies:true},login.token);assert.match(name,/^__Host-/);assert.equal(options.httpOnly,true);assert.equal(options.secure,true);assert.equal(options.sameSite,'strict');assert.equal(options.path,'/');assert.equal(options.domain,undefined);});
test('security headers refuse cross-origin requests; config parses origin and confines test keys to development/test',()=>{const req={get:(key:string)=>key==='Origin'?'https://evil.example':undefined} as Request;assert.throws(()=>securityHeaders(config)(req,{set:()=>{}} as unknown as Response,()=>{}),code('CROSS_SITE_REQUEST'));const parsed=authConfig({NODE_ENV:'development',APP_ORIGIN:'http://localhost:5173',TURNSTILE_TEST_MODE:'true',TURNSTILE_SITE_KEY:'1x00000000000000000000AA',TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA'});assert.equal(parsed.hostname,'localhost');assert.equal(parsed.environment,'development');assert.throws(()=>authConfig({NODE_ENV:'production',APP_ORIGIN:'https://app.example',TURNSTILE_TEST_MODE:'true'}));assert.throws(()=>authConfig({NODE_ENV:'production',APP_ORIGIN:'http://app.example'}));assert.throws(()=>authConfig({NODE_ENV:'production',APP_ORIGIN:'https://app.example',TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA'}));});
test('Turnstile verifies success metadata through an injected transport, with no real request',async()=>{const now=Date.now();let called=0;const verifier=new TurnstileVerifier(config,async(url,init)=>{called++;assert.equal(String(url),'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(init?.redirect,'error');return new Response(JSON.stringify({success:true,hostname:config.hostname,action:'login',challenge_ts:new Date(now).toISOString()}));},()=>now);await verifier.verify('challenge');assert.equal(called,1);});
const officialTestConfig=(changes:Partial<AuthConfig>={}):AuthConfig=>({...config,environment:'development',origin:'http://localhost:5173',hostname:'localhost',turnstileTestMode:true,turnstileSiteKey:'1x00000000000000000000AA',turnstileSecret:'1x0000000000000000000000000000000AA',...changes});
const siteverify=(result:unknown)=>async()=>new Response(JSON.stringify(result));
test('official passing test credentials require Siteverify success but allow test-specific hostname and missing action metadata',async()=>{
  const now=Date.parse('2026-10-26T12:00:00Z'),official=officialTestConfig();let calls=0;
  const verifier=new TurnstileVerifier(official,async(_url,init)=>{calls++;assert.equal(new URLSearchParams(String(init?.body)).get('response'),'XXXX.DUMMY.TOKEN.XXXX');return new Response(JSON.stringify({success:true,challenge_ts:new Date(now).toISOString(),hostname:'test-hostname'}));},()=>now,5000,()=>{});
  await verifier.verify('XXXX.DUMMY.TOKEN.XXXX');assert.equal(calls,1);
  await assert.rejects(new TurnstileVerifier(official,siteverify({success:false,'error-codes':['invalid-input-response']}),()=>now,5000,()=>{}).verify('XXXX.DUMMY.TOKEN.XXXX'),code('CAPTCHA_INVALID'));
});
test('official deterministic test token supports login, logout and a second successful Siteverify login',async()=>{
  const {service,store}=fixture();await admin(service);const now=Date.parse('2026-10-26T12:00:00Z');let siteverifyCalls=0;
  const verifier=new TurnstileVerifier(officialTestConfig(),async()=>{siteverifyCalls++;return new Response(JSON.stringify({success:true,hostname:'example.com',action:undefined,challenge_ts:'2020-01-01T00:00:00Z'}));},()=>now,5000,()=>{});
  const first=await runLoginHandler(service,verifier,'XXXX.DUMMY.TOKEN.XXXX');assert.ok(first.sessionToken);assert.equal(service.session(first.sessionToken)?.user.email,'admin@example.org');
  const logoutRoute=authRoutes(service).stack.find(layer=>layer.route?.path==='/logout')!.route!;
  const logoutReq={auth:service.session(first.sessionToken),headers:{}} as Request;let logoutBody:unknown;
  const logoutRes={clearCookie:()=>{},json:(value:unknown)=>{logoutBody=value;}} as unknown as Response;
  logoutRoute.stack[0]!.handle(logoutReq,logoutRes,()=>logoutRoute.stack[1]!.handle(logoutReq,logoutRes,()=>{}));
  assert.deepEqual(logoutBody,{success:true,data:{loggedOut:true}});assert.equal(service.session(first.sessionToken),undefined);
  const second=await runLoginHandler(service,verifier,'XXXX.DUMMY.TOKEN.XXXX');assert.ok(second.sessionToken);assert.equal(service.session(second.sessionToken)?.user.email,'admin@example.org');
  assert.notEqual(first.sessionToken,second.sessionToken);assert.equal(siteverifyCalls,2);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM captcha_uses').get()!.n,0);
});
test('successful official Siteverify test token can be verified repeatedly, including missing or stale challenge timestamps',async()=>{
  const now=Date.parse('2026-10-26T12:00:00Z');let calls=0;
  const verifier=new TurnstileVerifier(officialTestConfig(),async()=>{calls++;return new Response(JSON.stringify({success:true,hostname:'example.com',challenge_ts:'2020-01-01T00:00:00Z'}));},()=>now,5000,()=>{});
  assert.deepEqual(await verifier.verify('XXXX.DUMMY.TOKEN.XXXX'),{officialTestToken:true});
  assert.deepEqual(await verifier.verify('XXXX.DUMMY.TOKEN.XXXX'),{officialTestToken:true});assert.equal(calls,2);
  const missingTimestamp=new TurnstileVerifier(officialTestConfig(),siteverify({success:true,hostname:'example.com'}),()=>now,5000,()=>{});
  assert.deepEqual(await missingTimestamp.verify('XXXX.DUMMY.TOKEN.XXXX'),{officialTestToken:true});
});
test('development diagnostics report safe Siteverify metadata and never credentials or tokens',async()=>{
  const now=Date.parse('2026-10-26T12:00:00Z'),events:{event:string;details:Record<string,string|number>}[]=[];
  const verifier=new TurnstileVerifier(officialTestConfig(),siteverify({success:true,hostname:'test-hostname',challenge_ts:new Date(now).toISOString()}),()=>now,5000,(event,details)=>events.push({event,details}));
  await verifier.verify('secret-token-value');const details=events[0]!.details;
  assert.equal(details.siteverifySuccess,'true');assert.equal(details.expectedHostname,'localhost');assert.equal(details.returnedHostname,'test-hostname');assert.equal(details.expectedAction,'login');assert.equal(details.returnedAction,'missing');assert.equal(details.testModeEnabled,'true');assert.equal(details.officialTestPairRecognized,'true');
  const output=JSON.stringify(events);assert.ok(!output.includes('secret-token-value'));assert.ok(!output.includes('1x0000000000000000000000000000000AA'));
});
test('non-test validation requires exact hostname and login action, including production',async()=>{
  const production:AuthConfig={...config,environment:'production',origin:'https://app.example',secureCookies:true,hostname:'app.example'};
  await assert.rejects(new TurnstileVerifier(production,siteverify({success:true,hostname:'elsewhere.example',action:'login',challenge_ts:new Date().toISOString()})).verify('token'),code('CAPTCHA_INVALID'));
  await assert.rejects(new TurnstileVerifier(production,siteverify({success:true,hostname:'app.example',challenge_ts:new Date().toISOString()})).verify('token'),code('CAPTCHA_INVALID'));
  await assert.rejects(new TurnstileVerifier(config,siteverify({success:true,hostname:'elsewhere.example',action:'login',challenge_ts:new Date().toISOString()})).verify('token'),code('CAPTCHA_INVALID'));
  await assert.rejects(new TurnstileVerifier(config,siteverify({success:true,hostname:config.hostname,action:'wrong',challenge_ts:new Date().toISOString()})).verify('token'),code('CAPTCHA_INVALID'));
});
test('test metadata exception rejects incorrect key pairs, disabled test mode, replayed and invalid tokens',async()=>{
  const now=Date.parse('2026-10-26T12:00:00Z'),changed={success:true,hostname:'test-hostname',challenge_ts:new Date(now).toISOString()};
  await assert.rejects(new TurnstileVerifier(officialTestConfig({turnstileSecret:'2x0000000000000000000000000000000AA'}),siteverify(changed),()=>now,5000,()=>{}).verify('token'),code('CAPTCHA_INVALID'));
  await assert.rejects(new TurnstileVerifier(officialTestConfig({turnstileSiteKey:'2x00000000000000000000AB'}),siteverify(changed),()=>now,5000,()=>{}).verify('token'),code('CAPTCHA_INVALID'));
  await assert.rejects(new TurnstileVerifier(officialTestConfig({turnstileTestMode:false}),siteverify(changed),()=>now,5000,()=>{}).verify('token'),code('CAPTCHA_INVALID'));
  await assert.rejects(new TurnstileVerifier(officialTestConfig(),siteverify({success:false,'error-codes':['timeout-or-duplicate']}),()=>now,5000,()=>{}).verify('token'),code('CAPTCHA_INVALID'));
  await assert.rejects(new TurnstileVerifier(officialTestConfig(),siteverify({success:false,'error-codes':['invalid-input-response']}),()=>now,5000,()=>{}).verify('token'),code('CAPTCHA_INVALID'));
  assert.throws(()=>authConfig({NODE_ENV:'production',APP_ORIGIN:'https://localhost',TURNSTILE_TEST_MODE:'true',TURNSTILE_SITE_KEY:'1x00000000000000000000AA',TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA'}));
  assert.throws(()=>authConfig({NODE_ENV:'development',APP_ORIGIN:'http://localhost:5173',TURNSTILE_TEST_MODE:'false',TURNSTILE_SITE_KEY:'1x00000000000000000000AA',TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA'}));
});
test('real CAPTCHA tokens retain fresh timestamp and local one-use replay checks with exact diagnostics',async()=>{
  const {service}=fixture();await admin(service);const now=Date.parse('2026-10-26T12:00:00Z');
  const realConfig:AuthConfig={...config,turnstileTestMode:false,turnstileSiteKey:'configured-site',turnstileSecret:'configured-secret'};
  const events:string[]=[];const verifier=new TurnstileVerifier(realConfig,siteverify({success:true,hostname:config.hostname,action:'login',challenge_ts:new Date(now).toISOString()}),()=>now,5000,event=>events.push(event));
  await runLoginHandler(service,verifier,'real-token-once');
  await assert.rejects(runLoginHandler(service,verifier,'real-token-once'),code('CAPTCHA_INVALID'));assert.ok(events.includes('token_replayed'));
  const expired=new TurnstileVerifier(realConfig,siteverify({success:true,hostname:config.hostname,action:'login',challenge_ts:'2020-01-01T00:00:00Z'}),()=>now,5000,event=>events.push(event));
  await assert.rejects(expired.verify('expired-real-token'),code('CAPTCHA_INVALID'));assert.ok(events.includes('token_expired'));
  const invalidTimestamp=new TurnstileVerifier(realConfig,siteverify({success:true,hostname:config.hostname,action:'login'}),()=>now,5000,event=>events.push(event));
  await assert.rejects(invalidTimestamp.verify('invalid-date-token'),code('CAPTCHA_INVALID'));assert.ok(events.includes('invalid_challenge_timestamp'));
});
test('Turnstile rejects provider failures, stale production responses, missing token and unavailable transport',async()=>{for(const payload of [{success:false,'error-codes':['invalid-input-response']},{success:false,'error-codes':['timeout-or-duplicate']},{success:true,hostname:config.hostname,action:'login',challenge_ts:'2020-01-01'}])await assert.rejects(new TurnstileVerifier(config,siteverify(payload)).verify('token'),code('CAPTCHA_INVALID'));await assert.rejects(new TurnstileVerifier(config,async()=>{throw new Error('provider');}).verify('token'),code('CAPTCHA_UNAVAILABLE'));await assert.rejects(new TurnstileVerifier(config).verify(''),code('CAPTCHA_REQUIRED'));});
test('Siteverify diagnostics distinguish invalid tokens from provider configuration failures without logging secrets or tokens',async()=>{
  const events:{event:string;details:Record<string,string|number>}[]=[];const diagnostic=(event:string,details:Record<string,string|number>)=>events.push({event,details});
  await assert.rejects(new TurnstileVerifier(config,async()=>new Response(JSON.stringify({success:false,'error-codes':['invalid-input-secret']})),Date.now,5000,diagnostic).verify('sensitive-token'),code('CAPTCHA_UNAVAILABLE'));
  await assert.rejects(new TurnstileVerifier(config,async()=>new Response(JSON.stringify({success:false,'error-codes':['timeout-or-duplicate']})),Date.now,5000,diagnostic).verify('sensitive-token'),code('CAPTCHA_INVALID'));
  const log=JSON.stringify(events);assert.match(log,/invalid-input-secret/);assert.match(log,/timeout-or-duplicate/);assert.ok(!log.includes('sensitive-token'));assert.ok(!log.includes(config.turnstileSecret));
});
test('only authenticated administrators reach user-management handlers; no public registration route exists',()=>{const {service}=fixture();const routes=authRoutes(service);assert.ok(!routes.stack.some(layer=>layer.route?.path==='/register'));const adminRouter=userRoutes(service);assert.throws(()=>adminRouter.stack[0]!.handle(request('VIEWER'),{} as Response,()=>{}),code('PERMISSION_DENIED'));});
test('Turnstile timeouts abort the injected request and never accept a missing provider configuration',async()=>{
  let aborted=false;const transport:typeof fetch=(_url,init)=>new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));});});
  await assert.rejects(new TurnstileVerifier(config,transport,Date.now,5).verify('token'),code('CAPTCHA_UNAVAILABLE'));assert.ok(aborted);
  await assert.rejects(new TurnstileVerifier({...config,turnstileSecret:''},async()=>{throw new Error('must not call transport');}).verify('token'),code('CAPTCHA_UNCONFIGURED'));
});
test('login route composes verification, replay prevention, sessions and safe response DTOs with a mocked provider',async()=>{
  const {service,store}=fixture();await admin(service);
  const verifier=new TurnstileVerifier(config,async()=>new Response(JSON.stringify({success:true,hostname:config.hostname,action:'login',challenge_ts:new Date().toISOString()})));
  const route=authRoutes(service,verifier).stack.find(layer=>layer.route?.path==='/login')!.route!;
  let body:unknown;const cookies:string[]=[];const res={json:(value:unknown)=>{body=value;},cookie:(name:string)=>{cookies.push(name);}} as unknown as Response;
  const req={body:{email:'admin@example.org',password:pass,captchaToken:'unique-route-challenge'},headers:{},ip:'127.0.0.1'} as Request;
  await route.stack[0]!.handle(req,res,()=>{});
  assert.deepEqual(cookies,['assurance-session']);const output=JSON.stringify(body);assert.ok(output.includes('Initial Admin'));assert.ok(!output.includes('password_hash'));assert.ok(!output.includes('token'));assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n,1);
  await assert.rejects(async()=>route.stack[0]!.handle(req,res,()=>{}),code('CAPTCHA_INVALID'));
});
test('concurrent activation attempts consume only one token, and explicit admin recovery revokes sessions',async()=>{
  const {service}=fixture();const owner=await admin(service),created=service.create(owner.id,{fullName:'Concurrent User',email:'race@example.org'}),token=linkToken(created.activationUrl);
  const outcomes=await Promise.allSettled([service.activate({token,password:pass}),service.activate({token,password:pass})]);assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const login=await service.login(owner.email,pass);await service.recoverAdmin(owner.email,'Recovered private password');assert.equal(service.session(login.token),undefined);await service.login(owner.email,'Recovered private password');
});
test('session digests survive a database reopen and absolute expiry is enforced independently of idle timeout',async()=>{
  const f=fixture();await admin(f.service);const login=await f.service.login('admin@example.org',pass);
  const reopened=new AuthDatabase(f.path);
  try {const recovered=new AuthService(reopened,{...config,idleMs:10_000},hasher,()=>Date.parse('2026-10-26T12:00:00Z'));assert.ok(recovered.session(login.token));const expired=new AuthService(reopened,{...config,idleMs:10_000},hasher,()=>Date.parse('2026-10-26T12:00:06Z'));assert.equal(expired.session(login.token),undefined);}finally{reopened.close();}
});
test('disabled active users cannot log in with their correct former password, and invalid pagination arrays fail',async()=>{
  const {service}=fixture();const owner=await admin(service),created=service.create(owner.id,{fullName:'Disabled User',email:'disabled@example.org'});await service.activate({token:linkToken(created.activationUrl),password:pass});service.update(owner.id,created.user.id,{status:'DISABLED'});await assert.rejects(service.login(created.user.email,pass),code('INVALID_CREDENTIALS'));assert.throws(()=>service.list({page:['1']}),code('INVALID_AUTH_INPUT'));
});
