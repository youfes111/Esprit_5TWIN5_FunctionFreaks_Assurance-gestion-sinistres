import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '../middleware/app-error.js';
import { AuthDatabase } from './database.js';
import { passwordHasher, type PasswordHasher } from './password.js';
import type { AuthConfig } from './config.js';
import { publicUser, type UserRow, type Role, type AuthSession } from './types.js';
import * as validate from './validation.js';
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const randomToken=()=>randomBytes(32).toString('hex');
const denied=()=>new AppError(401,'INVALID_CREDENTIALS','Email ou mot de passe incorrect.');
const badLink=()=>new AppError(400,'INVALID_ACCOUNT_LINK','Lien invalide ou expiré.');
type AccountToken = {user_id:string;purpose:'ACTIVATE'|'RESET';expires_at:number};

export class AuthService {
  private readonly dummy:Promise<string>;
  constructor(readonly store:AuthDatabase,readonly config:AuthConfig,private readonly hasher:PasswordHasher=passwordHasher,private readonly now=Date.now) { this.dummy=hasher.hash(randomToken()); }
  user(id:string):UserRow|undefined {return this.store.db.prepare('SELECT * FROM users WHERE id=?').get(id) as unknown as UserRow|undefined;}
  private byEmail(email:string) {return this.store.db.prepare('SELECT * FROM users WHERE email=?').get(email) as unknown as UserRow|undefined;}
  async bootstrap(fullName:unknown,email:unknown,password:unknown) {
    const fields={name:validate.name(fullName),email:validate.email(email),password:validate.password(password)};
    const hash=await this.hasher.hash(fields.password);
    return this.store.transaction(()=>{
      if(this.store.db.prepare("SELECT id FROM users WHERE role='ADMIN' LIMIT 1").get()) throw new AppError(409,'ADMIN_EXISTS','Un administrateur existe déjà. Utilisez la procédure de récupération.');
      if(this.byEmail(fields.email)) throw new AppError(409,'EMAIL_EXISTS','Cette adresse est déjà utilisée.');
      const id=randomUUID(),now=this.now();
      this.store.db.prepare("INSERT INTO users(id,full_name,email,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,'ADMIN','ACTIVE',?,?)").run(id,fields.name,fields.email,hash,now,now);
      this.store.audit('ADMIN_BOOTSTRAPPED',id,id,now);return publicUser(this.user(id)!);
    });
  }
  async recoverAdmin(email:unknown,password:unknown) {
    const address=validate.email(email),hash=await this.hasher.hash(validate.password(password));
    this.store.transaction(()=>{
      const user=this.byEmail(address); if(!user||user.role!=='ADMIN') throw new AppError(404,'ADMIN_NOT_FOUND','Administrateur introuvable.');
      this.store.db.prepare("UPDATE users SET password_hash=?,status='ACTIVE',updated_at=? WHERE id=?").run(hash,this.now(),user.id);
      this.revoke(user.id);this.store.db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(user.id);this.store.audit('ADMIN_RECOVERED',user.id,user.id,this.now());
    });
  }
  async login(email:unknown,password:unknown,previousToken?:string) {
    const address=validate.email(email);
    if(typeof password!=='string'||password.length>128||password.length===0) throw denied();
    const candidate=this.byEmail(address);
    const valid=await this.hasher.verify(candidate?.password_hash ?? await this.dummy,password);
    try {return this.store.transaction(()=>{
      const user=candidate&&this.user(candidate.id);
      if(!valid||!user||user.status!=='ACTIVE'||user.password_hash!==candidate?.password_hash) throw denied();
      const token=randomToken(),now=this.now();
      if(previousToken) this.logout(previousToken);
      this.store.db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(digest(token),user.id,now,now,now+this.config.lifetimeMs);
      this.store.db.prepare('UPDATE users SET last_login_at=?,updated_at=? WHERE id=?').run(now,now,user.id);
      this.store.audit('LOGIN_SUCCEEDED',user.id,user.id,now);
      return {token,user:publicUser(this.user(user.id)!)};
    });}catch(error){if(error instanceof AppError&&error.code==='INVALID_CREDENTIALS')this.store.audit('LOGIN_FAILED',null,candidate?.id??null,this.now());throw error;}
  }
  session(token:string|undefined):AuthSession|undefined {
    if(!token||!/^[a-f0-9]{64}$/.test(token))return;
    const tokenHash=digest(token),now=this.now();
    const session=this.store.db.prepare('SELECT user_id,last_seen_at,expires_at FROM sessions WHERE token_hash=?').get(tokenHash) as {user_id:string;last_seen_at:number;expires_at:number}|undefined;
    if(!session)return;
    const user=this.user(session.user_id);
    if(!user||user.status!=='ACTIVE'||session.expires_at<=now||session.last_seen_at+this.config.idleMs<=now) {this.store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);return;}
    if(now-session.last_seen_at>=60_000)this.store.db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(now,tokenHash);
    return {user,token,tokenHash};
  }
  logout(token:string) {const hash=digest(token);const row=this.store.db.prepare('SELECT user_id FROM sessions WHERE token_hash=?').get(hash);this.store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash);if(row)this.store.audit('LOGOUT',String(row.user_id),String(row.user_id),this.now());}
  revoke(userId:string){this.store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);}
  rateLimit(key:string,limit=15,windowMs=15*60_000) {
    const now=this.now(),bucket=digest(key);
    this.store.transaction(()=>{
      this.store.db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now);
      this.store.db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1').run(bucket,now+windowMs);
      const row=this.store.db.prepare('SELECT attempts,expires_at FROM rate_limits WHERE bucket=?').get(bucket)! as {attempts:number;expires_at:number};
      if(Number(row.attempts)>limit) throw new AppError(429,'AUTH_RATE_LIMIT','Trop de tentatives. Réessayez dans quelques minutes.',Math.max(1,Math.ceil((row.expires_at-now)/1000)));
    });
  }
  useCaptcha(token:string) {
    this.store.db.prepare('DELETE FROM captcha_uses WHERE expires_at<=?').run(this.now());
    try{this.store.db.prepare('INSERT INTO captcha_uses VALUES (?,?)').run(digest(token),this.now()+5*60_000);}catch{throw new AppError(400,'CAPTCHA_INVALID','Le contrôle de sécurité a déjà été utilisé. Réessayez.');}
  }
  list(query:Record<string,unknown>) {
    const allowed=['search','role','status','page'];if(Object.keys(query).some(key=>!allowed.includes(key)))validate.invalid();
    const pageValue=query.page??'1';if(typeof pageValue!=='string'||!/^\d{1,6}$/.test(pageValue))validate.invalid();
    const search=query.search??'',role=query.role??'',status=query.status??'',page=Number(pageValue);
    if(typeof search!=='string'||search.length>120||typeof role!=='string'||typeof status!=='string'||!Number.isSafeInteger(page)||page<1||page>100000)validate.invalid();
    if(role)validate.role(role);if(status&&!['ACTIVE','PENDING','DISABLED'].includes(status))validate.invalid();
    const where='WHERE (instr(lower(full_name),?)>0 OR instr(email,?)>0) AND (?=\'\' OR role=?) AND (?=\'\' OR status=?)';
    const values=[search.toLowerCase(),search.toLowerCase(),role,role,status,status];
    const rows=this.store.db.prepare(`SELECT * FROM users ${where} ORDER BY created_at DESC,id LIMIT 20 OFFSET ?`).all(...values,(page-1)*20) as unknown as UserRow[];
    return {items:rows.map(publicUser),page,pageSize:20,total:Number(this.store.db.prepare(`SELECT COUNT(*) AS n FROM users ${where}`).get(...values)!.n)};
  }
  create(actor:string,input:unknown) {
    const body=validate.object(input,['fullName','email','role']);const fullName=validate.name(body.fullName),email=validate.email(body.email),role=body.role===undefined?'VIEWER':validate.role(body.role);
    return this.store.transaction(()=>{
      if(this.byEmail(email))throw new AppError(409,'EMAIL_EXISTS','Cette adresse est déjà utilisée.');
      const id=randomUUID(),now=this.now();this.store.db.prepare('INSERT INTO users(id,full_name,email,role,created_at,updated_at,created_by) VALUES (?,?,?,?,?,?,?)').run(id,fullName,email,role,now,now,actor);
      this.store.audit('USER_CREATED',actor,id,now);return {user:publicUser(this.user(id)!),...this.issueToken(actor,id)};
    });
  }
  private guardLastAdmin(user:UserRow,role:Role,status:string) {
    if(user.role==='ADMIN'&&user.status==='ACTIVE'&&(role!=='ADMIN'||status!=='ACTIVE')) {
      const count=Number(this.store.db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='ADMIN' AND status='ACTIVE'").get()!.n);
      if(count<=1)throw new AppError(409,'LAST_ADMIN','Le dernier administrateur actif doit être conservé.');
    }
  }
  update(actor:string,id:string,input:unknown) {
    validate.id(id);const body=validate.object(input,['fullName','email','role','status']);
    return this.store.transaction(()=>{
      const user=this.user(id);if(!user)throw new AppError(404,'USER_NOT_FOUND','Compte introuvable.');
      const name=body.fullName===undefined?user.full_name:validate.name(body.fullName),email=body.email===undefined?user.email:validate.email(body.email),role=body.role===undefined?user.role:validate.role(body.role);
      if(body.status!==undefined&&!['ACTIVE','DISABLED'].includes(String(body.status)))validate.invalid();
      const status=body.status===undefined?user.status:body.status==='ACTIVE'&&!user.password_hash?'PENDING':String(body.status);
      this.guardLastAdmin(user,role,status);const duplicate=this.byEmail(email);if(duplicate&&duplicate.id!==id)throw new AppError(409,'EMAIL_EXISTS','Cette adresse est déjà utilisée.');
      this.store.db.prepare('UPDATE users SET full_name=?,email=?,role=?,status=?,updated_at=? WHERE id=?').run(name,email,role,status,this.now(),id);
      if(role!==user.role||status!==user.status||email!==user.email)this.revoke(id);
      if(status==='DISABLED')this.store.db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(id);
      this.store.audit('USER_UPDATED',actor,id,this.now());
      if(role!==user.role)this.store.audit('ROLE_CHANGED',actor,id,this.now());
      if(status!==user.status)this.store.audit(status==='DISABLED'?'USER_DISABLED':'USER_REACTIVATED',actor,id,this.now());
      return publicUser(this.user(id)!);
    });
  }
  issueToken(actor:string,id:string) {
    const user=this.user(validate.id(id));if(!user||user.status==='DISABLED')throw new AppError(409,'ACCOUNT_UNAVAILABLE','Compte indisponible.');
    const purpose=user.status==='PENDING'?'ACTIVATE':'RESET',token=randomToken(),expiresAt=this.now()+60*60_000;
    this.store.db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(id);
    this.store.db.prepare('INSERT INTO account_tokens VALUES (?,?,?,?)').run(digest(token),id,purpose,expiresAt);
    if(purpose==='RESET')this.revoke(id);
    this.store.audit(purpose==='RESET'?'PASSWORD_RESET_INITIATED':'ACTIVATION_ISSUED',actor,id,this.now());
    return {activationUrl:`${this.config.origin}/activate#token=${token}`,expiresAt:new Date(expiresAt).toISOString()};
  }
  reset(actor:string,id:string){return this.store.transaction(()=>this.issueToken(actor,id));}
  async activate(input:unknown) {
    const body=validate.object(input,['token','password']);const token=validate.token(body.token),password=validate.password(body.password),hash=digest(token);
    const current=this.store.db.prepare('SELECT * FROM account_tokens WHERE token_hash=?').get(hash) as unknown as AccountToken|undefined;
    if(!current||current.expires_at<=this.now())throw badLink();
    const passwordHash=await this.hasher.hash(password);
    this.store.transaction(()=>{
      const row=this.store.db.prepare('SELECT * FROM account_tokens WHERE token_hash=?').get(hash) as unknown as AccountToken|undefined;
      const user=row&&this.user(row.user_id);
      if(!row||row.expires_at<=this.now()||!user||user.status==='DISABLED'||(row.purpose==='ACTIVATE'&&user.status!=='PENDING'))throw badLink();
      this.store.db.prepare("UPDATE users SET password_hash=?,status='ACTIVE',updated_at=? WHERE id=?").run(passwordHash,this.now(),user.id);
      this.store.db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(user.id);this.revoke(user.id);
      this.store.audit(row.purpose==='ACTIVATE'?'ACCOUNT_ACTIVATED':'PASSWORD_RESET',user.id,user.id,this.now());
    });
  }
  profile(userId:string,input:unknown){const body=validate.object(input,['fullName']);this.store.db.prepare('UPDATE users SET full_name=?,updated_at=? WHERE id=?').run(validate.name(body.fullName),this.now(),userId);this.store.audit('PROFILE_UPDATED',userId,userId,this.now());return publicUser(this.user(userId)!);}
  async changePassword(userId:string,input:unknown) {
    const body=validate.object(input,['currentPassword','newPassword']),user=this.user(userId),password=validate.password(body.newPassword);
    if(typeof body.currentPassword!=='string'||body.currentPassword.length>128||!user?.password_hash||!await this.hasher.verify(user.password_hash,body.currentPassword))throw denied();
    const hash=await this.hasher.hash(password);
    this.store.transaction(()=>{const current=this.user(userId);if(current?.password_hash!==user.password_hash||current.status!=='ACTIVE')throw denied();this.store.db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(hash,this.now(),userId);this.revoke(userId);this.store.db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(userId);this.store.audit('PASSWORD_CHANGED',userId,userId,this.now());});
  }
}
