import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AppError} from '../src/middleware/app-error.js';
import {resourceInput,resourceQuery} from '../src/validators/resources.js';
import {ResourcesService} from '../src/services/resources.service.js';
import type {ResourceInput,ResourceKind} from '../src/types/resources.js';
import type {SelectResults,SparqlTerm} from '../src/sparql/client.js';
import {NS} from '../src/sparql/claims.queries.js';

const rev='11111111-1111-4111-8111-111111111111';
const inputs:Record<ResourceKind,ResourceInput>={
 insured:{id:'INS_NEW',name:'Assuré Test',email:'test@example.org',phone:'',address:''},
 contract:{id:'CON_NEW',name:'Contrat Test',identifier:'POL-1001',type:'Auto',status:'Actif',startDate:'2026-01-01',endDate:'2027-01-01',coverage:'Responsabilité civile',insuredId:'INS_NEW'},
 expert:{id:'EXP_NEW',name:'Expert Test',specialization:'Automobile',email:'',phone:'',availability:'Disponible'},
 damage:{id:'DAM_NEW',name:'Dommage Test',type:'Carrosserie',description:'Porte endommagée',amount:'120.50'},
};
const bad=(code:string)=>(error:unknown)=>error instanceof AppError&&error.code===code;
test('resource validation rejects malformed IDs, email, money, dates, references and unknown fields',()=>{
 assert.equal(resourceInput('insured',inputs.insured).name,'Assuré Test');
 assert.throws(()=>resourceInput('insured',{...inputs.insured,id:'../bad'}));
 assert.throws(()=>resourceInput('insured',{...inputs.insured,email:'not-an-email'}));
 assert.throws(()=>resourceInput('contract',{...inputs.contract,endDate:'2025-01-01'}));
 assert.throws(()=>resourceInput('contract',{...inputs.contract,status:'unknown'}));
 assert.throws(()=>resourceInput('damage',{...inputs.damage,amount:'-4'}));
 assert.throws(()=>resourceInput('expert',{...inputs.expert,admin:true}));
 assert.deepEqual(resourceQuery({page:'2',pageSize:'10',sort:'name',direction:'desc'}),{page:2,pageSize:10,search:'',sort:'name',direction:'desc',filter:'',status:'',type:''});
 assert.throws(()=>resourceQuery({sort:'?evil'}));
});

