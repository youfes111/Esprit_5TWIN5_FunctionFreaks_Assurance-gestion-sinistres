import { hash, verify, Algorithm } from '@node-rs/argon2';
export interface PasswordHasher { hash(value:string):Promise<string>; verify(hash:string,value:string):Promise<boolean> }
export const passwordHasher:PasswordHasher = {
  hash:(value)=>hash(value,{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1,outputLen:32}),
  verify:async(encoded,value)=>{try{return await verify(encoded,value);}catch{return false;}},
};
