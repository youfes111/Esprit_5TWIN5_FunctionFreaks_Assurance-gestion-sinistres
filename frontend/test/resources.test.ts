import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('all four business resource routes use the shared managed-resource interface',()=>{
 const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
 for(const [path,kind] of [['contrats','contract'],['assures','insured'],['experts','expert'],['dommages','damage']])assert.match(app,new RegExp(`path="${path}" element={<ResourcesPage kind="${kind}"`));
 const page=readFileSync(new URL('../src/pages/ResourcesPage.tsx',import.meta.url),'utf8');
 for(const label of ['Numéro de contrat','Assuré','Spécialisation','Montant estimé','Date d’expiration'])assert.ok(page.includes(label));
 for(const behavior of ['hasMore','statusFilter','typeFilter','setDeleting','resourcesApi.update','resourcesApi.delete','mutationsEnabled'])assert.ok(page.includes(behavior));
});

test('managed-resource API client targets only fixed CRUD endpoints and uses the shared secure request helper',()=>{
 const source=readFileSync(new URL('../src/services/resources.ts',import.meta.url),'utf8');
 for(const path of ['/insured','/contracts','/experts','/damages'])assert.ok(source.includes(path));
 assert.match(source,/request<.*>\(`\$\{paths\[kind\]\}/);
 assert.match(source,/If-Match/);
 assert.ok(!source.includes('SPARQL'));
});