class MockStore {
 current:ResourceInput|null=null; currentKind:ResourceKind='insured'; revision:string|null=null; deleted=false; referencesBlocked=false; idCollision=false; validReferences=true; duplicateContract=false; calls:{query:string;write:boolean}[]=[];
 async execute(query:string,write=false):Promise<SelectResults>{
  this.calls.push({query,write});
  if(write){const versions=[...query.matchAll(/app:revision\s+"([^"]+)"/g)].map(match=>match[1]!);this.revision=versions.find(value=>value!==this.revision)??versions.at(-1)??null;const insertion=query.slice(query.indexOf('INSERT {'),query.indexOf('WHERE {',query.indexOf('INSERT {')));if(insertion.includes('app:deleted true'))this.deleted=true;else if(query.includes('INSERT {'))this.deleted=false;return {head:{vars:[]},results:{bindings:[]}};}
  if(query.includes('SELECT ?found'))return this.idCollision?this.rows({found:this.term('true')}):this.empty();
  if(query.includes('SELECT ?valid'))return query.includes('FILTER(?r !=')?(this.referencesBlocked?this.rows({valid:this.term('yes')}):this.empty()):query.includes('?other a:numéroContrat')?(this.duplicateContract?this.rows({valid:this.term('yes')}):this.empty()):(!this.validReferences&&(query.includes('rdf:type a:Assuré')||query.includes('rdf:type a:Sinistre')))?this.empty():this.rows({valid:this.term('yes')});
  if(query.includes('SELECT ?revision'))return this.revision?this.rows({revision:this.term(this.revision)}):this.empty();
  if(query.includes('SELECT ?deleted'))return this.deleted?this.rows({deleted:this.term('true')}):this.empty();
  if(query.includes('SELECT ?item')){
   if(!this.current||this.deleted)return this.empty();
   return this.rows({item:{value:`${NS}${this.current.id}`,type:'uri'},name:this.term(this.current.name),identifier:this.term(this.current.identifier),email:this.term(this.current.email),phone:this.term(this.current.phone),address:this.term(this.current.address),type:this.term(this.current.type),status:this.term(this.current.status),startDate:this.term(this.current.startDate),endDate:this.term(this.current.endDate),coverage:this.term(this.current.coverage),specialization:this.term(this.current.specialization),availability:this.term(this.current.availability),description:this.term(this.current.description),amount:this.term(this.current.amount),insured:this.current.insuredId?{value:`${NS}${this.current.insuredId}`,type:'uri'}:undefined,revision:this.revision?this.term(this.revision):undefined});
  }
  return this.empty();
 }
 private term(value:string|undefined):SparqlTerm|undefined{return value?{type:'literal',value}:undefined;}
 private rows(row:Record<string,SparqlTerm|undefined>):SelectResults{return {head:{vars:Object.keys(row)},results:{bindings:[Object.fromEntries(Object.entries(row).filter(([,v])=>v!==undefined)) as Record<string,SparqlTerm>]}};}
 private empty():SelectResults{return {head:{vars:[]},results:{bindings:[]}};}
}
test('all four RDF modules create, read, revise and soft-delete through controlled SPARQL updates',async()=>{
 for(const kind of ['insured','contract','expert','damage'] as const){
  const store=new MockStore();store.current=inputs[kind];store.currentKind=kind;
  const service=new ResourcesService(store,true),input=inputs[kind];
  const created=await service.create(kind,input);assert.equal(created.id,input.id);
  assert.equal((await service.get(kind,input.id)).editable,true);
  const {id,...fields}=input;const updated=await service.update(kind,input.id,{...fields,name:`${input.name} modifié`,revision:created.revision});
  assert.equal((await service.get(kind,input.id)).revision,updated.revision);
  assert.deepEqual(await service.delete(kind,input.id,updated.revision),{id:input.id,deleted:true});
  assert.ok(store.calls.filter(c=>c.write).every(c=>!/(SERVICE|LOAD|CLEAR|DROP)/i.test(c.query)));
  assert.ok(store.calls.some(c=>c.query.includes('app:revision')));
 }
});

test('read-only mode rejects every managed-resource write and revision guards reject stale edits',async()=>{
 const store=new MockStore();store.current=inputs.insured;const readOnly=new ResourcesService(store,false);
 await assert.rejects(readOnly.create('insured',inputs.insured),bad('MUTATIONS_DISABLED'));
 const service=new ResourcesService(store,true),created=await service.create('insured',inputs.insured);
 const {id:_id,...fields}=inputs.insured;await assert.rejects(service.update('insured','INS_NEW',{...fields,revision:rev}),bad('WRITE_CONFLICT'));
 assert.notEqual(created.revision,rev);
});

test('referenced managed resources are protected from deletion in every module',async()=>{
 for(const kind of ['insured','contract','expert','damage'] as const){
  const store=new MockStore();store.current=inputs[kind];const service=new ResourcesService(store,true),created=await service.create(kind,inputs[kind]);
  store.referencesBlocked=true;
  await assert.rejects(service.delete(kind,inputs[kind].id,created.revision),bad('RESOURCE_REFERENCED'));
  assert.equal(store.deleted,false);
 }
});

test('resources without application revision stay read-only in every module',async()=>{
 for(const kind of ['insured','contract','expert','damage'] as const){
  const store=new MockStore();store.current=inputs[kind];store.revision=null;const service=new ResourcesService(store,true),item=await service.get(kind,inputs[kind].id);
  assert.equal(item.editable,false);
  await assert.rejects(service.update(kind,item.id,{name:'Changed',revision:rev}),bad('PROTECTED_RESOURCE'));
  await assert.rejects(service.delete(kind,item.id,rev),bad('PROTECTED_RESOURCE'));
 }
});

test('duplicate identifiers, duplicate contract numbers and broken RDF references stop creation',async()=>{
 const store=new MockStore(),service=new ResourcesService(store,true);
 store.idCollision=true;await assert.rejects(service.create('insured',inputs.insured),bad('DUPLICATE_IDENTIFIER'));
 store.idCollision=false;store.duplicateContract=true;await assert.rejects(service.create('contract',inputs.contract),bad('DUPLICATE_IDENTIFIER'));
 store.duplicateContract=false;store.validReferences=false;
 await assert.rejects(service.create('contract',inputs.contract),bad('INVALID_REFERENCES'));
 await assert.rejects(service.create('damage',{...inputs.damage,claimId:'MISSING'}),bad('INVALID_REFERENCES'));
});
