import type { RequestHandler } from 'express';
import type { ResourceKind } from '../types/resources.js';
import type { ResourcesService } from '../services/resources.service.js';
import { identifier, revision } from '../validators/claims.js';
import { resourceInput } from '../validators/resources.js';

export function resourcesController(service:ResourcesService,kind:ResourceKind):Record<'list'|'options'|'get'|'create'|'update'|'delete',RequestHandler>{
 return {
  list:async(req,res)=>res.json({success:true,data:await service.list(kind,req.query)}),
  options:async(_req,res)=>res.json({success:true,data:await service.options(kind)}),
  get:async(req,res)=>{const record=await service.get(kind,identifier(req.params.id));if(record.revision)res.setHeader('ETag',`"${record.revision}"`);res.json({success:true,data:record});},
  create:async(req,res)=>{const result=await service.create(kind,resourceInput(kind,req.body));res.location(`/api/${kind==='insured'?'insured':kind==='contract'?'contracts':kind==='expert'?'experts':'damages'}/${result.id}`).status(201).json({success:true,data:result});},
  update:async(req,res)=>{const id=identifier(req.params.id);res.json({success:true,data:await service.update(kind,id,req.body)});},
  delete:async(req,res)=>{const id=identifier(req.params.id);res.json({success:true,data:await service.delete(kind,id,revision(req.get('if-match')?.replace(/^"(.*)"$/,'$1')))});},
 };
}
