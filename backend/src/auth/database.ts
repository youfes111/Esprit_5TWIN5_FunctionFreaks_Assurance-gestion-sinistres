import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export class AuthDatabase {
  readonly db:DatabaseSync;
  constructor(path:string) {
    if(path !== ':memory:') mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
    const directory = fileURLToPath(new URL('../../migrations/',import.meta.url));
    for(const name of readdirSync(directory).filter(name=>/^\d+_[\w-]+\.sql$/.test(name)).sort()) {
      this.transaction(()=>{
        if(this.db.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name)) return;
        this.db.exec(readFileSync(new URL(name,new URL('../../migrations/',import.meta.url)),'utf8'));
        this.db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name,Date.now());
      });
    }
  }
  transaction<T>(work:()=>T):T { this.db.exec('BEGIN IMMEDIATE');try { const result=work(); this.db.exec('COMMIT');return result; } catch(error) { this.db.exec('ROLLBACK');throw error; } }
  audit(event:string,actor:string|null=null,subject:string|null=null,now=Date.now()) { this.db.prepare('INSERT INTO audit_events(actor_id,subject_id,event,created_at) VALUES (?,?,?,?)').run(actor,subject,event,now); }
  close() { this.db.close(); }
}
