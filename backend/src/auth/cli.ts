import { createInterface } from 'node:readline/promises';
import { AuthDatabase } from './database.js';
import { authConfig } from './config.js';
import { AuthService } from './service.js';
import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../../.env',import.meta.url)),quiet:true});
function hiddenPassword(prompt:string):Promise<string> {
  return new Promise((resolve,reject)=>{
    let value='';process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();
    const finish=()=>{process.stdin.off('data',read);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
    const read=(chunk:Buffer)=>{for(const char of chunk.toString('utf8')){
      if(char==='\u0003'){finish();reject(new Error('Opération annulée.'));return;}
      if(char==='\r'||char==='\n'){finish();resolve(value);return;}
      if(char==='\u007f'||char==='\b')value=Array.from(value).slice(0,-1).join('');
      else if(char>=' '){if(value.length>=1024){finish();reject(new Error('Mot de passe trop long.'));return;}value+=char;}
    }};process.stdin.on('data',read);
  });
}
async function main(){
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Un terminal interactif privé est requis.');
  const config=authConfig();const store=new AuthDatabase(config.databasePath);
  try {
    if(process.argv.includes('--migrate')){console.log('Migrations appliquées.');return;}
    const recovery=process.argv.includes('--recover');
    const input=createInterface({input:process.stdin,output:process.stdout});
    let fullName='',email='';
    try {if(!recovery)fullName=await input.question('Nom complet : ');email=await input.question('Email administrateur : ');}finally{input.close();}
    const password=await hiddenPassword('Mot de passe (12–128 caractères, saisie masquée) : ');
    const confirmation=await hiddenPassword('Confirmer le mot de passe : ');
    if(password!==confirmation)throw new Error('Les mots de passe ne correspondent pas.');
    const service=new AuthService(store,config);
    if(recovery)await service.recoverAdmin(email,password);else await service.bootstrap(fullName,email,password);
    console.log(recovery?'Accès administrateur rétabli, sessions révoquées.':'Administrateur créé. Aucun mot de passe affiché.');
  }finally{store.close();}
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Opération impossible.');process.exitCode=1;});
